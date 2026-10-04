<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import CircleHelp from '@lucide/svelte/icons/help-circle';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import FileText from '@lucide/svelte/icons/file-text';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import Info from '@lucide/svelte/icons/info';
  import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
  import Icon from '@/shared/ui/Icon.svelte';
  import type { TipState } from '../tipState.svelte';
  import { formatDetectedLabel } from '@/shared/detected-label';
  import { isRetryable } from '@/shared/error-policy';
  import { varietyLabel } from './variety-label';
  import { cachedCustomLanguages } from '../customs-cache';
  import { isUserGesture } from '../user-gesture';

  interface Props {
    /** The tooltip's reactive state; the action rows read what they need off it. */
    tip: TipState;
    /** Current request phase. Drives which action row renders. */
    mode: 'loading' | 'error' | 'success';
    /** Active translation direction; shown as a meta pill when the source is concrete. */
    direction?: { source: string; target: string };
    /** True when an onswap handler is wired; drives visibility of the swap button. */
    hasSwap: boolean;
    /** When true, the swap button is disabled (source === 'auto'). */
    swapDisabled: boolean;
    /** Context preview availability + open state (parent owns both). */
    hasContext: boolean;
    contextOpen: boolean;
    inspectorOpen?: boolean;
    /** Escalation affordances; parent owns the kind→payload mapping. */
    canEscalateContinue?: boolean;
    canEscalatePin?: boolean;
    canEscalateOpenImage?: boolean;
    /** False when the user turned the Explain task off. */
    explainOn?: boolean;

    onCancel: () => void;
    onCopy: () => void;
    onExplain: () => void;
    /** Absent means this surface cannot re-dispatch, so no Retry is offered. */
    onRetry?: () => void;
    onSwap?: () => void;
    onToggleContext: () => void;
    onToggleInspector?: () => void;
    onEscalate?: (kind: 'continue' | 'pin' | 'open-image') => void;
  }

  let {
    tip,
    mode,
    direction,
    hasSwap,
    swapDisabled,
    hasContext,
    contextOpen,
    inspectorOpen = false,
    canEscalateContinue = false,
    canEscalatePin = false,
    canEscalateOpenImage = false,
    explainOn = true,
    onCancel,
    onCopy,
    onExplain,
    onRetry,
    onSwap,
    onToggleContext,
    onToggleInspector,
    onEscalate,
  }: Props = $props();

  const hasBody = $derived(!!tip.body);
  const loading = $derived(tip.loading);
  const copied = $derived(tip.copied === true);
  const errorCode = $derived(tip.error?.code);
  const retryBlocked = $derived(tip.retryBlocked === true);
  const retryRemainingSec = $derived(tip.retryRemainingSec ?? 0);
  const confidence = $derived(tip.confidence);
  const confidencePill = $derived(tip.confidencePill);
  const confidencePillThreshold = $derived(tip.confidencePillThreshold ?? 0);
  const detectedLang = $derived(tip.detectedLang);
  const detectedDetail = $derived(tip.detectedDetail);
  const detectedLangs = $derived(tip.detectedLangs);
  const hasMeta = $derived(tip.meta !== undefined);
  // An image result has no source text to explain.
  const canExplain = $derived(explainOn && tip.imageUrl === undefined);
  // The body renders from the first token, but the request runs until the done frame — Cancel has to outlive `loading`.
  const unsettled = $derived(mode === 'success' && tip.settled !== true);

  // Shared lucide defaults, so `.icon` class styling and currentColor inheritance apply.
  const ICON_SIZE = 16;
  const ICON_STROKE = 1.6;

  // The threshold hides the pill below its value; `confidencePill=false` hides it whatever the threshold is.
  const pillVisible = $derived(
    typeof confidence === 'number' &&
      confidence > 0 &&
      confidencePill &&
      confidence >= confidencePillThreshold,
  );
  const pillClass = $derived.by(() => {
    if (!pillVisible) return '';
    const c = confidence as number;
    if (c >= 0.8) return 'pill hi';
    if (c >= 0.6) return 'pill mid';
    return 'pill lo';
  });

  // A detail that already has parentheses joins with a dash, so the label never nests them twice.
  const detectedLabel = $derived(
    formatDetectedLabel(detectedLang, detectedDetail, cachedCustomLanguages()),
  );

  // A single-item array is left to the detectedLang pill, which already covers that case.
  const multiVarietyPills = $derived.by(() => {
    const list = detectedLangs;
    if (!list || list.length < 2) return null;
    return list.map((v) => formatDetectedLabel(v.id, v.detail, cachedCustomLanguages()));
  });

  // Hidden while the source is 'auto' — the detected pill already names the language.
  const directionLabel = $derived.by(() => {
    if (!direction || direction.source === 'auto') return '';
    const customs = cachedCustomLanguages();
    return `${varietyLabel(direction.source, customs)}→${varietyLabel(direction.target, customs)}`;
  });

  const hasMetaChip = $derived(
    pillVisible ||
      !!detectedLabel ||
      (multiVarietyPills !== null && multiVarietyPills.length > 0) ||
      directionLabel !== '',
  );

  // Terminal codes (bad key, out of credit, …) re-fail identically — mirror the sidepanel's gate.
  // ABORTED keeps Retry: a user cancel is neutral, and re-running is its natural recovery.
  const showRetry = $derived(
    !!onRetry && (errorCode === undefined || errorCode === 'ABORTED' || isRetryable(errorCode)),
  );

  // Each of these starts a request, so a click the page dispatches into the open shadow root is ignored.
  const retry = (e: Event): void => {
    if (isUserGesture(e)) onRetry?.();
  };
  const swap = (e: Event): void => {
    if (isUserGesture(e)) onSwap?.();
  };
  const explain = (e: Event): void => {
    if (isUserGesture(e)) onExplain();
  };
