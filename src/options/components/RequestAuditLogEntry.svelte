<script lang="ts">
  import type { AuditEntry } from '@/shared/audit-log';
  import RequestAuditLogEntryBody from './RequestAuditLogEntryBody.svelte';
  import GitCompare from '@lucide/svelte/icons/git-compare';

  interface Props {
    entry: AuditEntry;
    isOpen: boolean;
    /** This entry is the first diff pick; its compare button renders selected. */
    compareSelected: boolean;
    formatTs: (ts: number) => string;
    formatLatency: (ms: number) => string;
    onToggle: () => void;
    onCompareClick: () => void;
    /** Clicking the task or backend cell applies that filter. */
    onQuickFilterTask?: (task: AuditEntry['task']) => void;
    onQuickFilterBackend?: (backend: string) => void;
  }

  const {
    entry,
    isOpen,
    compareSelected,
    formatTs,
    formatLatency,
    onToggle,
    onCompareClick,
    onQuickFilterTask,
    onQuickFilterBackend,
  }: Props = $props();
</script>

<li class="entry-item" data-ega-audit-entry={entry.id}>
  <div class="entry-row">
    <button
      type="button"
      class="entry-toggle"
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Collapse entry' : 'Expand entry'}
      onclick={onToggle}
      data-ega-audit-entry-toggle
    >
      <span class="entry-chevron" class:open={isOpen} aria-hidden="true"></span>
      <span class="entry-ts">{formatTs(entry.ts)}</span>
    </button>
    <button
      type="button"
      class="entry-cell entry-task"
      onclick={() => onQuickFilterTask?.(entry.task)}
      disabled={!onQuickFilterTask}
      aria-label={`Filter by task ${entry.task}`}
      title="Filter by this task"
      data-ega-audit-quickfilter="task"
    >
      {entry.task}
    </button>
    <button
      type="button"
      class="entry-cell entry-backend"
      onclick={() => onQuickFilterBackend?.(entry.backend)}
      disabled={!onQuickFilterBackend}
      aria-label={`Filter by backend ${entry.backend}`}
      title="Filter by this backend"
      data-ega-audit-quickfilter="backend"
    >
      <code>{entry.backend}</code>
    </button>
    <button
      type="button"
      class="entry-tail"
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Collapse entry' : 'Expand entry'}
      onclick={onToggle}
      tabindex="-1"
    >
      <span class="entry-latency">{formatLatency(entry.latencyMs)}</span>
      {#if entry.cacheHit}
        <span class="pill pill-cache">cache</span>
      {/if}
      {#if entry.error}
        <span class="pill pill-error" title={entry.error.message}>error</span>
      {/if}
    </button>
    <button
      type="button"
      class="compare-btn"
      class:selected={compareSelected}
      aria-pressed={compareSelected}
      aria-label={compareSelected ? 'Cancel compare selection' : 'Compare this entry'}
      title={compareSelected ? 'Cancel compare selection' : 'Compare this entry'}
      onclick={onCompareClick}
      data-ega-audit-compare={entry.id}
    >
      <GitCompare size={12} aria-hidden="true" />
    </button>
  </div>

  {#if isOpen}
    <RequestAuditLogEntryBody {entry} {formatLatency} />
  {/if}
</li>

<style>
  .entry-item {
    border-bottom: 1px solid var(--color-border);
  }
  .entry-item:last-child {
    border-bottom: 0;
  }
  .entry-row {
    display: flex;
    align-items: stretch;
  }
  .entry-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 0;
    cursor: pointer;
    text-align: left;
    color: var(--color-fg);
    font-size: var(--fs-sm);
    flex: 0 0 auto;
  }
  .entry-toggle:hover,
  .entry-toggle:focus-visible {
    background: var(--color-bg);
    outline: none;
  }
  .entry-tail {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 0;
    cursor: pointer;
    text-align: left;
    color: var(--color-fg);
    font-size: var(--fs-sm);
  }
  .entry-tail:hover,
  .entry-tail:focus-visible {
    background: var(--color-bg);
    outline: none;
  }
  .entry-cell {
    display: inline-flex;
    align-items: center;
    background: transparent;
    border: 0;
    padding: var(--space-2) var(--space-1);
    color: var(--color-fg-subtle);
    font: inherit;
    font-size: var(--fs-xs);
    cursor: pointer;
    flex: 0 0 auto;
    border-radius: var(--radius-sm);
  }
  .entry-cell:hover:not(:disabled),
  .entry-cell:focus-visible:not(:disabled) {
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    outline: none;
  }
  .entry-cell:disabled {
    cursor: default;
  }
  .entry-chevron {
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--color-muted);
    border-bottom: 2px solid var(--color-muted);
    transform: rotate(-45deg);
    transition: transform var(--motion-fast) var(--ease-out);
    flex: 0 0 auto;
  }
  .entry-chevron.open {
    transform: rotate(45deg);
  }
  .entry-ts {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    flex: 0 0 auto;
  }
  .entry-task {
    font-size: var(--fs-xs);
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex: 0 0 auto;
  }
  .entry-backend {
    flex: 0 0 auto;
  }
  .entry-backend code {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
  }
  .entry-latency {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    margin-left: auto;
    flex: 0 0 auto;
  }
  .pill {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--fs-xs);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg-subtle);
    flex: 0 0 auto;
  }
  .pill-cache {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
  .pill-error {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
  .compare-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    /* The global `button { padding: 4px 12px }` leaves 3px of content box at this width. */
    padding: 0;
    background: transparent;
    border: 0;
    border-left: 1px solid var(--color-border-subtle);
    color: var(--color-fg-subtle);
    cursor: pointer;
  }
  .compare-btn:hover,
  .compare-btn:focus-visible {
    background: var(--color-bg);
    color: var(--color-fg);
    outline: none;
  }
  .compare-btn.selected {
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
  }
</style>
