<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import { downloadTextFile } from '@/shared/download-file';
  // Install runs once per machine, so the whole panel sits behind a disclosure the caller opens.
  import { untrack } from 'svelte';
  import { Tabs } from 'bits-ui';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import type { Platform } from '../nativeHostInstall';

  interface Props {
    /** Disclosure open state. Two-way bound so parent owns persistence. */
    open: boolean;
    /** Heading inside the install-command <summary>. */
    summaryLabel: string;
    /** Detected platform. Drives which command is shown by default. */
    defaultPlatform: Platform;
    /** Install and uninstall scripts per OS; the install script already contains the extension id. */
    commands: Record<
      Platform,
      { install: string; uninstall: string; installerFile: string; installerFilename: string }
    >;
    /** Optional hint shown below the command — usually "click Recheck after". */
    recheckHint?: string;
  }

  let {
    open = $bindable(),
    summaryLabel,
    defaultPlatform,
    commands,
    recheckHint,
  }: Props = $props();

  // `untrack` because a bare `$state(defaultPlatform)` trips state_referenced_locally,
  // and the detected platform cannot change during a session.
  let selectedPlatform: Platform = $state(untrack(() => defaultPlatform));
  /** Show the OS tab strip + sibling commands. Closed by default — most
   *  users want only their own platform. "Show all" is a click away. */
  let showAllPlatforms = $state(false);

  type CopyTag = 'install' | 'uninstall';
  let copied = $state<CopyTag | null>(null);
  let downloaded = $state(false);

  async function copy(text: string, tag: CopyTag): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = tag;
      setTimeout(() => {
        if (copied === tag) copied = null;
      }, 1400);
    } catch (e) {
      debugCatch(e, 'options.components.CollapsibleInstallPanel.1');
    }
  }

  function downloadInstaller(): void {
    const cmd = commands[selectedPlatform];
    downloadTextFile(cmd.installerFilename, cmd.installerFile, 'text/plain');
    downloaded = true;
    setTimeout(() => (downloaded = false), 1400);
  }

  const platforms: Platform[] = ['windows', 'macos', 'linux'];
  const platformLabel: Record<Platform, string> = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
  };
  const installerLabel = $derived(
    selectedPlatform === 'windows' ? '.cmd installer' : '.sh installer',
  );
  const currentCommand = $derived(commands[selectedPlatform]);
</script>

