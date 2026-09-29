<script lang="ts">
  /** Reset arrow, shown only when the value differs from the inherited one. */

  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

  interface Props {
    differsFromInherited: boolean;
    onReset: () => void | Promise<void>;
    ariaLabel: string;
    inheritedLabel?: string;
  }

  const { differsFromInherited, onReset, ariaLabel, inheritedLabel }: Props = $props();
</script>

{#if differsFromInherited}
  <button
    type="button"
    class="reset-field"
    data-ega-reset-field
    aria-label={ariaLabel}
    {...inheritedLabel ? { 'data-tooltip': inheritedLabel, 'data-tooltip-placement': 'top' } : {}}
    onclick={() => void onReset()}
  >
    <RotateCcw size={14} aria-hidden="true" />
  </button>
{/if}

<style>
  .reset-field {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-fg-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .reset-field:hover,
  .reset-field:focus-visible {
    color: var(--color-accent);
    border-color: var(--color-border);
    background: var(--color-bg-hover);
    outline: none;
  }
</style>
