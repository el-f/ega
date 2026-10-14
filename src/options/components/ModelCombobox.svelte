<script lang="ts">
  import { Combobox } from 'bits-ui';
  import ComboboxShell from '@/shared/ui/Combobox.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
  import Check from '@lucide/svelte/icons/check';
  import { id } from '@/shared/uuid';

  interface Props {
    value: string;
    /** Shown while the saved value is empty (the backend's default model). */
    fallback?: string | undefined;
    label?: string;
    /** The field's name when no visible label sits on it ("OpenAI model"). */
    ariaLabel?: string | undefined;
    placeholder?: string;
    /** Discovered model ids, owned by the parent. Empty until Refresh runs. */
    options: string[];
    /** True while the parent's discoverModels promise is in flight. */
    loading?: boolean;
    /** Set by parent when discovery fails. Renders inline. */
    error?: string | null;
    /** Id of the visible line saying why Refresh cannot run yet; Refresh then stays focusable but does nothing. */
    refreshBlockedBy?: string | undefined;
    onValueChange: (next: string) => void;
    onDiscover: () => void;
  }

  let {
    value,
    fallback,
    label,
    ariaLabel,
    placeholder,
    options,
    loading = false,
    error = null,
    refreshBlockedBy,
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
  const query = $derived(queryOverride ?? (value || (fallback ?? '')));

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

  // A field left empty means the default, so it shows the default id again once focus moves on.
  function onFocusOut(e: FocusEvent): void {
    const to = e.relatedTarget;
    if (to instanceof Node && (e.currentTarget as HTMLElement).contains(to)) return;
    if (queryOverride === '') queryOverride = null;
  }
</script>

<div data-ega-model-combobox onfocusout={onFocusOut}>
  {#if ariaLabel && !label}
    <label class="ega-sr-only" for={inputId}>{ariaLabel}</label>
  {/if}
  <ComboboxShell
    {value}
    inputValue={query}
    {inputId}
    {label}
    {placeholder}
    {error}
    describedById={refreshBlockedBy}
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
        tooltip={refreshBlockedBy ? '' : loading ? 'Loading…' : 'Refresh from the backend'}
        size="sm"
        dataAttrs={refreshBlockedBy
          ? { 'aria-disabled': 'true', 'aria-describedby': refreshBlockedBy }
          : loading
            ? { 'aria-disabled': 'true' }
            : {}}
        onclick={() => {
          if (!refreshBlockedBy && !loading) onDiscover();
        }}
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
  <!-- Always present, so the line is announced when it appears; empty, it takes no room. -->
  <p class="mc-status" class:mc-on={loading} role="status">
    {#if loading}Loading models...{/if}
  </p>
</div>

<style>
  .mc-status {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .mc-on {
    padding-top: var(--space-1);
  }
</style>
