<script lang="ts">
  import type { PageContext, ResultMeta } from '@/shared/types';
  import { aroundText, shortUrl } from './reply-details';
  import X from '@lucide/svelte/icons/x';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { errCodeLabel } from '@/shared/err-labels';
  import { formatDetectedLabel } from '@/shared/detected-label';
  import { modelDisplayName } from '@/shared/model-names';
  import type { ErrCode } from '@/shared/types';
  import { redactContext } from '@/shared/redact';
  import { MAX_INSTRUCTIONS_CHARS } from '@/shared/reply-instructions';

  interface Props {
    /** Absent when result details are off in Settings, or the reply carried none. */
    meta?: ResultMeta | undefined;
    /** undefined: the request recorded no page info; null: none was sent (off, or not readable on this tab). */
    context?: PageContext | null | undefined;
    /** The text the request carried: the selection, or what the user typed. With an image, the caption or ''. */
    sentText: string;
    /** The request carried an image. 'ocr': the built-in image prompt ran and took no page info; 'task': the task's own prompt ran with the image. */
    image?: 'ocr' | 'task' | undefined;
    /** Name of the task whose prompt wrapped the text, e.g. "Translate"; goes into Copy as JSON. */
    taskLabel: string;
    /** Kept for callers that still pass it; the sent instructions replace the link to Settings. */
    onViewPrompt?: (() => void) | undefined;
    /** The tooltip sends no earlier messages; the side panel says how many each reply carried. */
    surface: 'tooltip' | 'panel';
    /** Language of the page text shown; '' is unknown. Our UI around it is English. */
    valueLang?: string;
    /** The same direction text the meta line shows; falls back to the recorded pair. */
    direction?: string;
    /** 0..1 as the model sent it. */
    confidence?: number | undefined;
    /** The change the user typed for this version ("Describe a change…"). */
    change?: string | undefined;
    /** Opens Settings, for "Turn on Record request details". */
    onOpenSettings?: (() => void) | undefined;
    onClose: () => void;
  }

  let {
    meta,
    context,
    sentText,
    image,
    taskLabel,
    surface,
    valueLang = '',
    direction,
    confidence,
    change,
    onOpenSettings,
    onClose,
  }: Props = $props();

  const uid = $props.id();
  let showAllPage = $state(false);
  let showTried = $state(false);
  let showInstructions = $state(false);
  let copied = $state(false);

  function formatTime(ms: number): string {
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
  }
  const count = (n: number): string => n.toLocaleString('en-US');

  // The router scrubs secrets out of page info before it builds the prompt, so this shows and copies that version.
  const page = $derived(context ? redactContext(context) : context);
  const around = $derived(aroundText(page, sentText));
  const pageFields = $derived.by(() => {
    if (!page) return [];
    const out: Array<{ label: string; value: string; mono?: boolean }> = [];
    if (page.pageTitle) out.push({ label: 'Title', value: page.pageTitle });
    if (page.pageUrl) out.push({ label: 'Address', value: page.pageUrl, mono: true });
    if (page.siteName) out.push({ label: 'Site', value: page.siteName });
    if (page.pageLang) out.push({ label: 'Language', value: page.pageLang });
    if (page.pageDescription) out.push({ label: 'Description', value: page.pageDescription });
    if (page.headingTrail?.length) {
      out.push({ label: 'Headings', value: page.headingTrail.join(' › ') });
    }
    if (page.postText) out.push({ label: 'Post', value: page.postText });
    if (page.beforeText) out.push({ label: 'Text before', value: page.beforeText });
    if (page.afterText) out.push({ label: 'Text after', value: page.afterText });
    return out;
  });
  const pageSent = $derived(image !== 'ocr' && pageFields.length > 0);

  const answeredBy = $derived.by(() => {
    if (!meta) return '';
    if (meta.cacheHit) return 'Saved answer (from cache)';
    if (meta.backendId === 'unknown') return '';
    const backend = backendLabel(meta.backendId);
    return meta.modelId ? `${modelDisplayName(meta.modelId)} via ${backend}` : backend;
  });
  const timeLine = $derived.by(() => {
    if (!meta) return '';
    const total = formatTime(meta.latencyMs);
    return meta.firstTokenMs !== undefined && !meta.cacheHit
      ? `${total} (first words after ${formatTime(meta.firstTokenMs)})`
      : total;
  });
  // "42 tokens read · 9 written (5 thinking) · 30 from cache"; some providers report only one side.
  const usageLine = $derived.by(() => {
    if (!meta) return '';
    const parts: string[] = [];
    if (meta.inputTokens !== undefined) parts.push(`${count(meta.inputTokens)} tokens read`);
    if (meta.outputTokens !== undefined) {
      const thinking =
        meta.reasoningTokens !== undefined ? ` (${count(meta.reasoningTokens)} thinking)` : '';
      parts.push(`${count(meta.outputTokens)} written${thinking}`);
    }
    if (meta.cacheReadTokens !== undefined) parts.push(`${count(meta.cacheReadTokens)} from cache`);
    return parts.join(' · ');
  });
  // 'auto' and variety ids are not ISO, so this goes through the resolver the meta line uses.
  function langName(v: string | undefined, fallback: string): string {
    if (v === undefined || v === '') return fallback;
    if (v === 'auto') return 'Auto-detect';
    return formatDetectedLabel(v, undefined) || v;
  }
  const languagesLine = $derived(
    direction !== undefined && direction !== ''
      ? direction
      : meta && (meta.sourceLang || meta.targetLang)
        ? `${langName(meta.sourceLang, 'Auto-detect')} → ${langName(meta.targetLang, 'unknown')}`
        : '',
  );
  const confidenceLine = $derived(
    confidence !== undefined && confidence > 0 ? `${Math.round(confidence * 100)}%` : '',
  );
  const attempts = $derived(meta?.attempts ?? []);
  // A cache hit and a reply saved before the count existed carry no count, so they say so.
  const historyLine = $derived.by(() => {
    if (image) return 'None';
    if (surface === 'tooltip') return 'None. The tooltip does not send earlier messages.';
    const n = meta?.historyTurns;
    if (n === undefined) return 'Not recorded';
    return n === 0 ? 'None' : `${n} from this conversation`;
  });
  const emptyPage = $derived.by(() => {
    if (image === 'ocr') return 'Not sent with images';
    return context === undefined ? 'Not recorded' : 'None sent';
  });
  const instructions = $derived(meta?.instructions);
  const instructionsTotal = $derived(meta?.instructionsLength ?? instructions?.length ?? 0);

  function attemptStatus(a: { status: string; code?: string }): string {
    if (a.status === 'ok') return 'answered';
    return a.code ? errCodeLabel(a.code as ErrCode) : 'failed';
  }

  async function copyJson(): Promise<void> {
    const payload = {
      ...(image ? { image: true } : {}),
      sentText,
      task: image === 'ocr' ? 'Image prompt (built in)' : taskLabel,
      page: image === 'ocr' ? null : (page ?? null),
      ...(change !== undefined && change !== '' ? { change } : {}),
      result: meta ?? null,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<!-- shadow-css-lint-allow: rd-instr, rd-instr-head, rd-instr-note, rd-disclosure, rd-tried-list — the tooltip mirror lands with its reply layout -->
<section class="reply-details" aria-labelledby="{uid}-title" data-ega-inspector>
  <header class="rd-head">
    <h3 class="rd-title" id="{uid}-title" tabindex="-1" data-ega-inspector-title>
      About this reply
    </h3>
    <IconButton icon={X} ariaLabel="Close" size="sm" onclick={onClose} />
  </header>

  {#if meta}
    <dl class="rd-rows">
      {#if answeredBy}
        <div class="rd-row">
          <dt>Answered by</dt>
          <dd>{answeredBy}</dd>
        </div>
      {/if}
      {#if languagesLine}
        <div class="rd-row">
          <dt>Languages</dt>
          <dd>{languagesLine}</dd>
        </div>
      {/if}
      <div class="rd-row">
        <dt>Time</dt>
        <dd>{timeLine}</dd>
      </div>
      {#if confidenceLine}
        <div class="rd-row">
          <dt>Confidence</dt>
          <dd>{confidenceLine}</dd>
        </div>
      {/if}
      {#if usageLine}
        <div class="rd-row">
          <dt>Usage</dt>
          <dd>{usageLine}</dd>
        </div>
      {/if}
    </dl>
    {#if attempts.length > 1}
      <div class="rd-tried">
        <button
          type="button"
          class="rd-link rd-disclosure"
          aria-expanded={showTried}
          aria-controls="{uid}-tried"
          onclick={() => (showTried = !showTried)}
        >
          Backends tried ({attempts.length}) {showTried ? '▾' : '▸'}
        </button>
        {#if showTried}
          <ol class="rd-attempts" id="{uid}-tried">
            {#each attempts as a, i (i)}
              <li class:is-error={a.status !== 'ok'}>
                <span class="rd-attempt-name">{backendLabel(a.backendId)}</span>
                <span class="rd-attempt-status">{attemptStatus(a)}</span>
                <span class="rd-attempt-time">{formatTime(a.latencyMs)}</span>
                {#if a.message}<span class="rd-attempt-msg">{a.message}</span>{/if}
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    {/if}
  {/if}

  <div class="rd-sent">
    <h4 class="rd-sub">What was sent</h4>
    <dl class="rd-rows">
      <div class="rd-row rd-row-block">
        <dt>Your text</dt>
        {#if image}
          <dd>
            An image{#if sentText}, with the note:
              <span class="rd-quote rd-caption" dir="auto" lang={valueLang}>{sentText}</span>
            {/if}
          </dd>
        {:else}
          <dd class="rd-quote" dir="auto" lang={valueLang}>{sentText}</dd>
        {/if}
      </div>
      {#if historyLine}
        <div class="rd-row">
          <dt>Earlier messages</dt>
          <dd>{historyLine}</dd>
        </div>
      {/if}
      <div class="rd-row rd-row-block" data-ega-context-preview>
        <dt>Page info</dt>
        {#if !pageSent}
          <dd class="rd-muted" data-ega-context-empty>
            {emptyPage}
          </dd>
        {:else}
          <dd>
            {#if page?.pageTitle || page?.pageUrl}
              <p class="rd-page">
                {#if page?.pageTitle}<span lang={valueLang}>{page.pageTitle}</span>{/if}
                {#if page?.pageUrl}<span class="rd-url">{shortUrl(page.pageUrl)}</span>{/if}
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
      {#if change !== undefined && change !== ''}
        <div class="rd-row rd-row-block">
          <dt>Your change</dt>
          <dd class="rd-quote" dir="auto">{change}</dd>
        </div>
      {/if}
    </dl>

    <div class="rd-instr-head" data-ega-instructions>
      {#if instructions !== undefined}
        <button
          type="button"
          class="rd-link rd-disclosure"
          aria-expanded={showInstructions}
          aria-controls="{uid}-instr"
          onclick={() => (showInstructions = !showInstructions)}
        >
          Instructions sent {showInstructions ? '▾' : '▸'}
        </button>
        <span class="rd-muted">{count(instructionsTotal)} characters</span>
      {:else}
        <span>Instructions sent</span>
        {#if !meta}
          <span class="rd-muted"
            >Not recorded. Turn on Record request details in {#if onOpenSettings}<button
                type="button"
                class="rd-link"
                onclick={onOpenSettings}>Settings</button
              >{:else}Settings{/if}.</span
          >
        {:else}
          <span class="rd-muted">Not kept for this reply.</span>
        {/if}
      {/if}
    </div>
    {#if instructions !== undefined && showInstructions}
      <!-- Plain text only: the prompt can hold page-derived words, so it is never parsed as markup. -->
      <!-- A scroll box takes keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1). -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre
        class="rd-instr"
        id="{uid}-instr"
        tabindex="0"
        aria-label="Instructions sent"
        dir="auto">{instructions}</pre>
      {#if meta?.instructionsLength !== undefined}
        <p class="rd-instr-note">
          Cut at {count(MAX_INSTRUCTIONS_CHARS)} of {count(meta.instructionsLength)} characters.
        </p>
      {/if}
    {/if}
  </div>

  <footer class="rd-foot">
    <button type="button" class="rd-copy" onclick={() => void copyJson()}>
      {copied ? 'Copied' : 'Copy as JSON'}
    </button>
    <span class="ega-sr-only" role="status" aria-live="polite">{copied ? 'Copied' : ''}</span>
  </footer>
</section>

<style>
  /* No box: the details read as part of the reply, inside at most two rules. */
  .reply-details {
    margin-top: var(--space-2);
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
  .rd-caption {
    display: block;
    margin-top: var(--space-1);
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
  .rd-disclosure {
    align-self: flex-start;
    color: var(--color-fg);
    text-decoration: none;
  }
  .rd-instr-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }
  /* The prompt reads as a quote: one rule, no box, fifteen lines before it scrolls. */
  .rd-instr {
    margin: var(--space-1) 0 0;
    padding-inline-start: var(--space-2);
    border-inline-start: 2px solid var(--color-border);
    max-block-size: calc(15 * var(--lh-body) * var(--fs-sm));
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: inherit;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-fg);
  }
  .rd-instr:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .rd-instr-note {
    margin: var(--space-1) 0 0;
    color: var(--color-muted);
  }
</style>
