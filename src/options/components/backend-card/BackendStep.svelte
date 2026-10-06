<script lang="ts">
  /** One numbered step in an open backend row ("1 API key", "2 Model"). Space sets steps apart, not a box. */
  import type { Snippet } from 'svelte';

  interface Props {
    n: number;
    title: string;
    children: Snippet;
  }

  const { n, title, children }: Props = $props();
</script>

<div class="be-step">
  <h3 class="be-step-title"><span class="be-step-num" aria-hidden="true">{n}</span> {title}</h3>
  {@render children()}
</div>

<style>
  .be-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .be-step + :global(.be-step) {
    margin-top: var(--space-4);
  }
  .be-step-title {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .be-step-num {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
