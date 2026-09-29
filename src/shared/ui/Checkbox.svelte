<script lang="ts">
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
    /** Accent dot beside the label when the setting differs from its default; needs label. */
    modified?: boolean;
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
  }: Props = $props();

  const fallbackId = makeId('ega-checkbox');
  const inputId = $derived(id ?? fallbackId);

  function handleChange(e: Event): void {
    const next = (e.currentTarget as HTMLInputElement).checked;
    checked = next;
    onchange?.(next);
  }
</script>

<label class="ega-checkbox size-{size}" for={inputId}>
  <input
    id={inputId}
    class="ega-checkbox-input"
    type="checkbox"
    {checked}
    aria-label={label ? undefined : ariaLabel}
    onchange={handleChange}
    {...inputAttrs}
  />
  {#if label}
    <span class="ega-checkbox-label">{label}</span>{#if modified}<span
        class="ega-modified-dot"
        data-ega-modified="true"><span class="ega-sr-only">Modified from default</span></span
      >{/if}
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
    line-height: 1.4;
  }
  .size-sm {
    font-size: var(--fs-sm);
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
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    position: relative;
    transition: background-color var(--motion-fast) var(--ease-out);
  }
  .size-sm .ega-checkbox-input {
    width: 14px;
    height: 14px;
  }
  .ega-checkbox-input:hover {
    border-color: var(--color-accent);
  }
  .ega-checkbox-input:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  .ega-checkbox-input:checked {
    background-color: var(--color-accent);
    border-color: var(--color-accent);
    /* Check glyph: inline SVG painted on the bg. Stroke is white because
       --color-accent-fg is always white-on-blue.9/blue.11, both themes. */
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M3.5 8.5l3 3 6-6' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px 12px;
  }
  .ega-checkbox-input:indeterminate {
    background-color: var(--color-accent);
    border-color: var(--color-accent);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M3.5 8h9' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/></svg>");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px 12px;
  }
  .ega-modified-dot {
    display: inline-block;
    width: 4px;
    height: 4px;
    margin-left: var(--space-1);
    border-radius: 50%;
    background: var(--color-accent);
    vertical-align: middle;
  }
</style>
