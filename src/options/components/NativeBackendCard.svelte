<script lang="ts" module>
  // Module scope, so the install panel keeps its open state across a tab switch; a reload resets it.
  let savedNhInstallOpen = false;
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Settings } from '@/shared/types';
  import { asBackendIdUnsafe } from '@/shared/brands';
  import BackendCard from './BackendCard.svelte';
  import CollapsibleInstallPanel from './CollapsibleInstallPanel.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import ModelCombobox from './ModelCombobox.svelte';
  import SettingHint from './SettingHint.svelte';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import InfoTip from '@/shared/ui/InfoTip.svelte';
  import Disclosure from './Disclosure.svelte';
  import type { PortStatus } from '@/shared/cli-session/port-manager';
  import { sendMsg } from '@/shared/messages';
  import {
    detectPlatform,
    installCommandFor,
    installerFileFor,
    installerFilenameFor,
    uninstallCommandFor,
    EXPECTED_HOST_VERSION,
    type Platform,
  } from '../nativeHostInstall';
  import { probeNativeHost } from '../probeNativeHost';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { listNativeModels, probeNativeCli, type CliProbe } from '../nativeHostOnce';
  import {
    NATIVE_CLI_REGISTRY,
    DEFAULT_NATIVE_CLI,
    isKnownNativeCli,
  } from '@/shared/native-cli-registry';

  interface Props {
    settings: Settings;
    disabled: boolean;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
    onPatchModel: (id: keyof Settings['model'], v: string) => Promise<void> | void;
  }

  let { settings, disabled, onPatch, onPatchModel }: Props = $props();

  const extId = chrome.runtime.id;
  const nhPlatform: Platform = detectPlatform();

  type NhRaw = 'idle' | 'probing' | 'installed' | 'outdated' | 'not_installed' | 'error';
  let nhRaw: NhRaw = $state('idle');
  let nhInstalledVersion: number | undefined = $state(undefined);
  let nhProbeError: string | undefined = $state(undefined);

  let discoveredModels: string[] = $state([]);
  let discoverLoading = $state(false);
  let discoverError: string | null = $state(null);
  // cli id → resolved path | null.
  let cliProbe: CliProbe = $state({ cli: {}, loggedIn: {} });

  // lastDiscoverKey is a plain let, not $state — a tracked key would re-arm this effect forever.
  let lastDiscoverKey = '';
  $effect(() => {
    const cli = settings.nativeCli;
    const version = nhInstalledVersion;
    if (nhRaw !== 'installed' || version === undefined) {
      discoveredModels = [];
      discoverError = null;
      lastDiscoverKey = '';
      return;
    }
    const key = `${cli}|${version}`;
    if (key === lastDiscoverKey) return;
    lastDiscoverKey = key;
    void refreshModels();
  });

  // The result is registry-scoped, not per-CLI, so a settings.nativeCli change must not refetch.
  $effect(() => {
    const version = nhInstalledVersion;
    if (nhRaw !== 'installed' || version === undefined) {
      cliProbe = { cli: {}, loggedIn: {} };
      return;
    }
    // untracked: refreshCliPresence reads settings synchronously, which would re-probe on every patch.
    void untrack(() => refreshCliPresence());
  });

  // Generation, not a re-entrancy flag: the newest call wins and older ones drop their result.
  let discoverGen = 0;
  async function refreshModels(): Promise<void> {
    const myGen = ++discoverGen;
    discoverLoading = true;
    discoverError = null;
    try {
      const list = await listNativeModels(settings.nativeCli, settings.localBackendTimeoutMs);
      if (myGen !== discoverGen) return;
      discoveredModels = list;
    } catch (e) {
      if (myGen !== discoverGen) return;
      discoverError = (e as Error).message;
    } finally {
      if (myGen === discoverGen) discoverLoading = false;
    }
  }

  async function refreshCliPresence(): Promise<void> {
    try {
      cliProbe = await probeNativeCli(settings.localBackendTimeoutMs);
    } catch {
      cliProbe = { cli: {}, loggedIn: {} };
    }
  }

  let nhInstallOpen = $state(savedNhInstallOpen);
  $effect(() => {
    savedNhInstallOpen = nhInstallOpen;
  });

  const nhState: 'probing' | 'installed' | 'outdated' | 'missing' = $derived.by(() => {
    if (nhRaw === 'idle' || nhRaw === 'probing') return 'probing';
    if (nhRaw === 'outdated') return 'outdated';
    if (nhRaw !== 'installed') return 'missing';
    if (nhInstalledVersion === undefined) return 'outdated';
    return nhInstalledVersion < EXPECTED_HOST_VERSION ? 'outdated' : 'installed';
  });

  // Every recheck flips through 'probing', so recovery is judged against the last settled state.
  let lastSettledNhState: 'installed' | 'outdated' | 'missing' | null = $state(null);
  let justRecovered = $state(false);
  // One handle, so every effect run clears the timeout an earlier run left pending.
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const current = nhState;
    if (current === 'probing') return () => {};
    const prev = untrack(() => lastSettledNhState);
    lastSettledNhState = current;
    if (current === 'installed' && (prev === 'missing' || prev === 'outdated')) {
      justRecovered = true;
      // Collapse the install panel on recovery even if the user opened it by hand.
      nhInstallOpen = false;
      recoveryTimer = setTimeout(() => {
        justRecovered = false;
        recoveryTimer = null;
      }, 3500);
    }
    // Svelte runs this before every re-run, not only on destroy.
    return () => {
      if (recoveryTimer !== null) {
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
      }
      justRecovered = false;
    };
  });

  $effect(() => {
    void settings.localBackendTimeoutMs;
    if (untrack(() => nhRaw) === 'idle') return;
    void recheckNative();
  });

  type NhCommand = {
    install: string;
    uninstall: string;
    installerFile: string;
    installerFilename: string;
  };
  // Getters, not a literal: each entry base64s the whole bundled host source.
  const nhCommandCache: Partial<Record<Platform, NhCommand>> = {};
  function commandsFor(p: Platform): NhCommand {
    const hit = nhCommandCache[p];
    if (hit) return hit;
    const built: NhCommand = {
      install: installCommandFor(p, extId),
      uninstall: uninstallCommandFor(p),
      installerFile: installerFileFor(p, extId),
      installerFilename: installerFilenameFor(p),
    };
    nhCommandCache[p] = built;
    return built;
  }
  const nhCommands: Record<Platform, NhCommand> = {
    get windows() {
      return commandsFor('windows');
    },
    get macos() {
      return commandsFor('macos');
    },
    get linux() {
      return commandsFor('linux');
    },
  };

  // Generation guard: an older slow probe must not overwrite a newer result.
  let nhProbeGen = 0;
  async function recheckNative(fresh = false): Promise<void> {
    const myGen = ++nhProbeGen;
    nhRaw = 'probing';
    nhProbeError = undefined;
    let r: Awaited<ReturnType<typeof probeNativeHost>>;
    try {
      r = await probeNativeHost(settings.localBackendTimeoutMs, { fresh });
    } catch (e) {
      r = { status: 'error', errorMessage: e instanceof Error ? e.message : String(e) };
    }
    if (myGen !== nhProbeGen) return;
    nhInstalledVersion = r.installedVersion;
    nhProbeError = r.errorMessage;
    nhRaw = r.status;
  }

  function nhErrorHint(msg: string | undefined): string {
    if (!msg) return '';
    if (/forbidden|allowed_origins/i.test(msg)) {
      return `Chrome rejected this extension id (${extId}). Run the install command again.`;
    }
    if (/not found|does not exist/i.test(msg)) {
      return 'The registry entry is missing. Quit and restart the browser, then click Recheck.';
    }
    if (/exit|crashed|terminated/i.test(msg)) {
      return 'The native host stopped as it started. Check that Node.js 20 or later is installed, then run the install command again.';
    }
    return '';
  }

  const currentCli = $derived(
    isKnownNativeCli(settings.nativeCli) ? settings.nativeCli : DEFAULT_NATIVE_CLI,
  );
  const currentCliEntry = $derived(NATIVE_CLI_REGISTRY.find((c) => c.id === currentCli));
  const missingCli = $derived.by(() => {
    if (!Object.prototype.hasOwnProperty.call(cliProbe.cli, currentCli)) return null;
    if (cliProbe.cli[currentCli] !== null) return null;
    return currentCliEntry ?? null;
  });

  onMount(() => {
    void recheckNative();
  });

  // Polls the background SW: the options page has its own port-manager copy that always reads 'cold'.
  let portStatus = $state<PortStatus>('cold');
  const PORT_POLL_MS = 5000;
  $effect(() => {
    // Nothing to probe, and the round-trip would also keep the SW awake.
    if (nhState === 'missing' || disabled) {
      return () => {};
    }
    let cancelled = false;
    let handle: ReturnType<typeof setInterval> | null = null;
    const tick = async (): Promise<void> => {
      try {
        const reply = await sendMsg({ kind: 'native:get-port-status' });
        if (cancelled) return;
        if (reply?.ok) portStatus = reply.status;
      } catch {
        /* SW asleep — leaves previous status until next tick */
      }
    };
    // A hidden options tab has nobody reading the chip, and every poll wakes the worker.
    const park = (): void => {
      if (handle !== null) clearInterval(handle);
      handle = null;
    };
    const run = (): void => {
      if (handle !== null) return;
      void tick();
      handle = setInterval(() => void tick(), PORT_POLL_MS);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') run();
      else park();
    };

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      park();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

  // How the next answer starts; it means something only once the host is installed.
  const portLine = $derived(
    currentCli === 'codex' && portStatus !== 'disconnected'
      ? 'Codex starts once per translation'
      : portStatus === 'warm'
        ? 'The CLI is running, so answers start fast'
        : portStatus === 'connecting'
          ? 'Starting the CLI...'
          : portStatus === 'disconnected'
            ? 'The CLI stopped; the next translation starts it again'
            : 'The first translation starts the CLI',
  );

  const NATIVE_INSTALL_INFO =
    'The install command adds a small helper that lets Chrome run the Claude Code or Codex CLI on this computer, with no API key. It needs Node.js 20 or later; uninstall removes the helper and keeps the CLI.';
</script>

<BackendCard id={asBackendIdUnsafe('native')} label={backendLabel('native')} {settings}>
  <!-- The CLI choice appears only once the probe says installed, so the search lands on the section that holds both it and the install status. -->
  <div class="nh-body" data-ega-setting="backends.nativeCli">
    <!-- One status in words: the row header already carries the pill (one pill per row, spec 3.4). -->
    <div class="nh-status-row">
      <span
        class="nh-status"
        class:nh-installed={nhState === 'installed'}
        class:nh-outdated={nhState === 'outdated'}
        class:nh-missing={nhState === 'missing'}
        class:nh-probing={nhState === 'probing'}
        data-testid="nh-status-pill"
        role="status"
        aria-live="polite"
        >{#if nhState === 'installed'}Installed, version {nhInstalledVersion}{:else if nhState === 'outdated'}Version
          {nhInstalledVersion ?? '?'} is installed; Ega needs version {EXPECTED_HOST_VERSION}{:else if nhState === 'probing'}Checking...{:else}Not
          installed on this computer{/if}</span
      >
      <IconButton
        icon={RefreshCw}
        ariaLabel={nhState === 'probing' ? 'Checking the native host…' : 'Recheck'}
        tooltip="Recheck"
        size="sm"
        disabled={nhState === 'probing'}
        onclick={() => void recheckNative(true)}
      />
      <InfoTip label="About the native host install" text={NATIVE_INSTALL_INFO} />
    </div>

    {#if justRecovered}
      <div class="ok nh-status-msg" role="status" data-testid="nh-recovered-banner">
        Now reachable. Ega will use your local CLI.
      </div>
    {/if}

    {#if nhState === 'installed'}
      <p class="nh-line">{portLine}</p>
      <div class="row nh-cli-row">
        <span class="nh-cli-label" id="nh-cli-label">CLI</span>
        <RadioGroup
          name="nh-cli"
          orientation="horizontal"
          value={currentCli}
          options={NATIVE_CLI_REGISTRY.map((entry) => ({
            value: entry.id,
            label: entry.label,
            // A failed probe leaves both maps empty, so the description stays blank.
            ...(Object.prototype.hasOwnProperty.call(cliProbe.cli, entry.id) &&
            cliProbe.cli[entry.id] === null
              ? { description: 'Not found' }
              : cliProbe.loggedIn[entry.id] === false
                ? { description: 'Not logged in' }
                : {}),
          }))}
          onValueChange={(next) =>
            // A model id belongs to one CLI; the other CLI would reject it.
            void onPatch({ nativeCli: next, model: { ...settings.model, native: '' } })}
          dataAttrs={{ 'aria-labelledby': 'nh-cli-label' }}
        />
      </div>
      {#if missingCli}
        <div class="warn nh-status-msg" data-testid="nh-cli-missing-banner">
          <p class="nh-msg-title" role="status">
            {missingCli.label} was not found on this computer
          </p>
          <Disclosure label="Show steps">
            <p class="nh-steps">
              Install {missingCli.label}, then restart Chrome and click Recheck. The native host
              looks for it in the folders on your PATH.
            </p>
          </Disclosure>
        </div>
      {:else if cliProbe.loggedIn[currentCli] === false && currentCliEntry}
        <div class="warn nh-status-msg" data-testid="nh-cli-logged-out-banner">
          <p class="nh-msg-title" role="status">{currentCliEntry.label} is not logged in</p>
          <Disclosure label="Show steps">
            <p class="nh-steps">
              Run <code>{currentCliEntry.loginCommand}</code> in a terminal once and log in, then click
              Recheck.
            </p>
          </Disclosure>
        </div>
      {/if}
      <div class="nh-model-row">
        <span class="nh-model-label" id="nh-model-label">Model (optional)</span>
        <ModelCombobox
          value={settings.model.native ?? ''}
          placeholder={currentCliEntry?.modelPlaceholder ?? ''}
          options={discoveredModels}
          loading={discoverLoading}
          error={discoverError}
          onValueChange={(next) => void onPatchModel('native', next)}
          onDiscover={() => void refreshModels()}
        />
        {#if currentCliEntry?.modelDiscoveryHint}
          <small class="nh-model-hint">{currentCliEntry.modelDiscoveryHint}</small>
        {/if}
      </div>
    {:else if nhState === 'missing' && nhProbeError}
      <div class="warn nh-status-msg">
        <p class="nh-msg-title" role="status">
          {nhErrorHint(nhProbeError) || 'Chrome could not start the native host.'}
        </p>
        <Disclosure label="Details">
          <p class="nh-steps">Chrome reported: <code>{nhProbeError}</code></p>
        </Disclosure>
      </div>
    {/if}

    <CollapsibleInstallPanel
      bind:open={nhInstallOpen}
      summaryLabel={nhState === 'installed'
        ? 'Reinstall or uninstall'
        : nhState === 'outdated'
          ? 'Show update steps'
          : 'Show install steps'}
      defaultPlatform={nhPlatform}
      commands={nhCommands}
      recheckHint={nhState !== 'installed'
        ? `Then press Recheck (the refresh icon above). The status should change to Installed, version ${EXPECTED_HOST_VERSION}.`
        : ''}
    />

    <div class="prewarm-row" data-testid="prewarm-native-toggle">
      <Checkbox
        checked={settings.preWarmNative !== false}
        label="Start the native host with Chrome"
        describedBy="ega-prewarm-hint"
        onchange={(next) => void onPatch({ preWarmNative: next })}
        inputAttrs={{ 'data-ega-setting': 'backends.preWarmNative' }}
      />
      <SettingHint setting="backends.preWarmNative" id="ega-prewarm-hint" indent />
    </div>
  </div>
</BackendCard>

<style>
  .prewarm-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nh-body {
    display: grid;
    gap: var(--space-2);
  }
  .nh-status {
    color: var(--color-fg);
  }
  .nh-line {
    margin: 0;
    color: var(--color-muted);
  }
  .nh-status-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    margin-top: var(--space-2);
  }
  .nh-status-msg {
    margin-top: var(--space-2);
  }
  .nh-msg-title {
    margin: 0;
  }
  .nh-steps {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .nh-cli-row {
    margin-top: var(--space-2);
    gap: var(--space-2);
  }
  .nh-cli-label {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .nh-model-row {
    display: grid;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }
  .nh-model-label {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .nh-model-hint {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
</style>
