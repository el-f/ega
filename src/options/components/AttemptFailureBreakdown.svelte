<script lang="ts">
  import { onMount } from 'svelte';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import { readAuditLog, type AuditEntry } from '@/shared/audit-log';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import { relativeTime } from '@/shared/relative-time';
  import { errCodeLabel } from '@/shared/err-labels';
  import { ALL_ERR_CODES, type ErrCode } from '@/shared/types';

  // An old log row can carry a code this build no longer knows.
  function codeLabel(code: string): string {
    return (ALL_ERR_CODES as readonly string[]).includes(code)
      ? errCodeLabel(code as ErrCode)
      : 'Error';
  }

  const HOUR_MS = 3_600_000;

  interface CodeRow {
    code: string;
    count: number;
    latestMessage: string;
    lastSeen: number;
  }

  let rows = $state<readonly CodeRow[]>([]);
  let loaded = $state<boolean>(false);
  let nowTs = $state<number>(Date.now());

  function aggregate(log: readonly AuditEntry[], now: number): readonly CodeRow[] {
    const cutoff = now - HOUR_MS;
    const byCode: Record<string, CodeRow> = {};
    for (const entry of log) {
      if (!entry.error) continue;
      if (entry.ts < cutoff) continue;
      const existing = byCode[entry.error.code];
      if (existing === undefined) {
        byCode[entry.error.code] = {
          code: entry.error.code,
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
    return Object.values(byCode).sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
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
    <p class="loading">Loading…</p>
  {:else if rows.length === 0}
    <EmptyState
      icon={CheckCircle2}
      title="No errors in the last hour"
      description="No request failed in the last hour."
    />
  {:else}
    <table class="breakdown">
      <thead>
        <tr>
          <th scope="col">Error</th>
          <th scope="col" class="num">Count</th>
          <th scope="col">Latest message</th>
          <th scope="col">Last seen</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.code)}
          {@const canceled = row.code === 'ABORTED'}
          <tr>
            <td>{codeLabel(row.code)} <code>{row.code}</code></td>
            <td class="num">{row.count}</td>
            <td class="msg" class:canceled title={row.latestMessage}
              >{canceled
                ? 'Stopped before it finished: a cancel or a closed tab'
                : row.latestMessage}</td
            >
            <td>{relativeTime(row.lastSeen, nowTs)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .attempt-failure-breakdown {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .loading {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .breakdown {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);
  }
  .breakdown th {
    text-align: left;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-fg-subtle);
    font-weight: 600;
  }
  .breakdown th.num,
  .breakdown td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .breakdown td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border-subtle);
    color: var(--color-fg);
    vertical-align: top;
  }
  .breakdown tbody tr:last-child td {
    border-bottom: 0;
  }
  .breakdown td.msg.canceled {
    color: var(--color-muted);
  }
  .breakdown td.msg {
    color: var(--color-danger);
    max-width: 28ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  code {
    font-family: var(--font-mono);
    color: var(--color-fg);
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: 1px var(--space-1);
  }
</style>
