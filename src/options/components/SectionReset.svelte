<script lang="ts">
  /** 'Reset section' button, shown only when a field in the section differs from its default. */
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
</script>

{#if modified}
  <button
    type="button"
    class="section-reset"
    data-ega-section-reset
    aria-label={ariaLabel}
    data-tooltip={ariaLabel}
    data-tooltip-placement="top"
    onclick={() => void onReset()}
  >
    <RotateCcw size={12} aria-hidden="true" />
    <span>{label}</span>
  </button>
{/if}

<style>
  .section-reset {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px var(--space-2);
    background: transparent;
    color: var(--color-muted);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-pill);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    cursor: pointer;
    transition:
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .section-reset:hover,
  .section-reset:focus-visible {
    color: var(--color-accent);
    border-color: var(--color-border);
    background: var(--color-bg-hover);
    outline: none;
  }
</style>
