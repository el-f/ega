<script lang="ts">
  /** One request in words: task, backend, time taken, status, when; Details opens the rest in place. */
  import type { AuditEntry } from '@/shared/audit-log';
  import type { TaskView } from '@/shared/task-view';
  import Button from '@/shared/ui/Button.svelte';
  import { relativeTime } from '@/shared/relative-time';
  import { auditBackendLabel, auditStatusLabel, auditTaskLabel } from './audit-filters';
  import RequestAuditLogEntryBody from './RequestAuditLogEntryBody.svelte';

  interface Props {
    entry: AuditEntry;
    isOpen: boolean;
    /** This entry is the first compare pick; its Compare button renders pressed. */
    compareSelected: boolean;
    /** The clock the relative times are counted from. */
    now: number;
    formatTs: (ts: number) => string;
    formatLatency: (ms: number) => string;
    onToggle: () => void;
    onCompareClick: () => void;
    /** Every task, on or off; names custom tasks. */
    taskViews?: readonly TaskView[];
  }

  const {
    entry,
    isOpen,
    compareSelected,
    now,
    formatTs,
    formatLatency,
    onToggle,
    onCompareClick,
    taskViews = [],
  }: Props = $props();

  const taskName = $derived(auditTaskLabel(entry.task, taskViews));
  const backendName = $derived(auditBackendLabel(entry.backend));
  const status = $derived(auditStatusLabel(entry));
  const failed = $derived(entry.error !== undefined && entry.error.code !== 'ABORTED');
  const bodyId = $derived(`ega-audit-body-${entry.id}`);
</script>

<li class="entry-item" data-ega-audit-entry={entry.id}>
  <div class="entry-row">
    <span class="entry-task">{taskName}</span>
    <span class="entry-cell">{backendName}</span>
    <span class="entry-cell entry-num">{formatLatency(entry.latencyMs)}</span>
    <span class="entry-status" class:failed data-ega-audit-status>{status}</span>
    <span class="entry-cell entry-when">
      <span aria-hidden="true">{relativeTime(entry.ts, now)}</span>
      <span class="ega-sr-only">{formatTs(entry.ts)}</span>
    </span>
    <Button
      variant="ghost"
      size="sm"
      ariaLabel={`Details: ${taskName}, ${formatTs(entry.ts)}`}
      dataAttrs={{
        'data-ega-audit-entry-toggle': true,
        'aria-expanded': isOpen ? 'true' : 'false',
        'aria-controls': bodyId,
      }}
      onclick={onToggle}>Details</Button
    >
  </div>

  {#if isOpen}
    <div id={bodyId}>
      <RequestAuditLogEntryBody {entry} {formatLatency} />
      <div class="entry-compare">
        <Button
          variant="secondary"
          size="sm"
          dataAttrs={{
            'data-ega-audit-compare': entry.id,
            'aria-pressed': compareSelected ? 'true' : 'false',
          }}
          onclick={onCompareClick}>Compare</Button
        >
      </div>
    </div>
  {/if}
</li>

<style>
  .entry-item:not(:first-child) {
    border-top: 1px solid var(--color-border-subtle);
  }
  .entry-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    padding-block: var(--space-1);
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .entry-task {
    font-weight: 600;
    color: var(--color-fg);
  }
  .entry-cell {
    color: var(--color-muted);
  }
  .entry-num {
    font-variant-numeric: tabular-nums;
  }
  .entry-status {
    color: var(--color-fg);
  }
  .entry-status.failed {
    color: var(--color-danger-fg);
  }
  .entry-when {
    margin-inline-start: auto;
  }
  .entry-compare {
    display: flex;
    padding-block: var(--space-2);
  }
</style>
