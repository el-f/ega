<script lang="ts">
  import type { Variety } from '@/shared/types';
  import { ISO_LANGUAGES } from '@/shared/languages';

  interface Props {
    /** ISO code ('en'), built-in variety id ('arabizi'), or a custom id. */
    value: string;
    /** Enabled varieties only — the caller filters. */
    varieties: readonly Variety[];
    /** Add an "Auto-detect" entry. Source pickers only. */
    includeAuto?: boolean;
    /** id for the <select>, so callers can point a `<label for>` at it. */
    id: string;
    /** Accessible name when the surface renders no visible label. Falls back to source/target from `includeAuto`. */
    ariaLabel?: string;
    /** Set when the callsite renders a visible `<label for={id}>` — an aria-label would override that name. */
    suppressAriaLabel?: boolean;
    /** Optional className hook. */
    class?: string;
    /** Fired on the native change event. */
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(),
    varieties,
    includeAuto = false,
    id,
    ariaLabel,
    suppressAriaLabel = false,
    class: klass = '',
    onchange,
  }: Props = $props();

  const resolvedAriaLabel = $derived(
    suppressAriaLabel
      ? undefined
      : (ariaLabel ?? (includeAuto ? 'Source language' : 'Target language')),
  );

  // Sorted here too so the component works with an unsorted list.
  const builtinList = $derived(
    varieties
      .filter((v) => v.kind === 'builtin' && !v.disabled)
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
  const customList = $derived(
    varieties
      .filter((v) => v.kind === 'custom' && !v.disabled)
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
  // ISO_LANGUAGES is a frozen module constant — sort once, not per render.
  const isoList = ISO_LANGUAGES.slice().sort((a, b) => a.label.localeCompare(b.label));

  const optionValues = $derived(
    new Set<string>([
      ...(includeAuto ? ['auto'] : []),
      ...builtinList.map((v) => v.id),
      ...customList.map((v) => v.id),
      ...isoList.map((l) => l.code),
    ]),
  );
  // A disabled variety, or a code no table knows, still sends — showing it beats an empty box.
  const orphan = $derived.by(() => {
    if (value === '' || optionValues.has(value)) return null;
    const v = varieties.find((x) => x.id === value);
    if (v) return v.disabled ? `${v.label} (disabled)` : v.label;
    return value;
  });
</script>

<select
  {id}
  class="ega-lang-picker {klass}"
  bind:value
  aria-label={resolvedAriaLabel}
  data-ega-lang-picker
  onchange={(e) => onchange?.(e.currentTarget.value)}
>
  {#if includeAuto}
    <option value="auto" dir="auto">Auto-detect</option>
  {/if}
  {#if orphan !== null}
    <option {value} dir="auto" data-ega-lang-orphan>{orphan}</option>
  {/if}
  {#if builtinList.length > 0}
    <optgroup label="Built-in">
      {#each builtinList as v (v.id)}
        <option value={v.id} dir="auto">{v.label}</option>
      {/each}
    </optgroup>
  {/if}
  {#if customList.length > 0}
    <optgroup label="Custom">
      {#each customList as v (v.id)}
        <option value={v.id} dir="auto">{v.label}</option>
      {/each}
    </optgroup>
  {/if}
  <optgroup label="Languages">
    {#each isoList as l (l.code)}
      <option value={l.code} dir="auto">{l.label}</option>
    {/each}
  </optgroup>
</select>

<style>
  .ega-lang-picker {
    /* Fills the parent down to a 120px floor, so no surface needs extra CSS. */
    max-width: 100%;
    min-width: 120px;
    box-sizing: border-box;
    /* Optgroups don't fit the Select primitive's flat option contract, so its rules are repeated here. */
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    padding: var(--space-1) calc(var(--space-2) + 14px) var(--space-1) var(--space-2);
    transition: border-color var(--motion-fast) var(--ease-out);
    /* Same reset as Select: the OS control ignores dark theme, and the data-URI chevron cannot read CSS vars. */
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    cursor: pointer;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%23b0b4ba' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right var(--space-2) center;
    background-size: 12px 12px;
    color-scheme: dark;
  }
  :global([data-theme='light']) .ega-lang-picker {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%2360646c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    color-scheme: light;
  }
  @media (prefers-color-scheme: light) {
    :global(:root:not([data-theme='dark'])) .ega-lang-picker {
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%2360646c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
      color-scheme: light;
    }
  }
  :global([data-theme='dark']) .ega-lang-picker {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%23b0b4ba' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    color-scheme: dark;
  }
  .ega-lang-picker:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
    border-color: var(--color-accent);
  }
  .ega-lang-picker:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
