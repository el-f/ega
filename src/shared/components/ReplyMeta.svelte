<script lang="ts">
  import type { MetaItem } from '@/shared/reply-meta';

  interface Props {
    items: readonly MetaItem[];
    /** A text button after the status item, e.g. "Stop" while reading aloud. The only control the line holds. */
    statusAction?: { label: string; onclick: () => void } | undefined;
  }

  const { items, statusAction }: Props = $props();
</script>

<!-- One line: an item that does not fit wraps onto the clipped second line and disappears whole. -->
<p class="ega-reply-meta" dir="ltr" data-ega-reply-meta>
  {#each items as item (item.key)}
    <span class="ega-reply-meta-item" class:warn={item.warn === true} data-ega-meta-item={item.key}
      >{item.text}{#if item.key === 'status' && statusAction}<button
          type="button"
          class="ega-reply-meta-action"
          data-ega-meta-stop
          onclick={statusAction.onclick}>{statusAction.label}</button
        >{/if}</span
    >
  {/each}
</p>

<style>
  .ega-reply-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    margin: 0;
    block-size: 1lh;
    overflow: hidden;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  /* No ellipsis: an item moves whole to the clipped line, and one wider than the line wraps at a word. */
  .ega-reply-meta-item {
    min-width: 0;
    max-inline-size: 100%;
  }
  /* The dot belongs to the item after it, so a clipped item takes its dot with it. */
  .ega-reply-meta-item + .ega-reply-meta-item::before {
    content: '·';
    padding-inline: var(--space-1);
  }
  .ega-reply-meta-item.warn {
    color: var(--color-warning-fg);
  }
  /* The inline padding keeps the inset focus ring off the glyphs. */
  .ega-reply-meta-action {
    margin-inline-start: var(--space-1);
    padding: 0 var(--space-1);
    border: 0;
    background: none;
    font: inherit;
    color: var(--color-accent);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  /* The one-line clip cuts anything outside the button, so the ring sits inside it. */
  .ega-reply-meta-action:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
</style>
