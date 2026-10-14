<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Whether the body is expanded. Two-way bindable so parents can react to user clicks. */
    open?: boolean;
    /** Text label shown in the summary row. */
    title: string;
    /** Optional id stamped onto the <details> as data-backend-id for querying. */
    backendId?: string;
    /** Raw toggle event — fires on every open/close. Use to capture explicit user intent. */
    ontoggle?: (e: Event) => void;
    status?: Snippet;
    actions?: Snippet;
    children?: Snippet;
    /** A row inside a list card: no box of its own, so text sits inside the card's border only. */
    flat?: boolean;
  }

  let {
    open = $bindable(false),
    title,
    backendId,
    ontoggle,
    status,
    actions,
    children,
    flat = false,
  }: Props = $props();
</script>

<details class="cc-root" class:flat bind:open data-backend-id={backendId ?? null} {ontoggle}>
  <summary class="cc-summary">
    <span class="cc-chevron" aria-hidden="true"></span>
    <span class="cc-title">{title}</span>
    {#if status}
      <span class="cc-status">{@render status()}</span>
    {/if}
    {#if actions}
      <span class="cc-actions">{@render actions()}</span>
    {/if}
  </summary>
  <div class="cc-body">
    {#if children}{@render children()}{/if}
  </div>
</details>

<style>
  .cc-root {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    transition: border-color 150ms ease;
  }
  .cc-root[open] {
    border-color: var(--color-accent-soft);
  }
  .cc-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .cc-root.flat {
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .cc-root.flat > .cc-summary {
    flex-wrap: wrap;
    padding: var(--space-3) 0;
    min-height: 44px;
  }
  .cc-root.flat > .cc-body {
    padding: 0 0 var(--space-4);
    border-top: 0;
  }
  .cc-summary:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
  .cc-summary::-webkit-details-marker {
    display: none;
  }
  .cc-chevron {
    width: 10px;
    height: 10px;
    border-right: 2px solid var(--color-muted);
    border-bottom: 2px solid var(--color-muted);
    transform: rotate(-45deg);
    transition: transform 150ms ease;
    margin-right: 2px;
  }
  .cc-root[open] .cc-chevron {
    transform: rotate(45deg);
  }
  .cc-title {
    font-size: var(--fs-base);
    font-weight: 600;
    flex: 0 1 auto;
    min-width: 0;
  }
  .cc-status {
    flex: 0 1 auto;
    margin-left: auto;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .cc-actions {
    flex: 0 0 auto;
  }
  .cc-body {
    padding: 0 var(--space-3) var(--space-3);
    border-top: 1px solid var(--color-border);
  }
</style>
