<script lang="ts">
  import { Combobox } from 'bits-ui';
  import ComboboxShell from '@/shared/ui/Combobox.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
  import Check from '@lucide/svelte/icons/check';
  import { id } from '@/shared/uuid';

  interface Props {
    value: string;
    label?: string;
    placeholder?: string;
    /** Discovered model ids, owned by the parent. Empty until Refresh runs. */
    options: string[];
    /** True while the parent's discoverModels promise is in flight. */
    loading?: boolean;
    /** Set by parent when discovery fails. Renders inline. */
    error?: string | null;
    /** Disabled when no API key is configured. */
    disabled?: boolean;
    onValueChange: (next: string) => void;
    onDiscover: () => void;
  }

  let {
    value,
    label,
    placeholder,
    options,
    loading = false,
    error = null,
    disabled = false,
    onValueChange,
    onDiscover,
  }: Props = $props();

  const inputId = id('ega-model-combobox');

  // Falling back to `value` lets a discovery refresh that rewrites the saved id show in the input.
  let queryOverride = $state<string | null>(null);
  let lastCommitted: string | null = null;
  // A new saved id (external reset, discovery rewrite) replaces what was typed; the echo of this component's own commit is not new.
  $effect(() => {
    if (value !== lastCommitted) queryOverride = null;
  });
  const query = $derived(queryOverride ?? value);

  const filtered = $derived.by(() => {
    const q = query.trim();
    if (!q) return options;
    // An exact match shows the full list, so alternatives stay browsable.
    if (options.includes(q)) return options;
    const ql = q.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(ql));
  });

  function commit(next: string): void {
    queryOverride = next;
    lastCommitted = next;
    onValueChange(next);
  }
</script>

<div data-ega-model-combobox>
  <ComboboxShell
    {value}
    inputValue={query}
    {inputId}
    {label}
    {placeholder}
    {disabled}
    {error}
    triggerAriaLabel="Show model list"
    onValueChange={(v) => {
      if (v) commit(v);
    }}
    oninput={commit}
  >
    {#snippet trailing()}
      <IconButton
        icon={RefreshCcw}
        ariaLabel={loading ? 'Loading models…' : 'Refresh model list from the backend'}
        tooltip={loading ? 'Loading…' : 'Refresh from the backend'}
        size="sm"
        disabled={disabled || loading}
        onclick={() => onDiscover()}
      />
    {/snippet}
    {#snippet items()}
      {#if filtered.length === 0}
        <div class="ega-combobox-empty-row">
          {#if loading}
            Loading…
          {:else if options.length === 0}
            No models loaded yet — click <RefreshCcw size={12} /> to fetch from the backend.
          {:else}
            No matches.
          {/if}
        </div>
      {:else}
        {#each filtered as opt (opt)}
          <Combobox.Item value={opt} label={opt} class="ega-combobox-item">
            {#snippet child({ props, selected })}
              <div {...props}>
                <span class="ega-combobox-item-label">{opt}</span>
                {#if selected}
                  <Check size={12} />
                {/if}
              </div>
            {/snippet}
          </Combobox.Item>
        {/each}
      {/if}
    {/snippet}
  </ComboboxShell>
</div>
