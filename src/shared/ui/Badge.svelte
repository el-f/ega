<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'default' | 'success' | 'warning' | 'danger' | 'muted';

  interface Props {
    children: Snippet;
    variant?: Variant;
    dot?: boolean;
  }

  let { children, variant = 'default', dot = false }: Props = $props();
</script>

<span class="ega-badge variant-{variant}">
  {#if dot}<span class="ega-badge-dot" aria-hidden="true"></span>{/if}
  {@render children()}
</span>

<style>
  .ega-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 1px var(--space-2);
    font-size: var(--fs-xs);
    font-weight: 500;
    border-radius: var(--radius-pill);
    line-height: 1.4;
  }
  .ega-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .variant-default {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
  }
  .variant-success {
    background: var(--color-success-bg-soft);
    color: var(--color-success-fg);
  }
  .variant-warning {
    background: var(--color-warning-bg-soft);
    color: var(--color-warning-fg);
  }
  .variant-danger {
    background: var(--color-danger-bg-soft);
    color: var(--color-danger-fg);
  }
  .variant-muted {
    background: var(--color-bg-sunken);
    color: var(--color-muted);
  }
</style>