</script>

<!-- Each icon is a snippet so `.icon` styling and currentColor inheritance still reach it. -->
{#snippet iconCopy()}
  <Icon icon={Copy} size={ICON_SIZE} strokeWidth={ICON_STROKE} class="icon" />
{/snippet}
{#snippet iconCheck()}
  <Icon icon={Check} size={ICON_SIZE} strokeWidth={ICON_STROKE} class="icon" />
{/snippet}
{#snippet iconExplain()}
  <Icon icon={CircleHelp} size={ICON_SIZE} strokeWidth={ICON_STROKE} class="icon" />
{/snippet}
{#snippet iconRetry()}
  <Icon icon={RotateCcw} size={ICON_SIZE} strokeWidth={ICON_STROKE} class="icon" />
{/snippet}
{#snippet iconContext()}
  <Icon icon={FileText} size={ICON_SIZE} strokeWidth={ICON_STROKE} class="icon" />
{/snippet}
{#snippet iconSwap()}
  <Icon icon={ArrowLeftRight} size={ICON_SIZE} strokeWidth={ICON_STROKE} class="icon" />
{/snippet}
{#snippet iconInspector()}
  <Icon icon={Info} size={ICON_SIZE} strokeWidth={ICON_STROKE} class="icon" />
{/snippet}
{#snippet iconEscalate()}
  <Icon icon={PanelRightOpen} size={ICON_SIZE} strokeWidth={ICON_STROKE} class="icon" />
{/snippet}

{#snippet metaChip()}
  {#if hasMetaChip}
    <span class="meta">
      {#if pillVisible && typeof confidence === 'number'}
        <span
          class={pillClass}
          title="Confidence"
          role="img"
          aria-label={`Translation confidence ${(confidence * 100).toFixed(0)}%`}
          >{(confidence * 100).toFixed(0)}%</span
        >
      {/if}
      {#if multiVarietyPills !== null}
        {#if pillVisible}
          <span class="dot">·</span>
        {/if}
        <span class="lang-cluster" data-ega-multi-variety>
          {#each multiVarietyPills as label, i (i)}
            <span class="lang-pill" title={label}>{label}</span>
          {/each}
        </span>
      {:else}
        {#if detectedLabel && pillVisible}
          <span class="dot">·</span>
        {/if}
        {#if detectedLabel}<span class="lang" title={detectedLabel}>{detectedLabel}</span>{/if}
      {/if}
      {#if directionLabel}
        {#if pillVisible || detectedLabel || multiVarietyPills !== null}
          <span class="dot">·</span>
        {/if}
        <span class="lang" data-ega-direction title="Translation direction">{directionLabel}</span>
      {/if}
    </span>
  {/if}
{/snippet}

<!-- Always rendered: a live region added at the same moment as its text is not announced. -->
<span class="ega-sr-only" role="status" aria-live="polite" aria-atomic="true" data-ega-copy-live
  >{copied ? 'Copied' : ''}</span
>

{#if mode === 'loading'}
  <div class="actions">
    <button onclick={onCancel}>Cancel</button>
  </div>
  {@render metaChip()}
{:else if mode === 'error'}
  <div class="actions">
    {#if hasBody}
      <button
        class="icon-btn"
        aria-label="Copy partial translation"
        data-tooltip={copied ? 'Copied' : 'Copy'}
        onclick={onCopy}
      >
        {#if copied}
          <span class="icon-swap icon-swap-in">{@render iconCheck()}</span>
        {:else}
          <span class="icon-swap">{@render iconCopy()}</span>
        {/if}
      </button>
    {/if}
    {#if showRetry}
      <button
        data-ega-retry
        class="icon-btn"
        aria-label="Retry"
        data-tooltip={retryBlocked
          ? retryRemainingSec > 0
            ? `Retry in ${retryRemainingSec}s`
            : 'Wait a moment'
          : 'Retry'}
        disabled={retryBlocked}
        onclick={retry}
      >
        {@render iconRetry()}
      </button>
      {#if retryBlocked && retryRemainingSec > 0}
        <span class="retry-wait" data-ega-retry-wait aria-live="polite"
          >Retry in {retryRemainingSec}s</span
        >
      {/if}
    {/if}
    {#if canEscalateContinue && onEscalate}
      <button
        class="tooltip-error-cta"
        data-ega-escalate="continue"
        onclick={() => onEscalate?.('continue')}
      >
        Continue in side panel
      </button>
    {/if}
    {#if hasSwap && onSwap}
      <button
        class="icon-btn"
        aria-label="Swap direction"
        data-tooltip={swapDisabled ? 'Swap (pick a source language first)' : 'Swap'}
        disabled={swapDisabled}
        onclick={swap}
      >
        {@render iconSwap()}
      </button>
    {/if}
  </div>
  {@render metaChip()}
{:else}
  <!-- Grouped by intent: primary, then secondary, then meta. Close lives in the parent header, not in this row. -->
  <div class="actions">
    <div class="action-group">
      {#if unsettled}
        <button onclick={onCancel}>Cancel</button>
      {/if}
      <button
        class="icon-btn icon-btn-primary"
        aria-label="Copy translation"
        data-tooltip={copied ? 'Copied' : 'Copy'}
        onclick={onCopy}
      >
        {#if copied}
          <span class="icon-copied">{@render iconCheck()}</span>
        {:else}
          {@render iconCopy()}
        {/if}
      </button>
      {#if canExplain}
        <button
          class="icon-btn"
          aria-label="Explain this translation"
          data-tooltip="Explain"
          disabled={loading || !hasBody}
          onclick={explain}
        >
          {@render iconExplain()}
        </button>
      {/if}
    </div>

    {#if (!loading && !hasBody && onRetry) || (hasSwap && onSwap)}
      <span class="action-divider" aria-hidden="true"></span>

      <div class="action-group">
        {#if !loading && !hasBody && onRetry}
          <button class="icon-btn" aria-label="Retry" data-tooltip="Retry" onclick={retry}>
            {@render iconRetry()}
          </button>
        {/if}
        {#if hasSwap && onSwap}
          <button
            class="icon-btn"
            aria-label="Swap direction"
            data-tooltip={swapDisabled ? 'Swap (pick a source language first)' : 'Swap'}
            disabled={swapDisabled}
            onclick={swap}
          >
            {@render iconSwap()}
          </button>
        {/if}
      </div>
    {/if}

    {#if hasContext || (hasMeta && onToggleInspector)}
      <span class="action-divider" aria-hidden="true"></span>
      <div class="action-group">
        {#if hasContext}
          <button
            class="icon-btn"
            aria-label={contextOpen ? 'Hide what was sent' : 'Show what was sent'}
            data-tooltip={contextOpen ? 'Hide context' : 'Context'}
            aria-expanded={contextOpen}
            onclick={onToggleContext}
          >
            {@render iconContext()}
          </button>
        {/if}
        {#if hasMeta && onToggleInspector}
          <button
            class="icon-btn"
            aria-label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
            data-tooltip={inspectorOpen ? 'Hide details' : 'Details'}
            aria-expanded={inspectorOpen}
            onclick={onToggleInspector}
          >
            {@render iconInspector()}
          </button>
        {/if}
      </div>
    {/if}

    {#if (canEscalatePin || canEscalateOpenImage) && onEscalate}
      <span class="action-divider" aria-hidden="true"></span>
      <div class="action-group">
        {#if canEscalatePin}
          <button
            class="icon-btn"
            aria-label="Pin to side panel"
            data-tooltip="Pin to side panel"
            data-ega-escalate="pin"
            onclick={() => onEscalate?.('pin')}
          >
            {@render iconEscalate()}
          </button>
        {/if}
        {#if canEscalateOpenImage}
          <button
            class="icon-btn"
            aria-label="Open in side panel"
            data-tooltip="Open in side panel"
            data-ega-escalate="open-image"
            onclick={() => onEscalate?.('open-image')}
          >
            {@render iconEscalate()}
          </button>
        {/if}
      </div>
    {/if}
  </div>
  {@render metaChip()}
{/if}