<div class="install-card">
  <details class="install-panel" bind:open data-testid="nh-install-panel">
    <summary class="install-summary">
      <span class="install-summary-chevron" aria-hidden="true"></span>
      <span class="install-summary-label">{summaryLabel}</span>
    </summary>

    <div class="install-body">
      <!-- Hidden until "Show all", so the default surface shows only the user's own platform. -->
      {#if showAllPlatforms}
        <Tabs.Root
          value={selectedPlatform}
          onValueChange={(v) => (selectedPlatform = v as Platform)}
          loop
          activationMode="automatic"
          class="install-tabs-root"
        >
          <div class="install-platform-row">
            <span class="install-row-label">Platform</span>
            <Tabs.List class="install-platform-tabs" aria-label="Install platform">
              {#each platforms as p (p)}
                <Tabs.Trigger
                  value={p}
                  class="install-platform-tab"
                  data-testid="nh-platform-tab-{p}"
                >
                  {platformLabel[p]}
                </Tabs.Trigger>
              {/each}
            </Tabs.List>
          </div>
          <Tabs.Content value={selectedPlatform} tabindex={-1}>
            {@render installCommand()}
          </Tabs.Content>
        </Tabs.Root>
      {:else}
        <div class="install-platform-row">
          <span class="install-row-label">Platform</span>
          <span class="install-platform-current">
            {platformLabel[selectedPlatform]}
            <button
              type="button"
              class="install-show-all"
              onclick={() => (showAllPlatforms = true)}
              data-testid="nh-show-all-platforms"
            >
              Show all
            </button>
          </span>
        </div>
        {@render installCommand()}
      {/if}

      {#snippet installCommand()}
        <!-- Install command — code block with copy. -->
        <div class="install-codeblock" data-testid="nh-install-codeblock">
          <pre class="install-code">{currentCommand.install}</pre>
          <div class="install-code-actions">
            <IconButton
              icon={copied === 'install' ? Check : Copy}
              ariaLabel="Copy install command"
              tooltip={copied === 'install' ? 'Copied' : 'Copy install command'}
              tooltipPlacement="top"
              size="sm"
              variant={copied === 'install' ? 'primary' : 'default'}
              onclick={() => void copy(currentCommand.install, 'install')}
            />
          </div>
        </div>
      {/snippet}

      <div class="install-actions">
        <button type="button" class="primary" onclick={downloadInstaller}>
          {downloaded ? 'Downloaded ✓' : `Download ${installerLabel}`}
        </button>
        {#if recheckHint}<small class="install-hint">{recheckHint}</small>{/if}
      </div>
      {#if selectedPlatform !== 'windows'}
        <small class="install-hint install-run-hint">
          A downloaded file is not executable. Run it with
          <code>bash ~/Downloads/{currentCommand.installerFilename}</code>
        </small>
      {/if}

      <!-- Uninstall command — secondary disclosure, hidden by default. -->
      <details class="install-uninstall">
        <summary class="install-uninstall-summary">
          <span class="install-summary-chevron" aria-hidden="true"></span>
          Uninstall command
        </summary>
        <div class="install-codeblock">
          <pre class="install-code">{currentCommand.uninstall}</pre>
          <div class="install-code-actions">
            <IconButton
              icon={copied === 'uninstall' ? Check : Copy}
              ariaLabel="Copy uninstall command"
              tooltip={copied === 'uninstall' ? 'Copied' : 'Copy uninstall command'}
              tooltipPlacement="top"
              size="sm"
              variant={copied === 'uninstall' ? 'primary' : 'default'}
              onclick={() => void copy(currentCommand.uninstall, 'uninstall')}
            />
          </div>
        </div>
      </details>
    </div>
  </details>
</div>

<style>
  .install-card {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    overflow: hidden;
  }
  .install-card:has(.install-panel[open]) {
    border-color: var(--color-border);
  }
  .install-panel {
    background: var(--color-bg-elevated);
  }
  .install-summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-size: var(--fs-sm);
    color: var(--color-fg);
    user-select: none;
  }
  .install-summary::-webkit-details-marker {
    display: none;
  }
  .install-summary:hover {
    background: var(--color-bg-hover);
  }
  /* A custom chevron, because the platform's default triangle does not theme across light and dark. */
  .install-summary-chevron {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-right: 1.5px solid var(--color-muted);
    border-bottom: 1.5px solid var(--color-muted);
    transform: rotate(-45deg);
    transition: transform var(--motion-fast) var(--ease-out);
  }
  .install-panel[open] > .install-summary > .install-summary-chevron,
  .install-uninstall[open] > .install-uninstall-summary > .install-summary-chevron {
    transform: rotate(45deg);
  }
  .install-summary-label {
    flex: 1 1 auto;
  }
  .install-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
  }
  /* Baseline, not center: the label box is ~11px against a ~28px pill box, so centering drifts the text lines apart. */
  .install-platform-row {
    display: grid;
    grid-template-columns: max-content 1fr;
    align-items: baseline;
    column-gap: var(--space-3);
    row-gap: var(--space-1);
  }
  .install-row-label {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: 1;
  }
  .install-body > :global(.install-tabs-root) {
    display: contents;
  }
  .install-platform-row :global(.install-platform-tabs) {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  .install-platform-row :global(.install-platform-tab) {
    border: 0;
    background: transparent;
    color: var(--color-muted);
    font-size: var(--fs-xs);
    /* Weight is constant across states — bolding only the active tab slides
       the tabs to its right. */
    font-weight: 500;
    padding: 4px var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    line-height: 1;
    min-height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .install-platform-row :global(.install-platform-tab:hover) {
    color: var(--color-fg);
  }
  .install-platform-row :global(.install-platform-tab[data-state='active']) {
    /* bg-hover not bg-elevated — bg-elevated ≈ bg-sunken in dark, active tab disappears */
    background: var(--color-bg-hover);
    color: var(--color-fg);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.15));
  }
  .install-platform-current {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .install-show-all {
    border: 0;
    background: transparent;
    color: var(--color-accent);
    font-size: var(--fs-xs);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .install-show-all:hover {
    color: var(--color-accent);
    opacity: 0.8;
  }
  .install-codeblock {
    position: relative;
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    /* right pad reserves space for the absolutely-positioned copy
       button so its column sits clear of the inner scrollbar */
    padding: var(--space-2) calc(var(--space-3) + 28px) var(--space-2) var(--space-3);
  }
  .install-code {
    margin: 0;
    padding: 0;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.5;
    /* base64 install payload would blow up the card; cap + scroll */
    max-height: 60px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .install-code-actions {
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
  }
  .install-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .install-hint {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .install-run-hint {
    display: block;
    margin-top: var(--space-1);
  }
  .install-uninstall {
    border-top: 1px solid var(--color-border-subtle);
    margin: 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-3));
    padding: 0;
  }
  .install-uninstall-summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-size: var(--fs-xs);
    color: var(--color-muted);
    user-select: none;
  }
  .install-uninstall-summary::-webkit-details-marker {
    display: none;
  }
  .install-uninstall-summary:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .install-uninstall[open] > .install-uninstall-summary {
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .install-uninstall > .install-codeblock {
    margin: var(--space-2) var(--space-3) var(--space-3);
    background: var(--color-bg);
  }
  .install-uninstall > .install-codeblock > .install-code {
    max-height: none;
    overflow-y: visible;
  }
</style>
