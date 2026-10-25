<script lang="ts">
  /** A status pill: sentence case, a word that carries the state. No coloured dot. A pill with an icon draws it in its
   *  children (BackendCardStatus), so the icon size has one owner. */
  import type { Snippet } from 'svelte';

  type Variant = 'default' | 'success' | 'warning' | 'danger' | 'muted';

  interface Props {
    children: Snippet;
    variant?: Variant;
    dataAttrs?: Record<string, string | number | boolean | undefined>;
  }

  let { children, variant = 'default', dataAttrs }: Props = $props();
</script>

<span class="ega-badge variant-{variant}" {...dataAttrs ?? {}}>
  {@render children()}
</span>

<style>
  .ega-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-2);
    min-height: 20px;
    font-size: var(--fs-base);
    font-weight: 400;
    border-radius: var(--radius-pill);
    border: 1px solid transparent;
    line-height: var(--lh-body);
    white-space: nowrap;
  }
  .variant-default {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border-color: var(--color-border);
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
