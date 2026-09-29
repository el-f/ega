<script lang="ts">
  import { Combobox } from 'bits-ui';
  import ComboboxShell from '@/shared/ui/Combobox.svelte';
  import { BACKEND_CHAIN_MAX } from '@/shared/settings-schema';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import X from '@lucide/svelte/icons/x';
  import { id as makeId } from '@/shared/uuid';

  interface Props {
    /** Ordered chain of currently selected backend ids. */
    value: readonly string[];
    /** Full pool of selectable backend ids. */
    options: readonly string[];
    label?: string;
    placeholder?: string;
    /** Id of an element describing the control; stamped on the input so it announces on focus. */
    describedById?: string;
    onChange: (next: readonly string[]) => void;
  }

  const {
    value,
    options,
    label,
    placeholder = 'Pick a backend…',
    describedById,
    onChange,
  }: Props = $props();

  const inputId = makeId('ega-chain-input');
  let query = $state('');

  // Suggestions: full pool minus already-selected ids, filtered by query.
  const remaining = $derived(options.filter((id) => !value.includes(id)));
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return remaining;
    return remaining.filter((id) => id.toLowerCase().includes(q));
  });

  function commitPick(picked: string): void {
    if (!picked) return;
    if (!options.includes(picked)) return;
    if (value.includes(picked)) return;
    // Past the cap the write does not fail the field — it resets the whole `advanced` section on the next read.
    if (value.length >= BACKEND_CHAIN_MAX) return;
    onChange([...value, picked]);
    query = '';
  }

  function removeAt(idx: number): void {
    onChange(value.filter((_, i) => i !== idx));
  }

  function moveUp(idx: number): void {
    if (idx <= 0) return;
    const a = value[idx - 1];
    const b = value[idx];
    if (a === undefined || b === undefined) return;
    const next = [...value];
    next[idx - 1] = b;
    next[idx] = a;
    onChange(next);
  }

  function moveDown(idx: number): void {
    if (idx >= value.length - 1) return;
    const a = value[idx];
    const b = value[idx + 1];
    if (a === undefined || b === undefined) return;
    const next = [...value];
    next[idx] = b;
    next[idx + 1] = a;
    onChange(next);
  }
</script>

<div class="chain-input" data-ega-backend-chain-input>
  {#if value.length > 0}
    <ul class="chain-chips" data-ega-backend-chain-chips>
      {#each value as id, idx (id)}
        <li class="chain-chip" data-ega-backend-chain-chip={id}>
          <span class="chip-pos">{idx + 1}</span>
          <span class="chip-label">{id}</span>
          <button
            type="button"
            class="chip-btn"
            aria-label={`Move ${id} up`}
            disabled={idx === 0}
            onclick={() => moveUp(idx)}
            data-ega-backend-chain-move-up
          >
            <ArrowUp size={12} />
          </button>
          <button
            type="button"
            class="chip-btn"
            aria-label={`Move ${id} down`}
            disabled={idx === value.length - 1}
            onclick={() => moveDown(idx)}
            data-ega-backend-chain-move-down
          >
            <ArrowDown size={12} />
          </button>
          <button
            type="button"
            class="chip-btn chip-remove"
            aria-label={`Remove ${id}`}
            onclick={() => removeAt(idx)}
            data-ega-backend-chain-remove
          >
            <X size={12} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <ComboboxShell
    value=""
    inputValue={query}
    {inputId}
    {label}
    {placeholder}
    {describedById}
    disabled={remaining.length === 0}
    triggerAriaLabel="Show backend list"
    onValueChange={commitPick}
    oninput={(v) => (query = v)}
  >
    {#snippet items()}
      {#if filtered.length === 0}
        <div class="ega-combobox-empty-row">
          {remaining.length === 0 ? 'All backends added.' : 'No matches.'}
        </div>
      {:else}
        {#each filtered as opt (opt)}
          <Combobox.Item value={opt} label={opt} class="ega-combobox-item">
            {#snippet child({ props })}
              <div {...props} data-ega-backend-chain-option={opt}>
                <span class="ega-combobox-item-label">{opt}</span>
              </div>
            {/snippet}
          </Combobox.Item>
        {/each}
      {/if}
    {/snippet}
  </ComboboxShell>
</div>

<style>
  .chain-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .chain-chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .chain-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px var(--space-2);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg);
  }
  .chip-pos {
    color: var(--color-fg-subtle);
    font-weight: 600;
  }
  .chip-label {
    flex: 1 1 auto;
  }
  .chip-btn {
    appearance: none;
    background: transparent;
    border: 0;
    color: var(--color-fg-subtle);
    padding: 2px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .chip-btn:hover:not(:disabled),
  .chip-btn:focus-visible:not(:disabled) {
    color: var(--color-fg);
    background: var(--color-bg-hover);
    outline: none;
  }
  .chip-btn:disabled {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  .chip-remove:hover:not(:disabled),
  .chip-remove:focus-visible:not(:disabled) {
    color: var(--color-danger);
  }
</style>
