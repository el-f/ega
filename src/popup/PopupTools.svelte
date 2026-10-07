<script lang="ts">
  import type { Component } from 'svelte';
  import Clipboard from '@lucide/svelte/icons/clipboard';
  import MousePointerSquareDashed from '@lucide/svelte/icons/mouse-pointer-square-dashed';
  import SquareDashed from '@lucide/svelte/icons/square-dashed';
  import Languages from '@lucide/svelte/icons/languages';
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import Icon from '@/shared/ui/Icon.svelte';
  import { TAB_LABELS } from '@/shared/settings-tabs';

  interface Props {
    onTranslatePage: () => void;
    onChooseAreas: () => void;
    onPickElement: () => void;
    onClipboard: () => void;
    onOpenSidePanel: () => void;
    pickerEnabled: boolean;
    /** Id of the visible text that says why the page actions cannot run here. */
    pageBlockedBy?: string | undefined;
    /** The setup card holds the filled button, so the main action steps down to the secondary look. */
    quietPrimary?: boolean;
  }

  let {
    onTranslatePage,
    onChooseAreas,
    onPickElement,
    onClipboard,
    onOpenSidePanel,
    pickerEnabled,
    pageBlockedBy,
    quietPrimary = false,
  }: Props = $props();

  const PICKER_OFF_ID = 'ega-popup-picker-off';

  interface Row {
    readonly key: 'areas' | 'pick' | 'clipboard' | 'panel';
    readonly icon: Component<{ size?: number | string; strokeWidth?: number | string }>;
    readonly label: string;
    readonly onclick: () => void;
    /** Id of the visible reason; set means the row is aria-disabled. */
    readonly blockedBy: string | undefined;
    readonly trailing?: string | undefined;
  }

  const rows = $derived<readonly Row[]>([
    {
      key: 'areas',
      icon: SquareDashed,
      label: 'Choose areas',
      onclick: onChooseAreas,
      blockedBy: pageBlockedBy,
    },
    {
      key: 'pick',
      icon: MousePointerSquareDashed,
      label: 'Pick element',
      onclick: onPickElement,
      blockedBy: pageBlockedBy ?? (pickerEnabled ? undefined : PICKER_OFF_ID),
      trailing: pickerEnabled ? undefined : 'Off in Settings',
    },
    {
      key: 'clipboard',
      icon: Clipboard,
      label: 'Translate clipboard',
      onclick: onClipboard,
      blockedBy: undefined,
    },
    {
      key: 'panel',
      icon: PanelRight,
      label: 'Open side panel',
      onclick: onOpenSidePanel,
      blockedBy: undefined,
    },
  ]);

  // One tab stop for the list; the arrow keys move inside it. aria-disabled rows stay reachable.
  let active = $state(0);
  let buttons: HTMLButtonElement[] = $state([]);

  function onKeydown(e: KeyboardEvent): void {
    const last = rows.length - 1;
    let next: number;
    if (e.key === 'ArrowDown') next = active === last ? 0 : active + 1;
    else if (e.key === 'ArrowUp') next = active === 0 ? last : active - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;
    e.preventDefault();
    active = next;
    buttons[next]?.focus();
  }

  function run(row: Row): void {
    if (row.blockedBy === undefined) row.onclick();
  }
</script>

<button
  type="button"
  class="primary"
  class:blocked={pageBlockedBy !== undefined}
  class:quiet={quietPrimary}
  data-ega-popup-primary
  aria-disabled={pageBlockedBy !== undefined ? 'true' : undefined}
  aria-describedby={pageBlockedBy}
  onclick={() => {
    if (pageBlockedBy === undefined) onTranslatePage();
  }}
>
  <Icon icon={Languages} size={20} />
  <span>Translate page</span>
</button>

<div
  class="tools"
  role="toolbar"
  aria-orientation="vertical"
  aria-label="Page tools"
  tabindex="-1"
  data-ega-popup-tools
  onkeydown={onKeydown}
>
  {#each rows as row, i (row.key)}
    <button
      bind:this={buttons[i]}
      type="button"
      class="row"
      data-ega-tool={row.key}
      tabindex={i === active ? 0 : -1}
      aria-disabled={row.blockedBy !== undefined ? 'true' : undefined}
      aria-describedby={row.blockedBy}
      onfocus={() => (active = i)}
      onclick={() => run(row)}
    >
      <span class="row-icon"><Icon icon={row.icon} size={20} /></span>
      <span class="row-label">{row.label}</span>
      {#if row.trailing}
        <span class="row-trailing">{row.trailing}</span>
      {/if}
    </button>
  {/each}
</div>
{#if !pickerEnabled}
  <p id={PICKER_OFF_ID} class="ega-sr-only">
    The element picker is off. Turn it on in Settings → {TAB_LABELS['selection-bubble']}.
  </p>
{/if}

<style>
  .primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 40px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font: inherit;
    font-size: var(--fs-base);
    font-weight: 600;
    cursor: pointer;
  }
  .primary:hover:not(.blocked, .quiet) {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }
  .primary.quiet {
    background: var(--color-bg-elevated);
    border-color: var(--color-control-border);
    color: var(--color-fg);
  }
  .primary.quiet:hover {
    background: var(--color-bg-hover);
  }
  /* A blocked primary takes the secondary look, so the setup card's button stays the only filled one. */
  .primary.blocked {
    background: transparent;
    border-color: var(--color-control-border);
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  .primary:focus-visible,
  .row:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .tools {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .tools:focus {
    outline: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    /* 32, not the spec's 36: with 36 the first-run popup (no backend, page not running) passes Chrome's 600px cap. */
    min-height: 32px;
    padding: 0 var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-fg);
    font: inherit;
    font-size: var(--fs-base);
    text-align: start;
    cursor: pointer;
  }
  .row:hover:not([aria-disabled='true']) {
    background: var(--color-bg-hover);
  }
  .row[aria-disabled='true'] {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  .row-icon {
    display: inline-flex;
    color: var(--color-muted);
  }
  .row[aria-disabled='true'] .row-icon {
    color: var(--color-fg-disabled);
  }
  .row-label {
    flex: 1 1 auto;
    white-space: nowrap;
  }
  .row-trailing {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  @media (forced-colors: active) {
    .row {
      border-color: ButtonText;
    }
  }
</style>
