<script lang="ts">
  /** The one empty-state look: icon, one title line, at most one body line, at most one action. */
  import type { Component } from 'svelte';
  import Button from '@/shared/ui/Button.svelte';

  type IconProp = string | Component<{ size?: number | string; strokeWidth?: number | string }>;

  interface Props {
    /** Short, sentence-case label — "No history entries yet". */
    title: string;
    /** One sentence on why the list is empty and how to fill it. */
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
      <IconC size={24} strokeWidth={1.5} />
    </span>
  {:else if icon.length > 0}
    <div class="icon" aria-hidden="true">{icon}</div>
  {/if}
  <div class="title">{title}</div>
  {#if description}
    <div class="desc">{description}</div>
  {/if}
  {#if ctaLabel && onCta}
    <div class="cta-row">
      <Button variant="primary" extraClass="cta" onclick={onCta}>{ctaLabel}</Button>
    </div>
  {/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-5) var(--space-4);
    color: var(--color-muted);
    text-align: center;
  }
  .icon {
    font-size: var(--fs-xl);
    line-height: 1;
  }
  .icon-lucide {
    color: var(--color-muted);
    display: inline-flex;
  }
  .title {
    font-size: var(--fs-md);
    font-weight: 600;
    line-height: var(--lh-heading);
    color: var(--color-fg);
  }
  /* The 80ch line cap of every description (spec 1.1); a narrower cap broke one-sentence bodies onto two lines. */
  .desc {
    font-size: var(--fs-base);
    max-inline-size: 80ch;
    line-height: var(--lh-body);
  }
  .cta-row {
    margin-top: var(--space-2);
  }
</style>
