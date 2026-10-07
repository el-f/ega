<script lang="ts">
  import type { TaskView } from '@/shared/task-view';
  import { auditTaskLabel } from './audit-filters';
  /** Side-by-side diff of two audit entries. */
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import type { AuditEntry } from '@/shared/audit-log';

  interface Props {
    left: AuditEntry;
    right: AuditEntry;
    onClose: () => void;
    /** Closes the modal but keeps the left entry pinned for a new right-side pick. Hidden when absent. */
    onPinLeftAndPickAgain?: () => void;
    formatTs: (ts: number) => string;
    formatLatency: (ms: number) => string;
    /** Every task, on or off; names custom tasks. */
    taskViews?: readonly TaskView[];
  }

  let {
    left,
    right,
    onClose,
    onPinLeftAndPickAgain,
    formatTs,
    formatLatency,
    taskViews = [],
  }: Props = $props();

  function metaSummary(e: AuditEntry): string {
    const lines: string[] = [];
    lines.push(`time        ${formatTs(e.ts)}`);
    lines.push(`task        ${auditTaskLabel(e.task, taskViews)}`);
    lines.push(`backend     ${e.backend}`);
    lines.push(`model       ${e.model}`);
    lines.push(`languages   ${e.sourceLang} → ${e.targetLang}`);
    lines.push(`latency     ${formatLatency(e.latencyMs)}`);
    if (e.firstTokenMs !== undefined) {
      lines.push(`first token ${formatLatency(e.firstTokenMs)}`);
    }
    if (e.cacheHit) lines.push('cache       hit');
    if (e.error) lines.push(`error       ${e.error.code}: ${e.error.message}`);
    return lines.join('\n');
  }
</script>

<Dialog open={true} title="Compare two requests" {onClose} size="xl">
  {#snippet help()}The older request is on the left{/snippet}
  {#snippet actions()}
    <Button variant="secondary" onclick={onClose}>Close</Button>
    {#if onPinLeftAndPickAgain}
      <Button
        variant="primary"
        dataAttrs={{ 'data-ega-diff-pin-left': 'true' }}
        onclick={onPinLeftAndPickAgain}
      >
        Keep the left one, pick another
      </Button>
    {/if}
  {/snippet}

  <div class="diff-grid" data-ega-audit-diff-modal>
    <div class="diff-col">
      <h4>Meta</h4>
      <pre class="diff-block" data-ega-diff-meta-left>{metaSummary(left)}</pre>
      <h4>System</h4>
      <pre class="diff-block" dir="auto" data-ega-diff-system-left>{left.systemPrompt}</pre>
      <h4>User</h4>
      <pre class="diff-block" dir="auto" data-ega-diff-user-left>{left.userPrompt}</pre>
      <h4>Response</h4>
      <pre class="diff-block" dir="auto" data-ega-diff-response-left>{left.response}</pre>
    </div>
    <div class="diff-col">
      <h4>Meta</h4>
      <pre class="diff-block" data-ega-diff-meta-right>{metaSummary(right)}</pre>
      <h4>System</h4>
      <pre class="diff-block" dir="auto" data-ega-diff-system-right>{right.systemPrompt}</pre>
      <h4>User</h4>
      <pre class="diff-block" dir="auto" data-ega-diff-user-right>{right.userPrompt}</pre>
      <h4>Response</h4>
      <pre class="diff-block" dir="auto" data-ega-diff-response-right>{right.response}</pre>
    </div>
  </div>
</Dialog>

<style>
  .diff-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .diff-col {
    min-width: 0;
  }
  .diff-grid h4 {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .diff-block {
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 18vh;
    overflow: auto;
    margin: 0;
  }
</style>
