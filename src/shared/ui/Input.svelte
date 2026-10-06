<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { id } from '@/shared/uuid';

  type InputType = 'text' | 'password' | 'number' | 'email' | 'url' | 'search';
  type Size = 'sm' | 'md';

  interface Props {
    value: string | number;
    label?: string;
    /** Used only when no visible `label` is set — a label already names the input. */
    ariaLabel?: string;
    type?: InputType;
    size?: Size;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    /** Character cap the stored field enforces — set it wherever the schema has one. */
    maxlength?: number;
    oninput?: (e: Event) => void;
    onblur?: (e: FocusEvent) => void;
    onkeydown?: (e: KeyboardEvent) => void;
    /** id for the <input>, so a caller's own `<label for>` can name it. */
    id?: string;
    /** Inline icon at the start of the input (Lucide-style component slot). */
    leading?: Snippet;
    /** When true, an X button appears inside the input on hover when value is non-empty. */
    clearable?: boolean;
    /** Pass-through `data-*` attributes for the inner input. */
    dataAttrs?: Record<string, string | number | boolean | undefined>;
    /** Applied to the input itself so screen readers announce expanded state. */
    comboboxProps?: {
      role: 'combobox';
      'aria-expanded': boolean;
      'aria-haspopup': 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog' | boolean;
      'aria-controls': string;
      'aria-activedescendant'?: string;
    };
  }

  let {
    value = $bindable(),
    label,
    ariaLabel,
    type = 'text',
    size = 'md',
    placeholder,
    disabled = false,
    required = false,
    maxlength,
    oninput,
    onblur,
    onkeydown,
    id: ownId,
    leading,
    clearable = false,
    dataAttrs,
    comboboxProps,
  }: Props = $props();

  const fallbackId = id('ega-input');
  const inputId = $derived(ownId ?? fallbackId);

  function handleClear(): void {
    value = '';
  }
</script>

<div class="ega-input-wrap size-{size}" class:is-disabled={disabled}>
  {#if label}
    <label class="ega-input-label" for={inputId}>{label}{required ? ' *' : ''}</label>
  {/if}
  <div class="ega-input-row">
    {#if leading}<span class="ega-input-leading" aria-hidden="true">{@render leading()}</span>{/if}
    <input
      id={inputId}
      class="ega-input"
      {type}
      bind:value
      {placeholder}
      {disabled}
      {required}
      {maxlength}
      dir="auto"
      aria-required={required ? 'true' : undefined}
      aria-label={!label && ariaLabel ? ariaLabel : undefined}
      {oninput}
      {onblur}
      {onkeydown}
      {...dataAttrs ?? {}}
      {...comboboxProps ?? {}}
    />
    {#if clearable && value !== '' && value !== undefined && !disabled}
      <button
        type="button"
        class="ega-input-clear"
        aria-label="Clear {label ?? 'input'}"
        onclick={handleClear}
      >
        <X size={14} strokeWidth={2} />
      </button>
    {/if}
  </div>
</div>

<style>
  .ega-input-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ega-input-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    font-weight: 500;
  }
  .ega-input-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    transition:
      border-color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out);
  }
  .ega-input-row:focus-within {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  .ega-input {
    flex: 1 1 auto;
    background: transparent;
    color: var(--color-fg);
    border: 0;
    outline: none;
    font-family: var(--font-ui);
    min-width: 0;
  }
  .size-sm .ega-input {
    min-height: 28px;
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-sm);
  }
  .size-md .ega-input {
    padding: var(--space-2) var(--space-3);
    font-size: var(--fs-base);
  }

  .is-disabled .ega-input-row {
    background: var(--color-bg-disabled);
    border-color: var(--color-border-disabled);
  }
  .is-disabled .ega-input {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }

  .ega-input-leading {
    display: inline-flex;
    align-items: center;
    color: var(--color-muted);
    padding: 0 var(--space-1);
  }
  .ega-input-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: var(--space-1);
    border: 0;
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    padding: 0;
  }
  .ega-input-clear:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
</style>
