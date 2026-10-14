<script lang="ts">
  import type { AuditEntry } from '@/shared/audit-log';
  import { tokenPairLabel } from './audit-filters';

  interface Props {
    entry: AuditEntry;
    formatLatency: (ms: number) => string;
  }

  const { entry, formatLatency }: Props = $props();
  const tokens = $derived(tokenPairLabel(entry));
</script>

<div class="entry-body">
  <dl class="entry-meta">
    <div class="meta-row">
      <dt>Model</dt>
      <dd><code>{entry.model}</code></dd>
    </div>
    <div class="meta-row">
      <dt>Languages</dt>
      <dd>
        <code>{entry.sourceLang}</code> → <code>{entry.targetLang}</code>
      </dd>
    </div>
    {#if entry.requestId}
      <div class="meta-row">
        <dt>Request id</dt>
        <dd><code data-ega-audit-request-id>{entry.requestId}</code></dd>
      </div>
    {/if}
    {#if entry.firstTokenMs !== undefined}
      <div class="meta-row">
        <dt>First token</dt>
        <dd>{formatLatency(entry.firstTokenMs)}</dd>
      </div>
    {/if}
    {#if tokens}
      <div class="meta-row">
        <dt>Tokens</dt>
        <dd class="entry-tokens">{tokens}</dd>
      </div>
    {/if}
    {#if entry.confidence !== undefined}
      <div class="meta-row">
        <dt>Confidence</dt>
        <dd>{entry.confidence.toFixed(2)}</dd>
      </div>
    {/if}
    {#if entry.error}
      <div class="meta-row">
        <dt>Technical</dt>
        <dd class="error-detail">
          <code>{entry.error.code}</code>: {entry.error.message}
        </dd>
      </div>
    {/if}
  </dl>

  <section class="panel">
    <h3 class="panel-title">System</h3>
    <pre class="panel-pre" dir="auto" data-ega-audit-system>{entry.systemPrompt}</pre>
  </section>

  <section class="panel">
    <h3 class="panel-title">User</h3>
    <pre class="panel-pre" dir="auto" data-ega-audit-user>{entry.userPrompt}</pre>
  </section>

  <!-- A failed request stores no answer; an empty box would read as an empty answer. -->
  {#if entry.response !== ''}
    <section class="panel">
      <h3 class="panel-title">Response</h3>
      <pre class="panel-pre" dir="auto" data-ega-audit-response>{entry.response}</pre>
    </section>
  {/if}
</div>

<style>
  .entry-body {
    padding-block: var(--space-2) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .entry-meta {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);
    margin: 0;
  }
  @media (min-width: 36rem) {
    .entry-meta {
      grid-template-columns: 1fr 1fr;
    }
  }
  .meta-row {
    display: flex;
    gap: var(--space-2);
    font-size: var(--fs-sm);
  }
  .meta-row dt {
    color: var(--color-fg-subtle);
    flex: 0 0 auto;
    min-width: 6rem;
  }
  .meta-row dd {
    margin: 0;
    color: var(--color-fg);
  }
  .meta-row code {
    font-family: var(--font-mono);
  }
  .error-detail {
    color: var(--color-danger);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .panel-title {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-fg-subtle);
  }
  .panel-pre {
    margin: 0;
    padding: var(--space-2);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    line-height: 1.5;
    color: var(--color-fg);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 14rem;
    overflow: auto;
  }
</style>
