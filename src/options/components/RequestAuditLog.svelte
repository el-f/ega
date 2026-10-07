<script lang="ts">
  /** Recent requests: the last requests in words, one filter row, Details in place, and Compare for two of them. */
  import { onDestroy, onMount, untrack } from 'svelte';
  import {
    AUDIT_LOG_CAP,
    readAuditLog,
    exportAuditLogAsJson,
    type AuditEntry,
  } from '@/shared/audit-log';
  import { sendMsg } from '@/shared/messages';
  import { toastStore } from '@/shared/components/toastStore';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
  import RequestAuditLogActions from './RequestAuditLogActions.svelte';
  import RequestAuditLogEntry from './RequestAuditLogEntry.svelte';
  import RequestAuditLogFilters from './RequestAuditLogFilters.svelte';
  import AuditDiffModal from './AuditDiffModal.svelte';
  import {
    EMPTY_FILTERS,
    hasActiveFilters,
    tokenTotalLabel,
    type AuditFilters,
  } from './audit-filters';
  import { debugCatch } from '@/shared/logger';
  import { getCustomTasks, getSettings } from '@/shared/storage';
  import { materializeTasks, type TaskView } from '@/shared/task-view';
  import { downloadTextFile } from '@/shared/download-file';

  const STORAGE_KEY = 'egaAuditLog';
  const FILTERS_KEY = 'ega.audit-log.filters';

  let entries = $state.raw<readonly AuditEntry[]>([]);
  let nowTs = $state<number>(Date.now());
  let expanded = $state<Record<string, boolean>>({});
  let loadError = $state<string | null>(null);
  let filters = $state<AuditFilters>({ ...EMPTY_FILTERS });
  let taskViews = $state.raw<readonly TaskView[]>([]);
  const seenTasks = $derived([...new Set(entries.map((e) => e.task))]);

  async function loadTaskViews(): Promise<void> {
    try {
      const [s, customs] = await Promise.all([getSettings(), getCustomTasks()]);
      taskViews = materializeTasks(s, customs);
    } catch (e) {
      debugCatch(e, 'options.RequestAuditLog.loadTaskViews');
    }
  }
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
  const hasMatches = $derived(filtered.length > 0);

  async function refresh(): Promise<void> {
    try {
      entries = await readAuditLog();
      nowTs = Date.now();
      loadError = null;
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  let listener: ((c: Record<string, chrome.storage.StorageChange>, area: string) => void) | null =
    null;

  onMount(() => {
    void refresh();
    void loadFilters();
    void loadTaskViews();
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
        diffYankedNotice = 'A compared request left the list, so the comparison closed.';
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
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
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

  // ponytail: a confirm, not Undo — Undo needs a worker message that writes the old list back.
  async function handleClear(): Promise<void> {
    const n = entries.length;
    const ok = await confirmDialog({
      title: 'Clear recent requests?',
      body: `This removes ${n === 1 ? 'the 1 request' : `all ${n} requests`} from this list.`,
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    await clearNow();
  }

  async function clearNow(): Promise<void> {
    const r = await sendMsg({ kind: 'audit:clear' }).catch(() => undefined);
    if (!r?.ok) {
      toastStore.push({
        message: 'Could not clear the request list',
        variant: 'danger',
        action: { label: 'Try again', onClick: () => void clearNow() },
      });
    }
    await refresh();
    expanded = {};
  }

  const hasEntries = $derived(entries.length > 0);
  const tokenTotal = $derived(tokenTotalLabel(entries));
</script>

<SectionCard
  title="Recent requests"
  description={`The last ${AUDIT_LOG_CAP} requests, kept on this computer`}
  info={{
    label: 'About this list',
    text: 'Nothing here is synced. Clear removes it, and so does Delete all data.',
  }}
>
  {#snippet headerActions()}
    {#if hasEntries}
      <Button
        variant="secondary"
        size="sm"
        dataAttrs={{ 'data-ega-audit-export': true }}
        onclick={() => void handleExport()}>Export</Button
      >
      <Button
        variant="secondary"
        size="sm"
        dataAttrs={{ 'data-ega-audit-clear': true }}
        onclick={() => void handleClear()}>Clear</Button
      >
    {/if}
  {/snippet}
  <div class="request-audit-log" data-ega-request-audit-log>
    {#if hasEntries}
      <RequestAuditLogFilters {filters} onChange={persistFilters} {taskViews} {seenTasks} />
    {/if}

    <RequestAuditLogActions
      matchCount={filtersActive && hasMatches ? filtered.length : null}
      {compareTargetId}
      onClearFilters={resetFilters}
      onCancelCompare={() => (compareTargetId = null)}
      onScrollToPinned={scrollToPinned}
    />

    {#if loadError}
      <p class="err" role="alert">The request list did not load: {loadError}</p>
    {/if}

    {#if diffYankedNotice}
      <div class="info" role="status" data-ega-audit-diff-yanked-notice>
        <span>{diffYankedNotice}</span>
        <Button variant="ghost" size="sm" onclick={() => (diffYankedNotice = null)}>Dismiss</Button>
      </div>
    {/if}

    {#if !hasEntries}
      <EmptyState
        title="No requests yet"
        description="Requests show here after you translate"
        icon={ScrollText}
      />
    {:else if !hasMatches}
      <div class="no-match" role="status" data-ega-audit-no-match>
        <span>No request matches these filters</span>
        <Button variant="ghost" size="sm" onclick={resetFilters}>Clear filters</Button>
      </div>
    {:else}
      <ul class="entry-list">
        {#each filtered as entry (entry.id)}
          <RequestAuditLogEntry
            {entry}
            isOpen={Boolean(expanded[entry.id])}
            compareSelected={compareTargetId === entry.id}
            now={nowTs}
            {formatTs}
            {formatLatency}
            onToggle={() => toggle(entry.id)}
            onCompareClick={() => onCompareClick(entry.id)}
            {taskViews}
          />
        {/each}
      </ul>
      {#if tokenTotal}
        <p class="token-total">Tokens in this list: {tokenTotal}</p>
      {/if}
    {/if}
  </div>
</SectionCard>

{#if diffLeft && diffRight}
  <AuditDiffModal
    left={diffLeft}
    right={diffRight}
    {taskViews}
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
    margin: 0;
    color: var(--color-danger);
    font-size: var(--fs-base);
  }
  .token-total {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .info,
  .no-match {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .entry-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
