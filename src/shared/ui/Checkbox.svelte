<script lang="ts">
  import type { Snippet } from 'svelte';
  import { id as makeId } from '@/shared/uuid';

  type Size = 'sm' | 'md';

  interface Props {
    checked: boolean;
    /** Accessible name when no <label> is rendered. Tests + a11y tooling
     *  rely on this to target the underlying <input>. */
    ariaLabel?: string;
    /** Optional inline label. When set, the box + label render as a row
     *  and clicking the label toggles the box (native <label> wiring). */
    label?: string;
    id?: string;
    size?: Size;
    /** Pass-through attrs on the underlying <input>. Used for e2e hooks
     *  and behavioral attrs that can't ride on Props. */
    inputAttrs?: Record<string, string | boolean | number | null | undefined>;
    onchange?: (checked: boolean) => void;
    /** The word "Changed" after the label when the setting differs from its default; needs label. */
    modified?: boolean;
    /** Stays focusable and announced, but does not toggle; pair it with describedBy pointing at the visible reason. */
    ariaDisabled?: boolean;
    /** Id of visible text that describes the box (a hint or the reason it cannot change). */
    describedBy?: string;
    /** A label with markup in it, when `label` is not set. */
    children?: Snippet;
  }

  let {
    checked = $bindable(),
    ariaLabel,
    label,
    id,
    size = 'md',
    inputAttrs = {},
    onchange,
    modified = false,
    ariaDisabled = false,
    describedBy,
    children,
  }: Props = $props();

  const fallbackId = makeId('ega-checkbox');
  const inputId = $derived(id ?? fallbackId);
  const changedId = $derived(`${inputId}-changed`);
  // The word is kept out of the name (tests and screen readers match the label) and read as the description.
  const describedByIds = $derived(
    [modified && label ? changedId : null, describedBy ?? null].filter(Boolean).join(' ') ||
      undefined,
  );

  function blockWhenAriaDisabled(e: Event): void {
    if (ariaDisabled) e.preventDefault();
  }

  function handleChange(e: Event): void {
    const next = (e.currentTarget as HTMLInputElement).checked;
    checked = next;
    onchange?.(next);
  }
</script>

<label class="ega-checkbox size-{size}" class:aria-disabled={ariaDisabled} for={inputId}>
  <input
    id={inputId}
    class="ega-checkbox-input"
    type="checkbox"
    {checked}
    aria-label={label || children ? undefined : ariaLabel}
    aria-disabled={ariaDisabled ? 'true' : undefined}
    aria-describedby={describedByIds}
    onclick={blockWhenAriaDisabled}
    onchange={handleChange}
    {...inputAttrs}
  />
  {#if label}
    <span class="ega-checkbox-label">{label}</span>{#if modified}<span
        class="ega-changed"
        id={changedId}
        aria-hidden="true"
        data-ega-modified="true">Changed</span
      >{/if}
  {:else if children}
    <span class="ega-checkbox-label">{@render children()}</span>
  {/if}
</label>

<style>
  /* appearance:none with a CSS check: Windows paints a light native check that ignores dark theme. */
  .ega-checkbox {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    color: var(--color-fg);
    font-family: var(--font-ui);
    line-height: var(--lh-body);
  }
  .size-sm {
    font-size: var(--fs-base);
  }
  .size-md {
    font-size: var(--fs-base);
  }
  .ega-checkbox-input {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin: 0;
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    position: relative;
    transition: background-color var(--motion-fast) var(--ease-out);
  }
  .size-sm .ega-checkbox-input {
    width: 14px;
    height: 14px;
  }
  .ega-checkbox-input:hover:not(:disabled) {
    border-color: var(--color-accent);
  }
  .ega-checkbox:has(.ega-checkbox-input:disabled),
  .ega-checkbox-input:disabled {
    cursor: var(--cursor-disabled);
  }
  .ega-checkbox-input:disabled {
    opacity: 0.6;
  }
  .ega-checkbox-input:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  .ega-checkbox-input:checked,
  .ega-checkbox-input:indeterminate {
    background-color: var(--color-accent);
    border-color: var(--color-accent);
  }
  /* The glyph is a mask painted in --color-accent-fg, which is dark on the dark theme's bright blue. */
  .ega-checkbox-input:checked::after,
  .ega-checkbox-input:indeterminate::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: var(--color-accent-fg);
    -webkit-mask: var(--ega-check-glyph) center / 12px 12px no-repeat;
    mask: var(--ega-check-glyph) center / 12px 12px no-repeat;
  }
  .ega-checkbox-input:checked {
    --ega-check-glyph: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M3.5 8.5l3 3 6-6' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  }
  .ega-checkbox-input:indeterminate {
    --ega-check-glyph: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M3.5 8h9' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'/></svg>");
  }
  /* High Contrast forces background-color to Canvas, which would paint the mask glyph invisible. */
  @media (forced-colors: active) {
    .ega-checkbox-input:checked::after,
    .ega-checkbox-input:indeterminate::after {
      forced-color-adjust: none;
      background-color: CanvasText;
    }
  }
  .ega-changed {
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .aria-disabled {
    cursor: var(--cursor-disabled);
  }
  .aria-disabled .ega-checkbox-input {
    opacity: 0.6;
    cursor: var(--cursor-disabled);
  }
</style>
