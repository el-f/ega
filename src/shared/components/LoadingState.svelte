<script lang="ts">
  // tokens.css clamps the shimmer keyframe under prefers-reduced-motion.
  interface Props {
    /** How many shimmer bars to stack. */
    rows?: number;
    /** Read by screen readers only. */
    label?: string;
  }

  let { rows = 3, label = 'Loading…' }: Props = $props();
  const rowArr = $derived(Array.from({ length: Math.max(1, rows) }, (_, i) => i));
</script>

<div class="loading" data-ega-loading-state role="status" aria-live="polite" aria-label={label}>
  <span class="ega-sr-only">{label}</span>
  {#each rowArr as i (i)}
    <div class="shimmer-row" aria-hidden="true"></div>
  {/each}
</div>

<style>
  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }
  .shimmer-row {
    height: 14px;
    border-radius: var(--radius-sm);
    background: linear-gradient(
      90deg,
      var(--color-border) 0%,
      var(--color-dot-neutral) 50%,
      var(--color-border) 100%
    );
    background-size: 200% 100%;
    animation: ega-loading-shim 1.2s linear infinite;
  }
  .shimmer-row:nth-child(even) {
    width: 80%;
  }
  .shimmer-row:nth-child(3n) {
    width: 60%;
  }
  @keyframes ega-loading-shim {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
