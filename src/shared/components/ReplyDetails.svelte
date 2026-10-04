<script lang="ts">
  import type { PageContext, ResultMeta } from '@/shared/types';
  import { aroundText, shortUrl } from './reply-details';
  import X from '@lucide/svelte/icons/x';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { errCodeLabel } from '@/shared/err-labels';
  import { formatDetectedLabel } from '@/shared/detected-label';
  import type { ErrCode } from '@/shared/types';

  interface Props {
    /** Absent when result details are off in Settings, or the reply carried none. */
    meta?: ResultMeta | undefined;
    /** undefined: the request recorded no page info; null: none was sent. */
    context?: PageContext | null | undefined;
    /** The text the request carried: the selection, or what the user typed. */
    sentText: string;
    /** Name of the task whose prompt wrapped the text, e.g. "Translate". */
    taskLabel: string;
    /** Opens the task in Settings, where its prompt and preview live. */
    onViewPrompt?: (() => void) | undefined;
    /** The tooltip sends no earlier messages; the side panel says how many each reply carried. */
    surface: 'tooltip' | 'panel';
    /** Language of the page text shown; '' is unknown. Our UI around it is English. */
    valueLang?: string;
    onClose: () => void;
  }

  let {
    meta,
    context,
    sentText,
    taskLabel,
    onViewPrompt,
    surface,
    valueLang = '',
    onClose,
  }: Props = $props();

  let showAllPage = $state(false);
  let copied = $state(false);

  function formatTime(ms: number): string {
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
  }

  const around = $derived(aroundText(context, sentText));
  const pageFields = $derived.by(() => {
    if (!context) return [];
    const out: Array<{ label: string; value: string; mono?: boolean }> = [];
    if (context.pageTitle) out.push({ label: 'Title', value: context.pageTitle });
    if (context.pageUrl) out.push({ label: 'Address', value: context.pageUrl, mono: true });
    if (context.siteName) out.push({ label: 'Site', value: context.siteName });
    if (context.pageLang) out.push({ label: 'Language', value: context.pageLang });
    if (context.pageDescription) out.push({ label: 'Description', value: context.pageDescription });
    if (context.headingTrail?.length) {
      out.push({ label: 'Headings', value: context.headingTrail.join(' › ') });
    }
    if (context.postText) out.push({ label: 'Post', value: context.postText });
    if (context.beforeText) out.push({ label: 'Text before', value: context.beforeText });
    if (context.afterText) out.push({ label: 'Text after', value: context.afterText });
    return out;
  });
  const pageSent = $derived(pageFields.length > 0);

  const answeredBy = $derived.by(() => {
    if (!meta) return '';
    if (meta.cacheHit) return 'Saved answer (cache)';
    if (meta.backendId === 'unknown') return '';
    return meta.modelId
      ? `${backendLabel(meta.backendId)} · ${meta.modelId}`
      : backendLabel(meta.backendId);
  });
  const timeLine = $derived.by(() => {
    if (!meta) return '';
    const total = formatTime(meta.latencyMs);
    return meta.firstTokenMs !== undefined && !meta.cacheHit
      ? `${total} (first words after ${formatTime(meta.firstTokenMs)})`
      : total;
  });
  const tokenLine = $derived.by(() => {
    if (!meta || meta.inputTokens === undefined || meta.outputTokens === undefined) return '';
    const parts = [`${meta.inputTokens} in`, `${meta.outputTokens} out`];
    if (meta.reasoningTokens !== undefined) parts.push(`${meta.reasoningTokens} of them thinking`);
    if (meta.cacheReadTokens !== undefined) parts.push(`${meta.cacheReadTokens} read from cache`);
    if (meta.cacheWriteTokens !== undefined)
      parts.push(`${meta.cacheWriteTokens} written to cache`);
    return parts.join(' · ');
  });
  // 'auto' and variety ids are not ISO, so this goes through the resolver the detected-language pill uses.
  function langName(v: string | undefined, fallback: string): string {
    if (v === undefined || v === '') return fallback;
    if (v === 'auto') return 'Auto-detect';
    return formatDetectedLabel(v, undefined) || v;
  }
  const directionLine = $derived(
    meta && (meta.sourceLang || meta.targetLang)
      ? `${langName(meta.sourceLang, 'Auto-detect')} → ${langName(meta.targetLang, 'unknown')}`
      : '',
  );
  const attempts = $derived(meta?.attempts ?? []);
  const historyLine = $derived.by(() => {
    if (surface === 'tooltip') return 'None. The tooltip sends only your text.';
    const n = meta?.historyTurns ?? 0;
    if (!meta) return '';
    return n === 0 ? 'None' : `${n} from this conversation`;
  });

  function attemptStatus(a: { status: string; code?: string }): string {
    if (a.status === 'ok') return 'answered';
    return a.code ? errCodeLabel(a.code as ErrCode) : 'failed';
  }

  async function copyJson(): Promise<void> {
    const payload = { sentText, task: taskLabel, page: context ?? null, result: meta ?? null };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<section class="reply-details" aria-label="About this reply" data-ega-inspector>
  <header class="rd-head">
    <h3 class="rd-title">About this reply</h3>
    <IconButton icon={X} ariaLabel="Close details" size="sm" onclick={onClose} />
  </header>

  {#if meta}
    <dl class="rd-rows">
      {#if answeredBy}
        <div class="rd-row">
          <dt>Answered by</dt>
          <dd>{answeredBy}</dd>
        </div>
      {/if}
      {#if directionLine}
        <div class="rd-row">
          <dt>Direction</dt>
          <dd>{directionLine}</dd>
        </div>
      {/if}
      <div class="rd-row">
        <dt>Time</dt>
        <dd>{timeLine}</dd>
      </div>
      {#if tokenLine}
        <div class="rd-row">
          <dt>Tokens</dt>
          <dd>{tokenLine}</dd>
        </div>
      {/if}
    </dl>
    {#if attempts.length > 1}
      <div class="rd-tried">
        <p class="rd-sub">Backends tried, in order</p>
        <ol class="rd-attempts">
          {#each attempts as a, i (i)}
            <li class:is-error={a.status !== 'ok'}>
              <span class="rd-attempt-name">{backendLabel(a.backendId)}</span>
              <span class="rd-attempt-status">{attemptStatus(a)}</span>
              <span class="rd-attempt-time">{formatTime(a.latencyMs)}</span>
              {#if a.message}<span class="rd-attempt-msg">{a.message}</span>{/if}
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  {/if}

  <div class="rd-sent">
    <h4 class="rd-sub">What Ega sent</h4>
    <dl class="rd-rows">
      <div class="rd-row rd-row-block">
        <dt>Your text</dt>
        <dd class="rd-quote" dir="auto" lang={valueLang}>{sentText}</dd>
      </div>
      <div class="rd-row">
        <dt>Instructions</dt>
        <dd>
          {taskLabel} prompt{#if onViewPrompt}
            ·
            <button type="button" class="rd-link" onclick={onViewPrompt}>View in Settings</button>
          {/if}
        </dd>
      </div>
      {#if historyLine}
        <div class="rd-row" data-ega-details-history>
          <dt>Earlier messages</dt>
          <dd>{historyLine}</dd>
        </div>
      {/if}
      <div class="rd-row rd-row-block" data-ega-context-preview>
        <dt>Page info</dt>
        {#if !pageSent}
          <dd class="rd-muted" data-ega-context-empty>
            {context === undefined ? 'Not recorded for this reply.' : 'None. Page info was off.'}
          </dd>
        {:else}
          <dd>
            {#if context?.pageTitle || context?.pageUrl}
              <p class="rd-page">
                {#if context?.pageTitle}<span lang={valueLang}>{context.pageTitle}</span>{/if}
                {#if context?.pageUrl}<span class="rd-url">{shortUrl(context.pageUrl)}</span>{/if}
              </p>
            {/if}
            {#if around}
              <p class="rd-around" dir="auto" lang={valueLang} data-ega-context-list>
                {around.before}
                <mark>{around.sent}</mark>
                {around.after}
              </p>
            {/if}
            {#if showAllPage}
              <dl class="rd-all" data-ega-context-all>
                {#each pageFields as f (f.label)}
                  <dt>{f.label}</dt>
                  <dd class:rd-mono={f.mono} lang={f.mono ? 'en' : valueLang}>{f.value}</dd>
                {/each}
              </dl>
            {/if}
            <button
              type="button"
              class="rd-link"
              aria-expanded={showAllPage}
              onclick={() => (showAllPage = !showAllPage)}
            >
              {showAllPage ? 'Show less' : 'Show all page info'}
            </button>
          </dd>
        {/if}
      </div>
    </dl>
  </div>

  <footer class="rd-foot">
    <button type="button" class="rd-copy" onclick={() => void copyJson()} data-ega-details-copy>
      {copied ? 'Copied' : 'Copy as JSON'}
    </button>
    <span class="ega-sr-only" role="status" aria-live="polite">{copied ? 'Copied' : ''}</span>
  </footer>
</section>

<style>
  .reply-details {
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-3);
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    color: var(--color-fg);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .rd-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .rd-title {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  .rd-sub {
    margin: 0 0 var(--space-1);
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--color-fg-subtle);
  }
  .rd-rows {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .rd-row {
    display: grid;
    grid-template-columns: 8.5em 1fr;
    gap: var(--space-2);
    align-items: baseline;
  }
  .rd-row dt {
    color: var(--color-muted);
  }
  .rd-row dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .rd-quote {
    padding-left: var(--space-2);
    border-left: 2px solid var(--color-border);
    white-space: pre-wrap;
    max-height: 6em;
    overflow: auto;
  }
  .rd-muted {
    color: var(--color-muted);
  }
  .rd-page {
    margin: 0 0 var(--space-1);
    display: flex;
    flex-direction: column;
  }
  .rd-url {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }
  .rd-around {
    margin: 0 0 var(--space-1);
    font-size: var(--fs-xs);
    line-height: 1.5;
    color: var(--color-fg-subtle);
  }
  .rd-around mark {
    background: var(--color-accent-bg-soft);
    color: var(--color-fg);
    border-radius: 2px;
    padding: 0 2px;
  }
  .rd-all {
    margin: 0 0 var(--space-1);
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 2px var(--space-2);
    font-size: var(--fs-xs);
  }
  .rd-all dt {
    color: var(--color-muted);
  }
  .rd-all dd {
    margin: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .rd-mono {
    font-family: var(--font-mono);
  }
  .rd-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    font-size: var(--fs-xs);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    min-height: 24px;
  }
  .rd-tried {
    display: flex;
    flex-direction: column;
  }
  .rd-attempts {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--fs-xs);
  }
  .rd-attempts li {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
  }
  .rd-attempt-name {
    font-weight: 500;
  }
  .rd-attempts li.is-error .rd-attempt-status {
    color: var(--color-danger-fg);
  }
  .rd-attempt-time {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .rd-attempt-msg {
    flex-basis: 100%;
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }
  .rd-foot {
    display: flex;
    justify-content: flex-end;
  }
  .rd-copy {
    min-height: 24px;
    font-size: var(--fs-xs);
    padding: 2px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-fg);
    cursor: pointer;
  }
</style>
