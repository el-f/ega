<script lang="ts">
  import type { Component } from 'svelte';

  type IconProp = string | Component<{ size?: number | string; strokeWidth?: number | string }>;

  interface Props {
    /** Short, sentence-case label — "No history entries yet". */
    title: string;
    /** One sentence on why the list is empty and how to fill it. Wraps at ~280px. */
    description?: string;
    /** Lucide Component, or an emoji string. */
    icon?: IconProp;
    /** Renders a primary button when paired with `onCta`. */
    ctaLabel?: string;
    onCta?: () => void;
  }

  let { title, description, icon = '📭', ctaLabel, onCta }: Props = $props();
</script>

<div class="empty" data-ega-empty-state role="status">
  {#if typeof icon !== 'string'}
    {@const IconC = icon}
    <span class="icon icon-lucide" aria-hidden="true">
      <IconC size={32} strokeWidth={1.5} />
    </span>
  {:else if icon.length > 0}
    <div class="icon" aria-hidden="true">{icon}</div>
  {/if}
  <div class="title">{title}</div>
  {#if description}
    <div class="desc">{description}</div>
  {/if}
  {#if ctaLabel && onCta}
    <button type="button" class="cta" onclick={onCta}>{ctaLabel}</button>
  {/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-5);
    color: var(--color-muted);
    text-align: center;
  }
  .icon {
    font-size: var(--fs-2xl);
    line-height: 1;
  }
  .icon-lucide {
    color: var(--color-muted);
    display: inline-flex;
  }
  .title {
    font-size: var(--fs-md);
    color: var(--color-fg);
  }
  .desc {
    font-size: var(--fs-sm);
    max-width: 280px;
    line-height: var(--lh-body);
  }
  .cta {
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border: 0;
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .cta:hover {
    background: var(--color-accent-bg-hover);
    color: var(--color-accent);
  }
</style>
