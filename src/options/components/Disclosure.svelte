<script lang="ts">
  /** A 32px "> Label" row that shows or hides a group of settings; the one look for every disclosure. */
  import type { Snippet } from 'svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  interface Props {
    label: string;
    children: Snippet;
    open?: boolean;
    dataAttrs?: Record<string, string | number | boolean | undefined>;
  }

  let { label, children, open = $bindable(false), dataAttrs }: Props = $props();
</script>

<details class="ega-disclosure" bind:open {...dataAttrs ?? {}}>
  <summary class="ega-disclosure-summary">
    <span class="ega-disclosure-chevron" aria-hidden="true"
      ><ChevronRight size={16} strokeWidth={1.75} /></span
    >
    {label}
  </summary>
  <div class="ega-disclosure-body">{@render children()}</div>
</details>

<style>
  .ega-disclosure {
    margin: 0;
  }
  .ega-disclosure-summary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 32px;
    padding-inline-end: var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-fg);
    font-size: var(--fs-base);
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .ega-disclosure-summary::-webkit-details-marker {
    display: none;
  }
  .ega-disclosure-summary:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ega-disclosure-chevron {
    display: inline-flex;
    color: var(--color-muted);
    transition: transform var(--motion-fast) var(--ease-out);
  }
  .ega-disclosure[open] .ega-disclosure-chevron {
    transform: rotate(90deg);
  }
  .ega-disclosure-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .ega-disclosure-chevron {
      transition: none;
    }
  }
</style>
