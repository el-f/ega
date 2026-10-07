<script lang="ts">
  import { id } from '@/shared/uuid';

  interface Props {
    value: string;
    label?: string;
    rows?: number;
    placeholder?: string;
    /** Optional explicit max length passed to the native attribute. */
    maxlength?: number;
    /** Use mono font for prompt/code-shaped content. */
    mono?: boolean;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
    onblur?: (e: FocusEvent) => void;
    onkeydown?: (e: KeyboardEvent) => void;
    /** Pass-through `data-*` attributes. */
    dataAttrs?: Record<string, string | number | boolean | undefined>;
  }

  let {
    value = $bindable(),
    label,
    rows = 3,
    placeholder,
    maxlength,
    mono = false,
    oninput,
    onchange,
    onblur,
    onkeydown,
    dataAttrs,
  }: Props = $props();

  const taId = id('ega-textarea');
</script>

<div class="ega-textarea-wrap">
  {#if label}
    <label class="ega-textarea-label" for={taId}>{label}</label>
  {/if}
  <textarea
    id={taId}
    class="ega-textarea"
    class:is-mono={mono}
    {rows}
    bind:value
    {placeholder}
    {maxlength}
    dir="auto"
    {oninput}
    {onchange}
    {onblur}
    {onkeydown}
    {...dataAttrs ?? {}}></textarea>
</div>

<style>
  .ega-textarea-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ega-textarea-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    font-weight: var(--ega-fw-medium, 500);
  }
  .ega-textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    outline: none;
    font-family: var(--font-ui);
    padding: var(--space-2) var(--space-3);
    font-size: var(--fs-base);
    resize: vertical;
    transition:
      border-color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out);
  }
  .ega-textarea.is-mono {
    font-family: var(--font-mono);
  }
  .ega-textarea:focus-visible {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
</style>
