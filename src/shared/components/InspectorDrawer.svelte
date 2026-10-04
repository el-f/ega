<script lang="ts">
  import type { ResultMeta } from '@/shared/types';
  import Info from '@lucide/svelte/icons/info';
  import X from '@lucide/svelte/icons/x';
  import Icon from '@/shared/ui/Icon.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { formatDetectedLabel } from '@/shared/detected-label';

  interface Props {
    meta: ResultMeta;
    open: boolean;
    onClose: () => void;
  }

  let { meta, open, onClose }: Props = $props();

  /** 'auto' and preset ids are not ISO, so this goes through the resolver the detected-language pill uses. */
  function langLabel(v: string | undefined, fallback: string): string {
    if (v === undefined || v === '') return fallback;
    if (v === 'auto') return 'Auto-detect';
    return formatDetectedLabel(v, undefined) || v;
  }

  function formatLatency(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }

  const rows = $derived.by(() => {
    const out: Array<{ label: string; value: string }> = [];
    out.push({ label: 'Backend', value: backendLabel(meta.backendId) });
    if (meta.modelId) out.push({ label: 'Model', value: meta.modelId });
    // Only a hit is shown: a miss is the normal state and reads to users as a fault.
    if (meta.cacheHit) out.push({ label: 'Cache', value: 'Hit' });
    if (meta.sourceLang || meta.targetLang) {
      out.push({
        label: 'Direction',
        value: `${langLabel(meta.sourceLang, 'Auto-detect')} → ${langLabel(meta.targetLang, 'unknown')}`,
      });
    }
    if (meta.firstTokenMs !== undefined) {
      out.push({ label: 'First token', value: formatLatency(meta.firstTokenMs) });
    }
    out.push({ label: 'Total time', value: formatLatency(meta.latencyMs) });
    if (meta.inputTokens !== undefined) {
      out.push({ label: 'Input tokens', value: String(meta.inputTokens) });
    }
    if (meta.outputTokens !== undefined) {
      out.push({ label: 'Output tokens', value: String(meta.outputTokens) });
    }
    if (meta.reasoningTokens !== undefined) {
      out.push({ label: 'Thinking tokens', value: String(meta.reasoningTokens) });
    }
    if (meta.cacheReadTokens !== undefined) {
      out.push({ label: 'Cache-read tokens', value: String(meta.cacheReadTokens) });
    }
    if (meta.cacheWriteTokens !== undefined) {
      out.push({ label: 'Cache-write tokens', value: String(meta.cacheWriteTokens) });
    }
    return out;
  });
  const attempts = $derived(meta.attempts ?? []);
  const showAttempts = $derived(attempts.length > 1);
</script>

{#if open}
  <aside class="inspector-drawer" role="region" aria-label="Translation details" data-ega-inspector>
    <header class="inspector-head">
      <Icon icon={Info} size={16} />
      <span class="inspector-title">Details</span>
      <IconButton icon={X} ariaLabel="Close details" size="sm" onclick={onClose} />
    </header>
    <dl class="inspector-rows">
      {#each rows as row (row.label)}
        <div class="inspector-row">
          <dt>{row.label}</dt>
          <dd>
            <span class="inspector-value">{row.value}</span>
          </dd>
        </div>
      {/each}
    </dl>
    {#if showAttempts}
      <div class="inspector-attempts">
        <div class="inspector-attempts-head">Backends tried ({attempts.length})</div>
        <ol class="inspector-attempts-list">
          {#each attempts as a, i (i)}
            <li class="inspector-attempt" class:is-error={a.status === 'error'}>
              <div class="inspector-attempt-head">
                <span class="inspector-attempt-num">{i + 1}</span>
                <span class="inspector-attempt-id">{backendLabel(a.backendId)}</span>
                <span class="inspector-attempt-status">
                  {a.status === 'ok' ? 'ok' : (a.code ?? 'error')}
                </span>
                <span class="inspector-attempt-latency">{formatLatency(a.latencyMs)}</span>
              </div>
              {#if a.message}
                <div class="inspector-attempt-msg">{a.message}</div>
              {/if}
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .inspector-drawer {
    margin-top: var(--space-2);
    padding: var(--space-2);
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--fs-xs);
  }
  .inspector-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .inspector-title {
    flex: 1;
    font-weight: 600;
    color: var(--color-fg);
  }
  .inspector-rows {
    margin: 0;
    display: grid;
    gap: 2px;
  }
  .inspector-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }
  .inspector-row dt {
    color: var(--color-muted);
    font-weight: normal;
  }
  .inspector-row dd {
    margin: 0;
    text-align: right;
    min-width: 0;
    max-width: 70%;
  }
  .inspector-value {
    color: var(--color-fg);
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
  .inspector-attempts {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
  }
  .inspector-attempts-head {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: var(--space-1);
  }
  .inspector-attempts-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .inspector-attempt {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
  }
  .inspector-attempt.is-error {
    border-color: var(--color-danger);
    background: var(--color-danger-bg-soft);
  }
  .inspector-attempt-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--fs-xs);
    font-family: var(--font-mono);
  }
  .inspector-attempt-num {
    color: var(--color-muted);
    flex: 0 0 auto;
  }
  .inspector-attempt-id {
    flex: 1 1 auto;
    color: var(--color-fg);
  }
  .inspector-attempt-status {
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .inspector-attempt.is-error .inspector-attempt-status {
    color: var(--color-danger);
  }
  .inspector-attempt-latency {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .inspector-attempt-msg {
    margin-top: 4px;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    word-break: break-word;
    overflow-wrap: anywhere;
  }
</style>
