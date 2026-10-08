<script lang="ts">
  import type { MetaItem } from '@/shared/reply-meta';

  interface Props {
    items: readonly MetaItem[];
    /** A text button after the status item, e.g. "Stop" while reading aloud. The only control the line holds. */
    statusAction?: { label: string; onclick: () => void } | undefined;
  }

  const { items, statusAction }: Props = $props();

  let line: HTMLElement | undefined = $state();

  /**
   * Hides, whole, each item that does not fit on the one line (spec §1.3/§5.2), in order, so a shorter item after it
   * still shows. A clipped second line cannot do this: an item wider than the line wraps inside itself, and its first
   * words ("→ Chinese" for "→ Chinese (Traditional)") name the wrong thing. Hidden items stay in the accessibility tree.
   */
  function fit(el: HTMLElement): void {
    const parts = [...el.querySelectorAll<HTMLElement>('[data-ega-meta-item]')];
    for (const p of parts) p.classList.remove('ega-sr-only');
    const box = el.getBoundingClientRect();
    for (const p of parts) {
      const r = p.getBoundingClientRect();
      if (r.top > box.top + 1 || r.right > box.right + 0.5) p.classList.add('ega-sr-only');
    }
  }

  $effect(() => {
    // Read before the guard, so a new item list or a Stop button re-fits the line.
    void items;
    void statusAction;
    const el = line;
    if (!el) return;
    fit(el);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit(el));
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

<p class="ega-reply-meta" dir="ltr" data-ega-reply-meta bind:this={line}>
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
  /* No ellipsis and no wrap inside an item: one that does not fit is hidden whole. */
  .ega-reply-meta-item {
    flex-shrink: 0;
    white-space: nowrap;
  }
  /* The dot belongs to the item after it, so a hidden item takes its dot with it. */
  .ega-reply-meta-item:not(:global(.ega-sr-only))
    ~ .ega-reply-meta-item:not(:global(.ega-sr-only))::before {
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
