<script lang="ts" module>
  /** Imperative handle, e.g. to insert a slot token at the cursor from the SlotPalette. */
  export interface TextareaApi {
    insertAtCursor: (text: string) => void;
    focus: () => void;
  }
</script>

<script lang="ts">
  import ResetField from '@/shared/ui/ResetField.svelte';

  interface Props {
    id: string;
    labelText: string;
    value: string;
    placeholder: string;
    showReset: boolean;
    inheritedLabel: string;
    resetAriaLabel: string;
    /** Data attribute name on the wrapper div — e.g. `data-ega-template-system`. */
    wrapperDataAttr: string;
    onValueChange: (next: string) => void;
    onFocus: () => void;
    onReady: (api: TextareaApi) => void;
    onReset: () => void | Promise<void>;
  }

  const {
    id,
    labelText,
    value,
    placeholder,
    showReset,
    inheritedLabel,
    resetAriaLabel,
    wrapperDataAttr,
    onValueChange,
    onFocus,
    onReady,
    onReset,
  }: Props = $props();

  let el: HTMLTextAreaElement | null = $state(null);
  const wrapperAttrs = $derived({ [wrapperDataAttr]: '' });

  function bindEl(node: HTMLTextAreaElement): void {
    el = node;
    onReady({
      insertAtCursor(text: string) {
        if (!el) return;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        el.setRangeText(text, start, end, 'end');
        // setRangeText doesn't fire native `input` — dispatch so the
        // bound onValueChange path picks up the mutation.
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
      },
      focus() {
        el?.focus();
      },
    });
  }
</script>

<div class="editor-block">
  <div class="editor-label-row">
    <label class="editor-label" for={id}>{labelText}</label>
    <ResetField
      differsFromInherited={showReset}
      {onReset}
      ariaLabel={resetAriaLabel}
      {inheritedLabel}
    />
  </div>
  <div class="ta-wrapper" {...wrapperAttrs}>
    <textarea
      {id}
      use:bindEl
      class="ta"
      dir="auto"
      {value}
      aria-label={placeholder}
      {placeholder}
      spellcheck="false"
      autocapitalize="off"
      {...{ autocorrect: 'off' }}
      oninput={(e) => onValueChange((e.currentTarget as HTMLTextAreaElement).value)}
      onfocus={onFocus}></textarea>
  </div>
</div>

<style>
  .editor-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .editor-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .editor-label {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }
  .ta-wrapper {
    min-width: 0;
  }
  .ta {
    width: 100%;
    box-sizing: border-box;
    min-height: 8rem;
    max-height: min(48vh, 32rem);
    resize: vertical;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    overflow: auto;
    scrollbar-width: thin;
  }
  .ta:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--color-accent-bg-soft);
    border-color: var(--color-accent);
  }
</style>
