<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    children: Snippet;
  }
  const { children }: Props = $props();
</script>

<kbd class="ega-kbd">{@render children()}</kbd>

<style>
  .ega-kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    padding: 1px 6px;
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    font-weight: 600;
    line-height: 1.3;
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: 0 1px 0 var(--color-border);
    vertical-align: baseline;
  }
</style>
