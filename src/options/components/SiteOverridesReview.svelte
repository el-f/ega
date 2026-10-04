<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Globe from '@lucide/svelte/icons/globe';
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
      body: `Remove the settings for ${row.label}? Its on/off state and saved direction are cleared.`,
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
      description="Right-click any page and choose &quot;Disable Ega on this site&quot; to add one here."
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
              <span class="pill pill-paused" data-ega-site-pill-paused>off</span>
            {/if}
            {#if row.pref.defaultLang}
              <span class="pill pill-lang" data-ega-site-pill-lang>
                lang: {row.pref.defaultLang}
              </span>
            {/if}
          </span>
          <button
            type="button"
            class="clear-btn"
            aria-label={`Clear override for ${row.label}`}
            data-ega-site-override-clear
            onclick={() => void clearOne(row)}
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
    <div class="footer">
      {#if onExport}
        <button type="button" class="export-btn" data-ega-site-override-export onclick={onExport}>
          Export site overrides (JSON)
        </button>
      {/if}
      <button
        type="button"
        class="clear-all-btn"
        data-ega-site-override-clear-all
        onclick={() => void clearAll()}
      >
        Clear all
      </button>
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
  .clear-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--color-fg-subtle);
    cursor: pointer;
    width: 1.75rem;
    height: 1.75rem;
    font-size: var(--fs-md);
    line-height: 1;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .clear-btn:hover,
  .clear-btn:focus-visible {
    color: var(--color-danger-fg);
    border-color: var(--color-danger);
    outline: none;
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .export-btn,
  .clear-all-btn {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-fg);
    cursor: pointer;
    font-size: var(--fs-sm);
  }
  .clear-all-btn {
    color: var(--color-danger-fg);
    border-color: var(--color-danger);
  }
  .clear-all-btn:hover,
  .clear-all-btn:focus-visible {
    background: var(--color-danger);
    color: var(--color-bg);
    outline: none;
  }
  .export-btn:hover,
  .export-btn:focus-visible {
    background: var(--color-bg-elevated);
    outline: none;
  }
</style>
