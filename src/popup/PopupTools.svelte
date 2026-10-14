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
  }

  let {
    onTranslatePage,
    onChooseAreas,
    onPickElement,
    onClipboard,
    onOpenSidePanel,
    pickerEnabled,
    pageBlockedBy,
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

  // One tab stop for the icon toolbar; aria-disabled actions stay reachable.
  let active = $state(0);
  let buttons: HTMLButtonElement[] = $state([]);

  function onKeydown(e: KeyboardEvent): void {
    const last = rows.length - 1;
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = active === last ? 0 : active + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = active === 0 ? last : active - 1;
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

<div class="popup-tool-grid">
  <button
    type="button"
    class="row page-action"
    data-ega-popup-primary
    aria-label="Translate page"
    data-tooltip="Translate page"
    data-tooltip-placement="bottom"
    aria-disabled={pageBlockedBy !== undefined ? 'true' : undefined}
    aria-describedby={pageBlockedBy}
    onclick={() => {
      if (pageBlockedBy === undefined) onTranslatePage();
    }}
  >
    <span class="row-icon"><Icon icon={Languages} size={16} /></span>
  </button>

  <div
    class="tools"
    role="toolbar"
    aria-orientation="horizontal"
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
        aria-label={row.label}
        data-tooltip={row.trailing ? `${row.label} (${row.trailing})` : row.label}
        data-tooltip-placement={i === rows.length - 1 ? 'bottom-end' : 'bottom'}
        data-ega-tool={row.key}
        tabindex={i === active ? 0 : -1}
        aria-disabled={row.blockedBy !== undefined ? 'true' : undefined}
        aria-describedby={row.blockedBy}
        onfocus={() => (active = i)}
        onclick={() => run(row)}
      >
        <span class="row-icon"><Icon icon={row.icon} size={16} /></span>
        <span class="ega-sr-only">{row.label}</span>
        {#if row.trailing}
          <span class="ega-sr-only">{row.trailing}</span>
        {/if}
      </button>
    {/each}
  </div>
</div>
{#if !pickerEnabled}
  <p id={PICKER_OFF_ID} class="ega-sr-only">
    The element picker is off. Turn it on in Settings → {TAB_LABELS['selection-bubble']}.
  </p>
{/if}

<style>
  .popup-tool-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 4fr);
    gap: var(--space-2);
  }
  .page-action:hover::after,
  .page-action:focus-visible::after {
    position: absolute;
    left: 0;
    transform: none;
  }
  .row:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .tools {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .tools:focus {
    outline: none;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    block-size: 40px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
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
  @media (forced-colors: active) {
    .row {
      border-color: ButtonText;
    }
  }
</style>
