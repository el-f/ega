<script lang="ts">
  import Button from '@/shared/ui/Button.svelte';
  import { id as makeId } from '@/shared/uuid';
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
    /** Keeps the Tab stop and is announced as unavailable; Record does nothing. Pair it with describedBy. */
    ariaDisabled?: boolean;
    /** Id of the visible line that says why. */
    describedBy?: string;
    /** Accent dot marking a value changed from its default. Shows only when `label` is set. */
    modified?: boolean;
    /** Why the last combo was not saved (a clash, a combo Chrome refuses); shown under the row, Record points at it. */
    error?: string | null;
  }
  let {
    value,
    onchange,
    ariaLabel,
    clearAriaLabel = 'Clear shortcut',
    label,
    disabled = false,
    ariaDisabled = false,
    describedBy,
    modified = false,
    error = null,
  }: Props = $props();

  let recording = $state(false);
  let root: HTMLDivElement | null = $state(null);
  const errorId = makeId('ega-shortcut-error');
  const valueId = makeId('ega-shortcut-value');
  const recordDescribedBy = $derived(
    [valueId, describedBy, error ? errorId : undefined].filter(Boolean).join(' '),
  );

  // Clear removes itself once the value is empty, so focus goes back to Record instead of the page body (K-9).
  function focusRecord(): void {
    root?.querySelector<HTMLButtonElement>('[data-ega-shortcut-record]')?.focus();
  }

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
  }

  function toggle(): void {
    if (disabled || ariaDisabled) return;
    recording = !recording;
  }

  function clear(): void {
    if (disabled || ariaDisabled) return;
    onchange('');
    recording = false;
    focusRecord();
  }
</script>

{#if label}
  <span class="shortcut-label"
    >{label}{#if modified}<span class="ega-changed" data-ega-modified="true">Changed</span
      >{/if}</span
  >
{/if}
<div
  class="shortcut-input"
  class:is-recording={recording}
  class:is-disabled={disabled || ariaDisabled}
  bind:this={root}
>
  <kbd class="combo">{recording ? 'Press keys...' : value || '—'}</kbd>
  <span class="ega-sr-only" id={valueId}>Current shortcut: {value || 'None'}.</span>
  <Button
    variant="secondary"
    size="sm"
    ariaLabel={recording ? 'Cancel recording' : ariaLabel}
    {ariaDisabled}
    {disabled}
    {...recordDescribedBy === undefined ? {} : { describedBy: recordDescribedBy }}
    dataAttrs={{
      'data-ega-shortcut-record': true,
      'aria-pressed': recording,
      'aria-invalid': error ? 'true' : undefined,
      'data-ega-owns-escape': recording || undefined,
    }}
    onclick={toggle}
    onkeydown={onKey}
    onblur={() => (recording = false)}
  >
    {recording ? 'Cancel' : 'Record'}
  </Button>
  {#if value && !disabled && !ariaDisabled}
    <Button variant="secondary" size="sm" ariaLabel={clearAriaLabel} onclick={clear}>Clear</Button>
  {/if}
  {#if !value && !recording}
    <span class="empty-hint">No shortcut set</span>
  {/if}
</div>
{#if error}
  <p class="shortcut-error" id={errorId} role="alert" data-ega-field-error>{error}</p>
{/if}

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
  /* Wraps Clear under the value in a narrow column, instead of pushing the page sideways (R16). */
  .shortcut-input {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  /* A read-only value, not a control: no edge, so it never looks like a button beside Record. */
  .combo {
    display: inline-block;
    /* Fits "Press keys..." and a 12-char combo, so recording never widens the box under the cursor. */
    min-width: calc(12ch + var(--space-2) * 2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    text-align: center;
  }
  .is-recording .combo {
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
  }
  .empty-hint {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    font-style: italic;
  }
  .shortcut-error {
    margin: var(--space-1) 0 0;
    color: var(--color-danger-fg);
    font-size: var(--fs-sm);
  }
</style>
