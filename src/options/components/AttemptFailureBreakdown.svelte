<script lang="ts">
  /** Recent errors: one row per error and backend in the last hour, in the shared plain words; Details holds the raw message and code. */
  import { onMount } from 'svelte';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import { readAuditLog, type AuditEntry } from '@/shared/audit-log';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import Disclosure from '@/options/components/Disclosure.svelte';
  import { relativeTime } from '@/shared/relative-time';
  import { errorCopy } from '@/shared/error-copy';
  import { auditBackendLabel as nameOf } from './audit-filters';

  const HOUR_MS = 3_600_000;

  interface ErrorRow {
    key: string;
    code: string;
    backend: string;
    count: number;
    latestMessage: string;
    lastSeen: number;
  }

  let rows = $state<readonly ErrorRow[]>([]);
  let loaded = $state<boolean>(false);
  let nowTs = $state<number>(Date.now());

  // The same error from the same backend is one row with a count.
  function aggregate(log: readonly AuditEntry[], now: number): readonly ErrorRow[] {
    const cutoff = now - HOUR_MS;
    const byKey: Record<string, ErrorRow> = {};
    for (const entry of log) {
      if (!entry.error || entry.ts < cutoff) continue;
      const key = `${entry.error.code}\u0000${entry.backend}`;
      const existing = byKey[key];
      if (existing === undefined) {
        byKey[key] = {
          key,
          code: entry.error.code,
          backend: entry.backend,
          count: 1,
          latestMessage: entry.error.message,
          lastSeen: entry.ts,
        };
      } else {
        existing.count += 1;
        if (entry.ts > existing.lastSeen) {
          existing.lastSeen = entry.ts;
          existing.latestMessage = entry.error.message;
        }
      }
    }
    return Object.values(byKey).sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
  }

  onMount(() => {
    let cancelled = false;
    void readAuditLog().then((log) => {
      if (cancelled) return;
      nowTs = Date.now();
      rows = aggregate(log, nowTs);
      loaded = true;
    });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="attempt-failure-breakdown" data-ega-attempt-failure-breakdown>
  {#if !loaded}
    <p class="line">Loading...</p>
  {:else if rows.length === 0}
    <EmptyState icon={CheckCircle2} title="No errors in the last hour" />
  {:else}
    <ul class="errors">
      {#each rows as row (row.key)}
        {@const copy = errorCopy(row.code, row.latestMessage, { backend: nameOf(row.backend) })}
        <li class="error-row" data-ega-recent-error={row.code}>
          <div class="error-line">
            <span class="error-title">{copy?.title ?? 'Stopped before it finished'}</span>
            <span class="error-meta">
              {nameOf(row.backend)} · {row.count}
              {row.count === 1 ? 'time' : 'times'} · last {relativeTime(row.lastSeen, nowTs)}
            </span>
          </div>
          <p class="line">{copy?.body ?? 'A cancel or a closed tab stopped the request.'}</p>
          <Disclosure label="Details">
            <p class="detail">{row.latestMessage}<br />Code: {row.code}</p>
          </Disclosure>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .errors {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .error-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-block: var(--space-2);
  }
  .error-row + .error-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .error-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
  }
  .error-title {
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .error-meta,
  .line {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .detail {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }
</style>
