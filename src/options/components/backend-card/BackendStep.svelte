<script lang="ts">
  /** One numbered section in an expanded backend card. */
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
  <div class="be-step-content">{@render children()}</div>
</div>

<style>
  .be-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  .be-step + :global(.be-step) {
    margin-block-start: var(--space-5);
    padding-block-start: var(--space-4);
    border-block-start: 1px solid var(--color-border-subtle);
  }
  .be-step-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
    padding-inline-start: var(--space-6);
  }
  .be-step-title {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-md);
    font-weight: 600;
  }
  .be-step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--space-5);
    inline-size: var(--space-5);
    block-size: var(--space-5);
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent-hover);
    font-size: var(--fs-base);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 640px) {
    .be-step-content {
      padding-inline-start: 0;
    }
  }
</style>
