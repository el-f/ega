<script lang="ts">
  /** A status pill: sentence case, an optional icon plus a word. No coloured dot; the word carries the state. */
  import type { Component, Snippet } from 'svelte';

  type Variant = 'default' | 'success' | 'warning' | 'danger' | 'muted';
  type LucideIcon = Component<{ size?: number | string; strokeWidth?: number | string }>;

  interface Props {
    children: Snippet;
    variant?: Variant;
    icon?: LucideIcon;
    dataAttrs?: Record<string, string | number | boolean | undefined>;
  }

  let { children, variant = 'default', icon, dataAttrs }: Props = $props();
</script>

<span class="ega-badge variant-{variant}" {...dataAttrs ?? {}}>
  {#if icon}
    {@const IconC = icon}
    <span class="ega-badge-icon" aria-hidden="true"><IconC size={14} strokeWidth={2} /></span>
  {/if}
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
  .ega-badge-icon {
    display: inline-flex;
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
