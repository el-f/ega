<script lang="ts" generics="T extends string">
  import { id } from '@/shared/uuid';

  type Size = 'sm' | 'md';

  interface Option {
    value: T;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    value: T;
    options: readonly Option[];
    label?: string;
    /** Accessible name when no visible label is rendered. Lets a11y tooling
     *  + tests target the underlying <select> via getByLabel(...). */
    ariaLabel?: string;
    size?: Size;
    /** Class on the <select> itself, for caller-specific sizing. */
    selectClass?: string;
    /** Extra attributes on the <select>, e.g. data-ega-task-select for e2e. */
    selectAttrs?: Record<string, string | boolean | number | null | undefined>;
    /** The native event rides along so a caller can tell a real change from one a page dispatched. */
    onchange?: (value: T, event: Event) => void;
    /** Accent dot beside the label when the setting differs from its default; needs label. */
    modified?: boolean;
  }

  let {
    value = $bindable(),
    options,
    label,
    ariaLabel,
    size = 'md',
    selectClass = '',
    selectAttrs = {},
    onchange,
    modified = false,
  }: Props = $props();

  const selectId = id('ega-select');

  function handleChange(e: Event): void {
    const v = (e.target as HTMLSelectElement).value as T;
    value = v;
    onchange?.(v, e);
  }
</script>

<div class="ega-select-wrap size-{size}">
  {#if label}
    <label class="ega-select-label" for={selectId}
      >{label}{#if modified}<span class="ega-modified-dot" data-ega-modified="true"
          ><span class="ega-sr-only">Modified from default</span></span
        >{/if}</label
    >
  {/if}
  <select
    id={selectId}
    class={`ega-select ${selectClass}`.trim()}
    aria-label={label ? undefined : ariaLabel}
    {value}
    onchange={handleChange}
    {...selectAttrs}
  >
    {#each options as opt (opt.value)}
      <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
    {/each}
  </select>
</div>

<style>
  .ega-select-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ega-select-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    font-weight: 500;
  }
  /* appearance:none, or the OS control ignores dark theme; the data-URI chevron cannot read CSS vars, so its color swaps per theme. */
  .ega-select {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    background-color: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-ui);
    line-height: 1.4;
    cursor: pointer;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%23b0b4ba' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right var(--space-2) center;
    background-size: 12px 12px;
    /* color-scheme themes the native option list; dark matches the tokens.css default. */
    color-scheme: dark;
  }
  .ega-select::-ms-expand {
    display: none;
  }
  .size-sm .ega-select {
    padding: var(--space-1) calc(var(--space-2) + 14px) var(--space-1) var(--space-2);
    font-size: var(--fs-sm);
  }
  .size-md .ega-select {
    padding: var(--space-2) calc(var(--space-2) + 16px) var(--space-2) var(--space-3);
    font-size: var(--fs-base);
  }
  .ega-select:hover {
    background-color: var(--color-bg-hover);
  }
  .ega-select:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
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
  /* Matches both :host([data-theme=light]) and [data-theme=light], like tokens.css. */
  :global([data-theme='light']) .ega-select,
  :global(:host([data-theme='light'])) .ega-select {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%2360646c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    color-scheme: light;
  }
  /* Light by OS preference, when no explicit theme attr forces dark. */
  @media (prefers-color-scheme: light) {
    :global(:root:not([data-theme='dark'])) .ega-select,
    :global(:host(:not([data-theme='dark']))) .ega-select {
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%2360646c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
      color-scheme: light;
    }
  }
  /* Explicit dark attr — beat the OS-light fallback inside light hosts. */
  :global([data-theme='dark']) .ega-select,
  :global(:host([data-theme='dark'])) .ega-select {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%23b0b4ba' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    color-scheme: dark;
  }
</style>
