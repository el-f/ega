<script lang="ts">
  import { untrack } from 'svelte';
  import type { MetaItem } from '@/shared/reply-meta';

  interface Props {
    items: readonly MetaItem[];
    /** A text button after the status item: "Stop" while reading aloud, or "Ask instead". The only control the line holds. */
    statusAction?:
      { label: string; onclick: () => void; kind?: 'stop' | 'ask-instead' } | undefined;
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
    for (const p of parts) hide(p, false);
    const box = el.getBoundingClientRect();
    for (const p of parts) {
      const r = p.getBoundingClientRect();
      if (r.top > box.top + 1 || r.right > box.right + 0.5) hide(p, true);
    }
  }

  /** A hidden item's button leaves the tab order too: Tab must not land on a control no one can see. */
  function hide(p: HTMLElement, hidden: boolean): void {
    p.classList.toggle('ega-sr-only', hidden);
    for (const b of p.querySelectorAll('button')) {
      if (hidden) b.tabIndex = -1;
      else b.removeAttribute('tabindex');
    }
  }

  // Another kind is another button, so a focused Stop never turns into "Ask instead" under the user's finger.
  const actionKind = $derived(statusAction === undefined ? null : (statusAction.kind ?? 'stop'));
  let actionHadFocus = false;
  $effect.pre(() => {
    void actionKind;
    const a = document.activeElement;
    actionHadFocus =
      a !== null && a === untrack(() => line)?.querySelector('.ega-reply-meta-action');
  });
  // The button that had focus is gone, so focus goes to the reply around the line, not to the page.
  $effect(() => {
    void actionKind;
    if (!actionHadFocus) return;
    actionHadFocus = false;
    const a = document.activeElement;
    if (a === null || a === document.body) line?.closest<HTMLElement>('article')?.focus();
  });

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
    <span
      class="ega-reply-meta-item"
      class:warn={item.warn === true}
      data-ega-meta-item={item.key}
      data-ega-direction={item.key === 'direction' ? '' : undefined}
      >{item.text}{#if item.key === 'status' && statusAction}<span
          class="ega-reply-meta-sep"
          aria-hidden="true">·</span
        >{#key actionKind}<button
            type="button"
            class="ega-reply-meta-action"
            data-ega-meta-stop={statusAction.kind === 'ask-instead' ? undefined : ''}
            data-ega-ask-instead={statusAction.kind === 'ask-instead' ? '' : undefined}
            onclick={statusAction.onclick}>{statusAction.label}</button
          >{/key}{/if}</span
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
  /* The same dot and gaps as between items. */
  .ega-reply-meta-sep {
    padding-inline: var(--space-1);
  }
  /* The padding keeps the inset focus ring off the glyphs; the margin takes it back, so it adds no gap. */
  .ega-reply-meta-action {
    margin-inline: calc(-1 * var(--space-1));
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
