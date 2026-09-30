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
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import ModelCombobox from './ModelCombobox.svelte';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Info from '@lucide/svelte/icons/info';
  import Tooltip from '@/shared/ui/Tooltip.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
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
  import { listNativeModels, probeNativeCli } from '../nativeHostOnce';
  import {
    NATIVE_CLI_REGISTRY,
    DEFAULT_NATIVE_CLI,
    isKnownNativeCli,
  } from '@/shared/native-cli-registry';

  interface Props {
    settings: Settings;
    disabled: boolean;
    routeIsText?: boolean;
    routeIsImage?: boolean;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
    onPatchModel: (id: keyof Settings['model'], v: string) => Promise<void> | void;
  }

  let {
    settings,
    disabled,
    routeIsText = false,
    routeIsImage = false,
    onPatch,
    onPatchModel,
  }: Props = $props();

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
  let cliPresence: Record<string, string | null> = $state({});

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
      cliPresence = {};
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
      cliPresence = await probeNativeCli(settings.localBackendTimeoutMs);
    } catch {
      cliPresence = {};
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
      return 'The host crashed at start. Check that Node.js is on PATH, then run the install command again.';
    }
    return '';
  }

  const currentCli = $derived(
    isKnownNativeCli(settings.nativeCli) ? settings.nativeCli : DEFAULT_NATIVE_CLI,
  );
  const currentCliEntry = $derived(NATIVE_CLI_REGISTRY.find((c) => c.id === currentCli));
  // A host below v11 leaves cliPresence empty, so this stays null.
  const missingCli = $derived.by(() => {
    if (!Object.prototype.hasOwnProperty.call(cliPresence, currentCli)) return null;
    if (cliPresence[currentCli] !== null) return null;
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

  const portVariant = $derived<'default' | 'success' | 'warning' | 'danger' | 'muted'>(
    portStatus === 'warm'
      ? 'success'
      : portStatus === 'connecting'
        ? 'warning'
        : portStatus === 'disconnected'
          ? 'danger'
          : 'muted',
  );
  const portLabel = $derived(
    portStatus === 'warm'
      ? 'Warm — fast'
      : portStatus === 'connecting'
        ? 'Connecting…'
        : portStatus === 'disconnected'
          ? 'Disconnected'
          : 'Cold — the first translation starts the CLI',
  );

  // The Tooltip primitive is `pre-line`, so single newlines render as line breaks.
  const NATIVE_INSTALL_INFO =
    'Native install creates a native messaging host so the extension can run the local Claude / Codex CLI on your machine without API keys.\n\nSteps:\n- Detect Node.js (>= 20 required).\n- Write a manifest file Chrome, Edge, Brave and Chromium look up by extension id.\n- Copy ega-host.mjs to a known runtime path.\n- Check that the host answers.\n\nUninstall removes the manifest + runtime files; the CLI itself stays.';
</script>

<BackendCard
  id={asBackendIdUnsafe('native')}
  label="Native host (Claude Code / Codex)"
  {settings}
  {disabled}
  {routeIsText}
  {routeIsImage}
>
  <div class="nh-body">
    <div class="row nh-status-row">
      {#if currentCli === 'codex' && portStatus !== 'disconnected'}
        <Badge variant="muted" dot>One process per translation</Badge>
      {:else}
        <Badge variant={portVariant} dot>{portLabel}</Badge>
      {/if}
      <span
        class="nh-pill"
        class:nh-installed={nhState === 'installed'}
        class:nh-outdated={nhState === 'outdated'}
        class:nh-missing={nhState === 'missing'}
        class:nh-probing={nhState === 'probing'}
        data-testid="nh-status-pill"
        role="status"
        aria-live="polite"
      >
        <span class="nh-pill-dot" aria-hidden="true"></span>
        <span class="nh-pill-label">
          {#if nhState === 'installed'}Installed <span class="nh-pill-version"
              >v{nhInstalledVersion}</span
            >{:else if nhState === 'outdated'}Outdated{:else if nhState === 'probing'}Checking…{:else}Not
            installed{/if}
        </span>
      </span>
      <IconButton
        icon={RefreshCw}
        ariaLabel={nhState === 'probing' ? 'Checking the native host…' : 'Recheck'}
        tooltip="Recheck"
        size="sm"
        disabled={nhState === 'probing'}
        onclick={() => void recheckNative(true)}
      />
      <Tooltip text={NATIVE_INSTALL_INFO} side="bottom">
        {#snippet trigger()}
          <span
            class="nh-info-btn"
            aria-label="About native install"
            data-ega-install-info={NATIVE_INSTALL_INFO}
            data-testid="nh-install-info"
          >
            <Icon icon={Info} size={16} />
          </span>
        {/snippet}
      </Tooltip>
    </div>

    {#if justRecovered}
      <div class="ok nh-status-msg" role="status" data-testid="nh-recovered-banner">
        Now reachable. Ega will use your local CLI.
      </div>
    {/if}

    {#if nhState === 'installed'}
      <div class="row nh-cli-row">
        <span class="nh-cli-label" id="nh-cli-label">CLI</span>
        <RadioGroup
          name="nh-cli"
          orientation="horizontal"
          value={currentCli}
          options={NATIVE_CLI_REGISTRY.map((entry) => ({
            value: entry.id,
            label: entry.label,
            // Empty cliPresence (host below v11, or a failed probe) leaves the description blank.
            ...(Object.prototype.hasOwnProperty.call(cliPresence, entry.id) &&
            cliPresence[entry.id] === null
              ? { description: 'Not found on PATH' }
              : {}),
          }))}
          onValueChange={(next) => void onPatch({ nativeCli: next })}
          dataAttrs={{ 'aria-labelledby': 'nh-cli-label' }}
        />
      </div>
      {#if missingCli}
        <div class="warn nh-status-msg" role="status" data-testid="nh-cli-missing-banner">
          {missingCli.label} CLI is not on the native host's PATH. Install it (and restart your browser
          if needed) before translating.
        </div>
      {/if}
      <div class="nh-model-row">
        <span class="nh-model-label" id="nh-model-label">Model (optional)</span>
        {#if nhState === 'installed'}
          <ModelCombobox
            value={settings.model.native ?? ''}
            placeholder="e.g. claude-sonnet-4-5"
            options={discoveredModels}
            loading={discoverLoading}
            error={discoverError}
            onValueChange={(next) => void onPatchModel('native', next)}
            onDiscover={() => void refreshModels()}
          />
        {:else}
          <input
            id="nh-model"
            type="text"
            dir="auto"
            class="nh-model-input"
            placeholder="e.g. claude-sonnet-4-5"
            value={settings.model.native ?? ''}
            oninput={(e) =>
              void onPatchModel('native', (e.currentTarget as HTMLInputElement).value)}
            aria-labelledby="nh-model-label"
          />
        {/if}
        {#if currentCliEntry?.modelDiscoveryHint}
          <small class="nh-model-hint">{currentCliEntry.modelDiscoveryHint}</small>
        {/if}
      </div>
    {:else if nhState === 'outdated'}
      <div class="warn nh-status-msg">
        Native host is installed but out of date (got
        <b>v{nhInstalledVersion ?? '?'}</b>, this build expects
        <b>v{EXPECTED_HOST_VERSION}</b>). Re-run the install command.
      </div>
    {:else if nhState === 'missing' && nhProbeError}
      <div class="warn nh-status-msg" role="status">
        <div class="nh-err-line">
          <b>Chrome reported:</b>
          <code class="nh-err-msg" title={nhProbeError}>{nhProbeError}</code>
        </div>
        {#if nhErrorHint(nhProbeError)}
          <span class="nh-err-hint">{nhErrorHint(nhProbeError)}</span>
        {/if}
      </div>
    {/if}

    <CollapsibleInstallPanel
      bind:open={nhInstallOpen}
      summaryLabel={nhState === 'installed'
        ? 'Reinstall / view install command'
        : nhState === 'outdated'
          ? 'Update command (install again to get the fixes)'
          : 'View install command'}
      defaultPlatform={nhPlatform}
      commands={nhCommands}
      recheckHint={nhState !== 'installed'
        ? `Then click Recheck (the refresh icon above). The status should change to Installed v${EXPECTED_HOST_VERSION}.`
        : ''}
    />
  </div>
</BackendCard>

<style>
  .nh-body {
    display: grid;
    gap: var(--space-2);
  }
  .nh-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 3px var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--fs-xs);
    line-height: 1.2;
    border: 1px solid var(--color-border);
    background: var(--color-bg-elevated);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .nh-pill-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-dot-idle);
    flex: 0 0 6px;
  }
  .nh-pill-version {
    color: var(--color-muted);
    font-size: var(--fs-xs);
    margin-left: 2px;
    opacity: 0.85;
  }
  .nh-pill.nh-installed {
    background: var(--color-success-bg-deep);
    color: var(--color-success-fg);
    border-color: var(--color-success);
  }
  .nh-pill.nh-installed .nh-pill-dot {
    background: var(--color-success);
  }
  .nh-pill.nh-installed .nh-pill-version {
    color: var(--color-success-fg);
  }
  .nh-pill.nh-outdated {
    background: var(--color-warning-bg-deep);
    color: var(--color-warning-fg);
    border-color: var(--color-warning-border);
  }
  .nh-pill.nh-outdated .nh-pill-dot {
    background: var(--color-warning);
  }
  .nh-pill.nh-missing {
    background: var(--color-danger-bg-deep);
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
  .nh-pill.nh-missing .nh-pill-dot {
    background: var(--color-danger);
  }
  .nh-pill.nh-probing {
    background: var(--color-bg-hover);
    color: var(--color-muted);
  }
  .nh-pill.nh-probing .nh-pill-dot {
    background: var(--color-accent);
    animation: nh-pill-pulse 1.2s ease-in-out infinite;
  }
  @keyframes nh-pill-pulse {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(0.85);
    }
    50% {
      opacity: 1;
      transform: scale(1.15);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nh-pill.nh-probing .nh-pill-dot {
      animation: none;
    }
  }
  .nh-status-row {
    margin-top: var(--space-2);
  }
  /* Matches IconButton size-sm (28x28) so the trigger does not change the row height. */
  .nh-info-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-subtle);
    cursor: help;
  }
  .nh-info-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .nh-status-msg {
    margin-top: var(--space-2);
  }
  .nh-cli-row {
    margin-top: var(--space-2);
    gap: var(--space-2);
  }
  .nh-cli-label {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .nh-err-line {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    max-width: 100%;
  }
  .nh-err-line b {
    flex: 0 0 auto;
  }
  .nh-err-msg {
    display: inline-block;
    flex: 1 1 auto;
    min-width: 0;
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--color-bg-sunken);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .nh-err-hint {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: 1.4;
  }
  .nh-model-row {
    display: grid;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }
  .nh-model-label {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .nh-model-input {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-fg);
  }
  .nh-model-hint {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
</style>
