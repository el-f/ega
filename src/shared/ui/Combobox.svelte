<script lang="ts">
  /** Input, chevron and portalled list; callers render their own items through the items snippet. */
  import { Combobox } from 'bits-ui';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { Snippet } from 'svelte';

  interface Props {
    /** Selected id. bits-ui treats this as the SELECTED value, never the typed text. */
    value: string;
    /** Typed text. bits-ui's own `inputValue` is read-only, so the caller owns it. */
    inputValue: string;
    inputId: string;
    triggerAriaLabel: string;
    items: Snippet;
    label?: string | undefined;
    placeholder?: string | undefined;
    disabled?: boolean;
    /** Id of an element describing the control; stamped on the input. */
    describedById?: string | undefined;
    /** Inline error under the row. */
    error?: string | null;
    onValueChange: (next: string) => void;
    oninput: (next: string) => void;
    /** Rendered right of the chevron, inside the bordered row. */
    trailing?: Snippet;
  }

  let {
    value,
    inputValue,
    inputId,
    triggerAriaLabel,
    items,
    label,
    placeholder,
    disabled = false,
    describedById,
    error = null,
    onValueChange,
    oninput,
    trailing,
  }: Props = $props();
</script>

<div class="ega-combobox">
  {#if label}
    <label class="ega-combobox-label" for={inputId}>{label}</label>
  {/if}
  <div class="ega-combobox-shell">
    <Combobox.Root
      type="single"
      {disabled}
      {value}
      onValueChange={(v) => onValueChange(v ?? '')}
      {inputValue}
    >
      <div class="ega-combobox-row">
        <Combobox.Input
          id={inputId}
          class="ega-combobox-input"
          {placeholder}
          aria-describedby={describedById}
          oninput={(e: Event) => oninput((e.currentTarget as HTMLInputElement).value)}
        />
        <Combobox.Trigger class="ega-combobox-toggle" aria-label={triggerAriaLabel}>
          <ChevronDown size={14} />
        </Combobox.Trigger>
        {@render trailing?.()}
      </div>
      <Combobox.Portal>
        <Combobox.Content class="ega-combobox-content" sideOffset={4}>
          <Combobox.Viewport class="ega-combobox-viewport">
            {@render items()}
          </Combobox.Viewport>
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox.Root>
  </div>
  {#if error}
    <div class="ega-combobox-error" role="alert">{error}</div>
  {/if}
</div>

<style>
  .ega-combobox {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ega-combobox-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    font-weight: var(--ega-fw-medium, 500);
  }
  .ega-combobox-shell {
    position: relative;
  }
  .ega-combobox-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    padding: 2px;
    transition: border-color var(--motion-fast) var(--ease-out);
  }
  .ega-combobox-row:focus-within {
    border-color: var(--color-accent);
  }
  .ega-combobox-row :global(.ega-combobox-input) {
    flex: 1 1 auto;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    padding: var(--space-1) var(--space-2);
    caret-color: var(--color-accent);
  }
  .ega-combobox-row :global(.ega-combobox-input::placeholder) {
    color: var(--color-muted);
    font-family: var(--font-ui);
  }
  .ega-combobox-row :global(.ega-combobox-toggle) {
    flex: 0 0 auto;
    background: transparent;
    border: 0;
    color: var(--color-fg-subtle);
    cursor: pointer;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .ega-combobox-row :global(.ega-combobox-toggle:hover:not([data-disabled])) {
    color: var(--color-fg);
    background: var(--color-bg-hover);
  }
  :global(.ega-combobox-content) {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: 0 8px 24px var(--color-shadow);
    z-index: 50;
    /* bits-ui exposes the trigger width through this variable. */
    width: var(--bits-combobox-anchor-width);
    max-height: 240px;
    overflow: hidden;
  }
  :global(.ega-combobox-viewport) {
    padding: var(--space-1);
    max-height: 240px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  :global(.ega-combobox-item) {
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.ega-combobox-item[data-highlighted]) {
    background: var(--color-bg-hover);
  }
  :global(.ega-combobox-item[data-selected]) {
    color: var(--color-accent);
    font-weight: 600;
  }
  :global(.ega-combobox-item-label) {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.ega-combobox-empty-row) {
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-xs);
    color: var(--color-muted);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .ega-combobox-error {
    font-size: var(--fs-xs);
    color: var(--color-danger);
  }
</style>
