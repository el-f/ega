<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import CircleHelp from '@lucide/svelte/icons/help-circle';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import Info from '@lucide/svelte/icons/info';
  import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
  import Icon from '@/shared/ui/Icon.svelte';
  import type { TipState } from '../tipState.svelte';
  import { formatDetectedLabel } from '@/shared/detected-label';
  import { isRetryable, optionsTabForMessage } from '@/shared/error-policy';
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
    /** When true, the swap button is blocked (source === 'auto'); it stays focusable and says why. */
    swapDisabled: boolean;
    /** Something to show in the details panel (what was sent, or result data); parent owns the open state. */
    hasDetails: boolean;
    detailsOpen: boolean;
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
    onToggleDetails: () => void;
    onEscalate?: (kind: 'continue' | 'pin' | 'open-image') => void;
  }

  let {
    tip,
    mode,
    direction,
    hasSwap,
    swapDisabled,
    hasDetails,
    detailsOpen,
    canEscalateContinue = false,
    canEscalatePin = false,
    canEscalateOpenImage = false,
    explainOn = true,
    onCancel,
    onCopy,
    onExplain,
    onRetry,
    onSwap,
    onToggleDetails,
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

  // A language name, never a raw ISO code or a custom variety's uuid.
  const langName = (id: string): string =>
    formatDetectedLabel(id, undefined, cachedCustomLanguages());

  // Hidden while the source is 'auto' — the detected pill already names the language.
  const directionLabel = $derived(
    !direction || direction.source === 'auto'
      ? ''
      : `${langName(direction.source)} → ${langName(direction.target)}`,
  );

  const hasMetaChip = $derived(
    pillVisible ||
      !!detectedLabel ||
      (multiVarietyPills !== null && multiVarietyPills.length > 0) ||
      directionLabel !== '',
  );

  // Swap re-sends the original selection with the pair flipped; it does not translate the reply back.
  // The visible label starts with the accessible name, so a voice user can say what they see (WCAG 2.5.3).
  const swapName = $derived(
    swapDisabled ? 'Swap direction — pick a source language first' : 'Swap direction',
  );
  const swapTip = $derived.by(() => {
    if (swapDisabled) return swapName;
    if (!direction) return 'Swap direction and translate again';
    return `Swap direction and translate again (${langName(direction.target)} → ${langName(direction.source)})`;
  });

  // Same gate as the side panel: a terminal code re-fails identically, unless the error names a Settings
  // tab that fixes it (the body links there), so fix, then retry. ABORTED keeps Retry: a cancel is neutral.
  const settingsTab = $derived(
    tip.error ? optionsTabForMessage(tip.error.message, tip.error.code) : undefined,
  );
  const showRetry = $derived(
    !!onRetry &&
      (errorCode === undefined ||
        errorCode === 'ABORTED' ||
        isRetryable(errorCode) ||
        settingsTab !== undefined),
  );

  // Each of these starts a request, so a click the page dispatches into the open shadow root is ignored.
  const retry = (e: Event): void => {
    if (isUserGesture(e)) onRetry?.();
  };
  const swap = (e: Event): void => {
    if (!swapDisabled && isUserGesture(e)) onSwap?.();
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
          role="img"
          aria-label={`${(confidence * 100).toFixed(0)}% confident in this translation`}
          >{(confidence * 100).toFixed(0)}% confident</span
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
    {@render metaChip()}
  </div>
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
        class="icon-btn icon-btn-labeled"
        data-tooltip={retryBlocked
          ? retryRemainingSec > 0
            ? `Retry in ${retryRemainingSec}s`
            : 'Wait a moment'
          : 'Send it again'}
        disabled={retryBlocked}
        onclick={retry}
      >
        {@render iconRetry()}
        <span>Try again</span>
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
    {@render metaChip()}
  </div>
{:else}
  <!-- Grouped by intent: primary, then secondary, then the meta pills at the row's end. Close lives in the parent header. -->
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
        <!-- A visible word: the "?" glyph alone reads as Help. -->
        <button
          class="icon-btn icon-btn-labeled"
          aria-label="Explain this translation"
          disabled={loading || !hasBody}
          onclick={explain}
        >
          {@render iconExplain()}
          <span>Explain</span>
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
          <!-- aria-disabled, not disabled: a disabled button cannot take focus, so its reason would be hover-only. -->
          <button
            class="icon-btn"
            aria-label={swapName}
            aria-disabled={swapDisabled}
            data-tooltip={swapTip}
            onclick={swap}
          >
            {@render iconSwap()}
          </button>
        {/if}
      </div>
    {/if}

    {#if hasDetails}
      <span class="action-divider" aria-hidden="true"></span>
      <div class="action-group">
        <button
          class="icon-btn"
          aria-label={detailsOpen
            ? 'Hide details about this reply'
            : 'Show details about this reply'}
          data-tooltip={detailsOpen ? 'Hide details' : 'Details: what was sent'}
          aria-expanded={detailsOpen}
          onclick={onToggleDetails}
        >
          {@render iconInspector()}
        </button>
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
    {@render metaChip()}
  </div>
{/if}
