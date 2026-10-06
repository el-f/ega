<script lang="ts">
  import { validateKeyCombo } from '@/shared/utils/keyCombo';

  interface Props {
    value: string;
    onchange: (next: string) => void;
    /** Accessible name for the Record button; `label` is only a caption. */
    ariaLabel: string;
    /** Accessible name for the Clear button. Set it when two inputs share a screen. */
    clearAriaLabel?: string;
    /** Visible caption. A `<span>`, not a `<label for>`: a label would proxy clicks to the Record button. */
    label?: string;
    disabled?: boolean;
    /** Accent dot marking a value changed from its default. Shows only when `label` is set. */
    modified?: boolean;
  }
  let {
    value,
    onchange,
    ariaLabel,
    clearAriaLabel = 'Clear shortcut',
    label,
    disabled = false,
    modified = false,
  }: Props = $props();

  let recording = $state(false);
  let btn: HTMLButtonElement | null = $state(null);

  // Named keys pass through unchanged because validateKeyCombo expects that spelling.
  function keyToken(key: string): string | null {
    if (key === ' ') return 'Space';
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
    return key.length === 1 ? key.toUpperCase() : key;
  }

  function format(e: KeyboardEvent): string | null {
    const k = keyToken(e.key);
    if (k === null) return null;
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (e.metaKey) parts.push('Command');
    if (parts.length === 0) return null;
    parts.push(k);
    return parts.join('+');
  }

  function onKey(e: KeyboardEvent): void {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      recording = false;
      return;
    }
    const combo = format(e);
    if (combo === null) return;
    const v = validateKeyCombo(combo);
    if (!v.ok) return;
    onchange(v.normalized);
    recording = false;
    btn?.blur();
  }

  function toggle(): void {
    if (disabled) return;
    recording = !recording;
  }

  function clear(): void {
    if (disabled) return;
    onchange('');
    recording = false;
  }
</script>

{#if label}
  <span class="shortcut-label"
    >{label}{#if modified}<span class="ega-changed" data-ega-modified="true">Changed</span
      >{/if}</span
  >
{/if}
<div class="shortcut-input" class:is-recording={recording} class:is-disabled={disabled}>
  <kbd class="combo">{value || (recording ? 'Press keys…' : '—')}</kbd>
  <button
    type="button"
    bind:this={btn}
    class="record-btn"
    aria-label={ariaLabel}
    aria-pressed={recording}
    data-ega-owns-escape={recording || undefined}
    {disabled}
    onclick={toggle}
    onkeydown={onKey}
    onblur={() => (recording = false)}
  >
    {recording ? 'Cancel' : 'Record'}
  </button>
  {#if value && !disabled}
    <button type="button" class="clear-btn" aria-label={clearAriaLabel} onclick={clear}>
      Clear
    </button>
  {/if}
  {#if !value && !recording}
    <span class="empty-hint">No shortcut set</span>
  {/if}
</div>

<style>
  .shortcut-label {
    display: block;
    margin-bottom: var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .ega-changed {
    margin-inline-start: var(--space-2);
    font-weight: 400;
    color: var(--color-muted);
  }
  .shortcut-input {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .combo {
    display: inline-block;
    /* Fits "Press keys…" and a 12-char combo, so recording never widens the box under the cursor. */
    min-width: calc(12ch + var(--space-2) * 2 + 2px);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-sunken);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    text-align: center;
  }
  .is-recording .combo {
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
  }
  .record-btn,
  .clear-btn {
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-sm);
    font-family: var(--font-ui);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-fg);
    cursor: pointer;
  }
  .record-btn:hover:not(:disabled),
  .clear-btn:hover {
    background: var(--color-bg-hover);
  }
  .record-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .is-recording .record-btn {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .empty-hint {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    font-style: italic;
  }
</style>
