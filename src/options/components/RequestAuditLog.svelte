<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { readAuditLog, exportAuditLogAsJson, type AuditEntry } from '@/shared/audit-log';
  import { sendMsg } from '@/shared/messages';
  import { toastStore } from '@/shared/components/toastStore';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
  import SearchX from '@lucide/svelte/icons/search-x';
  import RequestAuditLogActions from './RequestAuditLogActions.svelte';
  import RequestAuditLogEntry from './RequestAuditLogEntry.svelte';
  import RequestAuditLogFilters from './RequestAuditLogFilters.svelte';
  import AuditDiffModal from './AuditDiffModal.svelte';
  import {
    EMPTY_FILTERS,
    hasActiveFilters,
    countActiveFilters,
    type AuditFilters,
  } from './audit-filters';
  import { debugCatch } from '@/shared/logger';
  import { downloadTextFile } from '@/shared/download-file';

  const STORAGE_KEY = 'egaAuditLog';
  const FILTERS_KEY = 'ega.audit-log.filters';

  let entries = $state.raw<readonly AuditEntry[]>([]);
  let expanded = $state<Record<string, boolean>>({});
  let loadError = $state<string | null>(null);
  let filters = $state<AuditFilters>({ ...EMPTY_FILTERS });
  /** First entry picked for compare; picking the same one again cancels. */
  let compareTargetId = $state<string | null>(null);
  /** Fixed when the diff opens, so clearing filters mid-modal cannot swap the pair. */
  let diffPair = $state<{ leftId: string; rightId: string } | null>(null);

  async function loadFilters(): Promise<void> {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
      const out = await chrome.storage.session.get(FILTERS_KEY);
      const raw = (out as Record<string, unknown>)[FILTERS_KEY];
      if (raw && typeof raw === 'object') {
        filters = { ...EMPTY_FILTERS, ...(raw as Partial<AuditFilters>) };
      }
    } catch (e) {
      debugCatch(e, 'options.RequestAuditLog.loadFilters');
    }
  }

  function persistFilters(next: AuditFilters): void {
    filters = next;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        void chrome.storage.session.set({ [FILTERS_KEY]: next });
      }
    } catch (e) {
      debugCatch(e, 'options.RequestAuditLog.persistFilters');
    }
  }

  function resetFilters(): void {
    persistFilters({ ...EMPTY_FILTERS });
  }

  /** CSS `scroll-behavior` does not reach scrollIntoView, so the query is read here. */
  function scrollBehavior(): 'auto' | 'smooth' {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return reduced ? 'auto' : 'smooth';
  }

  /** Writes the filter, then scrolls the filter row into view so the user sees what changed. */
  function applyQuickFilter(patch: Partial<AuditFilters>): void {
    persistFilters({ ...filters, ...patch });
    queueMicrotask(() => {
      const filterEl = document.querySelector<HTMLElement>('[data-ega-audit-filters]');
      filterEl?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
    });
  }

  function scrollToPinned(): void {
    if (!compareTargetId) return;
    const el = document.querySelector<HTMLElement>(`[data-ega-audit-entry="${compareTargetId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  }

  function entryMatchesQuery(e: AuditEntry, q: string): boolean {
    const needle = q.toLowerCase();
    if (e.error?.message?.toLowerCase().includes(needle)) return true;
    if (e.userPrompt?.toLowerCase().includes(needle)) return true;
    if (e.systemPrompt?.toLowerCase().includes(needle)) return true;
    if (e.response?.toLowerCase().includes(needle)) return true;
    return false;
  }

  function entryMatchesStatus(e: AuditEntry, status: AuditFilters['status']): boolean {
    if (status === 'all') return true;
    if (status === 'error') return Boolean(e.error);
    if (status === 'cache') return Boolean(e.cacheHit);
    // 'ok' — no error AND not a cache hit.
    return !e.error && !e.cacheHit;
  }

  const filtered = $derived.by((): readonly AuditEntry[] => {
    if (!hasActiveFilters(filters)) return entries;
    const q = filters.query.trim();
    return entries.filter((e) => {
      if (filters.task !== 'all' && e.task !== filters.task) return false;
      if (filters.backend !== 'all' && e.backend !== filters.backend) return false;
      if (!entryMatchesStatus(e, filters.status)) return false;
      if (q !== '' && !entryMatchesQuery(e, q)) return false;
      return true;
    });
  });

  const filtersActive = $derived(hasActiveFilters(filters));
  const activeFilterCount = $derived(countActiveFilters(filters));
  const hasMatches = $derived(filtered.length > 0);

  async function refresh(): Promise<void> {
    try {
      entries = await readAuditLog();
      loadError = null;
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  // Without chrome.storage (test env) the list only updates from the Refresh button.
  let listener: ((c: Record<string, chrome.storage.StorageChange>, area: string) => void) | null =
    null;

  onMount(() => {
    void refresh();
    void loadFilters();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      listener = (changes, area) => {
        if (area !== 'local') return;
        if (Object.hasOwn(changes, STORAGE_KEY)) void refresh();
      };
      chrome.storage.onChanged.addListener(listener);
    }
  });

  onDestroy(() => {
    if (listener && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(listener);
    }
  });

  function toggle(id: string): void {
    expanded[id] = !expanded[id];
  }

  function onCompareClick(id: string): void {
    if (compareTargetId === null) {
      compareTargetId = id;
      return;
    }
    if (compareTargetId === id) {
      compareTargetId = null;
      return;
    }
    // Order pair oldest-first so the user sees an older→newer read.
    const a = entries.find((e) => e.id === compareTargetId);
    const b = entries.find((e) => e.id === id);
    if (!a || !b) {
      compareTargetId = null;
      return;
    }
    diffPair = a.ts <= b.ts ? { leftId: a.id, rightId: b.id } : { leftId: b.id, rightId: a.id };
    compareTargetId = null;
  }

  function closeDiff(): void {
    diffPair = null;
    diffYankedNotice = null;
  }

  /** Set when new entries push a pinned id past the audit cap while the diff is open. */
  let diffYankedNotice = $state<string | null>(null);

  const diffLeft = $derived.by((): AuditEntry | null => {
    const pair = diffPair;
    if (!pair) return null;
    return entries.find((e) => e.id === pair.leftId) ?? null;
  });
  const diffRight = $derived.by((): AuditEntry | null => {
    const pair = diffPair;
    if (!pair) return null;
    return entries.find((e) => e.id === pair.rightId) ?? null;
  });

  $effect(() => {
    // Read both sides first so the effect tracks them; the write below must stay untracked.
    const lp = diffLeft;
    const rp = diffRight;
    untrack(() => {
      if (!diffPair) return;
      if (lp === null || rp === null) {
        diffYankedNotice = 'A pinned entry was trimmed from the audit log.';
        diffPair = null;
      }
    });
  });

  function formatTs(ts: number): string {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  function formatLatency(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  async function handleExport(): Promise<void> {
    const json = exportAuditLogAsJson(entries, {
      extensionVersion: chrome.runtime.getManifest().version,
      userAgent: navigator.userAgent,
    });
    downloadTextFile(
      `ega-audit-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      json,
      'application/json',
    );
  }

  async function handleClear(): Promise<void> {
    const ok = await confirmDialog({
      title: 'Clear audit log',
      body: `Discard all ${entries.length} request${entries.length === 1 ? '' : 's'} from the audit log? This cannot be undone.`,
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    const r = await sendMsg({ kind: 'audit:clear' }).catch(() => undefined);
    if (!r?.ok) toastStore.push({ message: 'Could not clear the audit log.', variant: 'danger' });
    await refresh();
    expanded = {};
  }

  const hasEntries = $derived(entries.length > 0);
</script>

<div class="request-audit-log" data-ega-request-audit-log>
  <RequestAuditLogActions
    count={entries.length}
    matchCount={filtersActive ? filtered.length : null}
    {hasEntries}
    {compareTargetId}
    {activeFilterCount}
    onRefresh={refresh}
    onExport={handleExport}
    onClear={handleClear}
    onCancelCompare={() => (compareTargetId = null)}
    onScrollToPinned={scrollToPinned}
    onClearFilters={resetFilters}
  />

  {#if hasEntries}
    <RequestAuditLogFilters {filters} onChange={persistFilters} />
  {/if}

  {#if loadError}
    <div class="err" role="alert">Failed to load audit log: {loadError}</div>
  {/if}

  {#if diffYankedNotice}
    <div class="info" role="status" data-ega-audit-diff-yanked-notice>
      {diffYankedNotice}
      <button
        type="button"
        class="info-dismiss"
        aria-label="Dismiss"
        onclick={() => (diffYankedNotice = null)}>×</button
      >
    </div>
  {/if}

  {#if !hasEntries}
    <EmptyState
      title="No translations logged yet"
      description="Every request shows here with backend, latency, and start of each prompt — useful for debugging cache misses or a slow backend."
      icon={ScrollText}
    />
  {:else if !hasMatches}
    <EmptyState
      title="No matches"
      description="None of the {entries.length} logged requests match the active filters."
      icon={SearchX}
      ctaLabel="Clear filters"
      onCta={resetFilters}
    />
  {:else}
    <ul class="entry-list" role="list">
      {#each filtered as entry (entry.id)}
        <RequestAuditLogEntry
          {entry}
          isOpen={Boolean(expanded[entry.id])}
          compareSelected={compareTargetId === entry.id}
          {formatTs}
          {formatLatency}
          onToggle={() => toggle(entry.id)}
          onCompareClick={() => onCompareClick(entry.id)}
          onQuickFilterTask={(task) => applyQuickFilter({ task })}
          onQuickFilterBackend={(backend) => applyQuickFilter({ backend })}
        />
      {/each}
    </ul>
  {/if}
</div>

{#if diffLeft && diffRight}
  <AuditDiffModal
    left={diffLeft}
    right={diffRight}
    {formatTs}
    {formatLatency}
    onClose={closeDiff}
    onPinLeftAndPickAgain={() => {
      // Keep the left side as the new anchor so the user only picks a fresh right-hand entry.
      const pinned = diffLeft?.id ?? null;
      diffPair = null;
      compareTargetId = pinned;
    }}
  />
{/if}

<style>
  .request-audit-log {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .err {
    color: var(--color-danger);
    font-size: var(--fs-sm);
  }
  .info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    color: var(--color-fg-subtle);
    font-size: var(--fs-sm);
  }
  .info-dismiss {
    background: transparent;
    border: 0;
    color: var(--color-muted);
    font-size: var(--fs-md);
    cursor: pointer;
    padding: 0 var(--space-1);
  }
  .entry-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    overflow: hidden;
  }
</style>
