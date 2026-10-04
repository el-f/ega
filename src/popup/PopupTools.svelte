<script lang="ts">
  import type { Component } from 'svelte';
  import Clipboard from '@lucide/svelte/icons/clipboard';
  import MousePointerSquareDashed from '@lucide/svelte/icons/mouse-pointer-square-dashed';
  import Languages from '@lucide/svelte/icons/languages';
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import Icon from '@/shared/ui/Icon.svelte';

  interface Props {
    onTranslatePage: () => void;
    onPickElement: () => void;
    onClipboard: () => void;
    onOpenSidePanel: () => void;
    pickerEnabled: boolean;
  }

  let { onTranslatePage, onPickElement, onClipboard, onOpenSidePanel, pickerEnabled }: Props =
    $props();

  interface Tile {
    readonly key: 'page' | 'pick' | 'clipboard' | 'panel';
    readonly icon: Component<{ size?: number | string; strokeWidth?: number | string }>;
    readonly label: string;
    readonly aria: string;
    readonly onclick: () => void;
    readonly disabled: boolean;
    /** Always-visible reason for a disabled tile. */
    readonly hint?: string | undefined;
    /** The one action most opens the popup for. */
    readonly primary?: boolean;
  }

  const PICKER_OFF_HINT = 'Turn on in Settings → Selection & picker';

  const tiles = $derived<readonly Tile[]>([
    {
      key: 'page',
      icon: Languages,
      label: 'Translate this page',
      aria: 'Translate this page',
      onclick: onTranslatePage,
      disabled: false,
      primary: true,
    },
    {
      key: 'pick',
      icon: MousePointerSquareDashed,
      label: 'Pick element',
      aria: pickerEnabled ? 'Pick element' : `Pick element — turned off. ${PICKER_OFF_HINT}.`,
      onclick: onPickElement,
      disabled: !pickerEnabled,
      hint: !pickerEnabled ? PICKER_OFF_HINT : undefined,
    },
    {
      key: 'clipboard',
      icon: Clipboard,
      label: 'Translate clipboard',
      aria: 'Translate clipboard contents',
      onclick: onClipboard,
      disabled: false,
    },
    {
      key: 'panel',
      icon: PanelRight,
      label: 'Side panel',
      aria: 'Open side panel',
      onclick: onOpenSidePanel,
      disabled: false,
    },
  ]);
</script>

<div class="popup-tools" data-ega-popup-tools>
  {#each tiles as tile (tile.key)}
    <button
      type="button"
      class="tile"
      class:primary={tile.primary}
      aria-label={tile.aria}
      disabled={tile.disabled}
      onclick={tile.onclick}
    >
      <span class="tile-icon"><Icon icon={tile.icon} size={24} /></span>
      <span class="tile-label">{tile.label}</span>
      {#if tile.hint}
        <span class="tile-hint">{tile.hint}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .popup-tools {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
    padding-top: var(--space-2);
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-2);
    text-align: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }
  .tile.primary {
    grid-column: 1 / -1;
    flex-direction: row;
    padding: var(--space-3);
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .tile.primary .tile-icon,
  .tile.primary .tile-label,
  .tile.primary .tile-hint {
    color: inherit;
  }
  .tile.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }
  .tile:hover:not(:disabled) {
    background: var(--color-bg-hover);
    border-color: var(--color-accent-soft);
  }
  .tile:active:not(:disabled) {
    transform: scale(0.98);
  }
  .tile:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .tile:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .tile-icon {
    display: inline-flex;
    align-items: center;
    color: var(--color-fg);
  }
  .tile-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    line-height: 1.2;
  }
  .tile.primary .tile-label {
    font-weight: 600;
  }
  .tile-hint {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-align: center;
    line-height: 1.3;
  }
</style>
