<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Globe from '@lucide/svelte/icons/globe';
  import X from '@lucide/svelte/icons/x';
  import { onMount } from 'svelte';
  import { listVarieties } from '@/shared/varieties';
  import { isIsoCode, labelFor } from '@/shared/languages';
  import type { Variety } from '@/shared/types';
  import {
    groupSiteOverrides,
    type SiteOverrideRow,
  } from '@/options/components/site-override-rows';

  interface Props {
    settings: Settings;
    onClearKeys: (keys: readonly string[]) => Promise<void>;
    onClearAll: () => Promise<void>;
    onExport?: () => void;
  }

  const { settings, onClearKeys, onClearAll, onExport }: Props = $props();

  const rows = $derived(groupSiteOverrides(settings.sitePrefs));

  let varieties = $state.raw<Variety[]>([]);
  onMount(() => {
    void listVarieties().then((vs) => (varieties = vs));
  });
  function languageName(id: string): string {
    if (id === 'auto') return 'Auto-detect';
    return varieties.find((v) => v.id === id)?.label ?? (isIsoCode(id) ? labelFor(id) : id);
  }
  // A short list is read at a glance; the filter earns its space only on a long one.
  const FILTER_MIN_ROWS = 10;
  let query = $state('');
  const needle = $derived(rows.length >= FILTER_MIN_ROWS ? query.trim().toLowerCase() : '');
  const shown = $derived(
    needle === '' ? rows : rows.filter((r) => r.label.toLowerCase().includes(needle)),
  );

  async function clearOne(row: SiteOverrideRow): Promise<void> {
    const ok = await confirmDialog({
      title: 'Clear site override',
      body: `Remove the settings for ${row.label}? Its on/off state and its languages are cleared.`,
      confirmLabel: 'Clear',
      danger: true,
    });
    if (ok) await onClearKeys(row.keys);
  }

  async function clearAll(): Promise<void> {
    const ok = await confirmDialog({
      title: 'Clear all site overrides',
      body: `Remove all per-site entries (${rows.length} ${rows.length === 1 ? 'host' : 'hosts'})? This cannot be undone.`,
      confirmLabel: 'Clear all',
      danger: true,
    });
    if (ok) await onClearAll();
  }
</script>

<div class="site-overrides-review" data-ega-site-overrides-review>
  {#if rows.length === 0}
    <EmptyState
      title="No site overrides yet"
      description="Right-click empty page space and choose Ega ▸ Disable Ega on this site to add one here."
      icon={Globe}
    />
  {:else}
    {#if rows.length >= FILTER_MIN_ROWS}
      <Input bind:value={query} placeholder="Filter sites…" ariaLabel="Filter sites" size="sm" />
    {/if}
    {#if shown.length === 0}
      <p class="host-empty">No sites match "{query.trim()}".</p>
    {/if}
    <ul class="host-list" role="list">
      {#each shown as row (row.label)}
        <li class="host-row" data-ega-site-override-row data-ega-site-override-host={row.label}>
          <span class="host-name" title={row.label}>{row.label}</span>
          <span class="pills">
            {#if row.pref.disabled}
              <span class="pill pill-paused" data-ega-site-pill-paused>Ega off</span>
            {/if}
            {#if row.pref.defaultLang}
              <span class="pill pill-lang" data-ega-site-pill-lang>
                Source: {languageName(row.pref.defaultLang)}
              </span>
            {/if}
          </span>
          <IconButton
            icon={X}
            ariaLabel={`Clear override for ${row.label}`}
            tooltip="Clear"
            size="sm"
            variant="danger"
            dataAttrs={{ 'data-ega-site-override-clear': true }}
            onclick={() => void clearOne(row)}
          />
        </li>
      {/each}
    </ul>
    <div class="footer">
      {#if onExport}
        <Button
          variant="secondary"
          size="sm"
          dataAttrs={{ 'data-ega-site-override-export': true }}
          onclick={onExport}
        >
          Export site overrides (JSON)
        </Button>
      {/if}
      <Button
        variant="danger"
        size="sm"
        dataAttrs={{ 'data-ega-site-override-clear-all': true }}
        onclick={() => void clearAll()}
      >
        Clear all
      </Button>
    </div>
  {/if}
</div>

<style>
  .site-overrides-review {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .host-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .host-empty {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .host-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  .host-name {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pills {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .pill {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    color: var(--color-fg-subtle);
    font-size: var(--fs-xs);
  }
  .pill-paused {
    color: var(--color-danger-fg);
    border-color: var(--color-danger);
    background: var(--color-danger-bg-soft, var(--color-bg));
  }
  .pill-lang {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
</style>
