<script lang="ts" generics="T extends string">
  /** Pick one of two or three large choices, each a card with a label and one line (and an optional picture). */
  import type { Snippet } from 'svelte';

  interface Choice {
    value: T;
    label: string;
    hint: string;
  }

  interface Props {
    value: T;
    choices: readonly Choice[];
    onchange: (next: T) => void;
    ariaLabel?: string;
    ariaLabelledby?: string;
    /** Drawn above each card's label, e.g. a small picture of the mode. */
    visual?: Snippet<[T, boolean]>;
    dataAttrs?: Record<string, string | number | boolean | undefined>;
    /** Data attribute on each card with its value, for tests and deep links. */
    itemAttr: string;
  }

  const {
    value,
    choices,
    onchange,
    ariaLabel,
    ariaLabelledby,
    visual,
    dataAttrs,
    itemAttr,
  }: Props = $props();

  function pick(next: T): void {
    if (next !== value) onchange(next);
  }

  function onKeydown(e: KeyboardEvent): void {
    const idx = choices.findIndex((c) => c.value === value);
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % choices.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + choices.length) % choices.length;
    else return;
    e.preventDefault();
    const target = choices[next];
    if (target === undefined) return;
    pick(target.value);
    (e.currentTarget as HTMLElement)
      .querySelector<HTMLElement>(`[${itemAttr}="${target.value}"]`)
      ?.focus();
  }
</script>

<!-- tabindex -1: roving focus lives on the radios; the group only delegates the arrow keys. -->
<div
  class="choice-cards"
  role="radiogroup"
  aria-label={ariaLabel}
  aria-labelledby={ariaLabelledby}
  tabindex="-1"
  onkeydown={onKeydown}
  {...dataAttrs ?? {}}
>
  {#each choices as c (c.value)}
    {@const active = value === c.value}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabindex={active ? 0 : -1}
      class="choice-card"
      class:active
      {...{ [itemAttr]: c.value }}
      onclick={() => pick(c.value)}
    >
      {#if visual}{@render visual(c.value, active)}{/if}
      <span class="choice-label">{c.label}</span>
      <span class="choice-hint">{c.hint}</span>
    </button>
  {/each}
</div>

<style>
  .choice-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-3);
  }
  .choice-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    text-align: start;
    font-family: var(--font-ui);
    cursor: pointer;
    transition:
      border-color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .choice-card:hover:not(.active) {
    border-color: var(--color-control-border);
  }
  .choice-card.active {
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
  }
  .choice-card:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .choice-label {
    font-size: var(--fs-base);
    font-weight: 600;
    line-height: var(--lh-heading);
  }
  .choice-hint {
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .choice-card {
      transition: none;
    }
  }
</style>
