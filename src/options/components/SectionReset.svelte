<script lang="ts">
  /** 'Reset section' button, shown only when a field in the section differs from its default. */
  import { tick } from 'svelte';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

  interface Props {
    /** True when any tracked field differs from default. Computed by
     *  caller against DEFAULT_SETTINGS so the primitive stays generic. */
    modified: boolean;
    onReset: () => void | Promise<void>;
    ariaLabel?: string;
    /** Visible text, when the reset covers less than the whole section. */
    label?: string;
  }

  const {
    modified,
    onReset,
    ariaLabel = 'Reset section to defaults',
    label = 'Reset section',
  }: Props = $props();

  let button = $state<HTMLButtonElement | null>(null);

  // The pill hides once nothing differs; unless the card put focus somewhere itself, it goes to the card title.
  async function reset(): Promise<void> {
    const title = button?.closest('section')?.querySelector<HTMLElement>('h2[tabindex="-1"]');
    await onReset();
    await tick();
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (button?.isConnected !== true && lost) title?.focus();
  }
</script>

{#if modified}
  <button
    type="button"
    class="section-reset"
    data-ega-section-reset
    aria-label={ariaLabel}
    data-tooltip={ariaLabel}
    data-tooltip-placement="top"
    bind:this={button}
    onclick={() => void reset()}
  >
    <RotateCcw size={14} aria-hidden="true" />
    <span>{label}</span>
  </button>
{/if}

<style>
  .section-reset {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    padding: 0 var(--space-2);
    background: transparent;
    color: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    cursor: pointer;
    transition:
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  /* Beside Done in a dialog footer, every button is 32px tall (spec 5.0 rule 7). */
  :global(.ega-dialog-actions) .section-reset {
    min-height: 32px;
  }
  /* Focus keeps the page-wide 2px ring, so it never looks like a hover. */
  .section-reset:hover {
    color: var(--color-accent);
    background: var(--color-bg-hover);
  }
</style>
