<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import { relativeTime } from '@/shared/relative-time';

  import ReplyDetails from '@/shared/components/ReplyDetails.svelte';
  import { imageModeOf } from '@/shared/components/reply-details';
  import DiffFadeText from '@/shared/components/DiffFadeText.svelte';
  import Markdown from '@/shared/components/Markdown.svelte';
  import { formatDetectedLabel } from '@/shared/detected-label';
  import { langTag, replyLang } from '@/shared/lang-tag';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
  import { DropdownMenu, Tooltip } from 'bits-ui';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import Info from '@lucide/svelte/icons/info';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Star from '@lucide/svelte/icons/star';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import ListChecks from '@lucide/svelte/icons/list-checks';
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import Square from '@lucide/svelte/icons/square';
  import { onDestroy, tick, untrack } from 'svelte';
  import { canSpeak, pickLocalVoice, speakWith, stopSpeaking } from '../speech';
  import { toastStore } from '@/shared/components/toastStore';
  import {
    activeVariant as activeVariantOf,
    errorTurnParts,
    isCancelledError,
    turnTaskValue,
    type SwapPair,
    type Turn,
  } from '../state/conversation';
  import { builtInTask, taskGerund, type Task } from '@/shared/task-prompts';
  import {
    SHIPPED_TASK_VIEWS,
    notesLabel,
    taskLabel,
    type TaskId,
    type TaskView,
  } from '@/shared/task-view';
  import { isRetryable, optionsTabForMessage } from '@/shared/error-policy';
  import { ALL_ERR_CODES, type ErrCode, type LangSelection, type Variety } from '@/shared/types';
  import { isIsoCode, labelFor } from '@/shared/languages';
  import { openOptionsTab } from '@/shared/open-options-tab';
  import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
  import QuickRefineChips from './QuickRefineChips.svelte';

  interface Props {
    turn: Turn;
    focused?: boolean;
    onRetry: (turnId: string) => void;
    /** Request-scoped refinement, never persisted. Wired only on the latest turn. */
    onRefine?:
      | ((args: {
          turnId: string;
          refinementBody: string;
          refinementLabel?: string;
        }) => boolean | Promise<boolean>)
      | undefined;
    /** Flip the active variant on this Turn. */
    onSelectVariant?: ((turnId: string, idx: number) => void) | undefined;
    /** Gates the Refine and Re-run as buttons; every reply keeps the same card. */
    isLatest?: boolean;
    /** False when the turn has no dispatch metadata to replay, so Retry stays hidden. */
    canRetry?: boolean;
    /** Swap source/target langs and re-dispatch. Only wired on the latest turn. */
    onSwap?: ((turnId: string) => void) | undefined;
    /** Re-dispatch with a different task. Only wired on the latest turn. */
    onTaskSwitch?: ((turnId: string, task: TaskId) => void) | undefined;
    /** True when this turn has no swap to run: a stream is running, no dispatch to replay, it carries an image, or no source language is known. */
    swapDisabled?: boolean;
    /** The pair the swap would run with; the swap item names it. Null or absent shows the bare label. */
    swapPair?: SwapPair | null;
    /** Regenerate a new variant for this turn. Gated on done + canRetry. */
    onRegenerate?: ((id: string) => void) | undefined;
    /** Bookmark toggle for this turn. */
    onBookmark?: ((id: string) => void) | undefined;
    /** Delete this turn and its paired user/assistant turn. */
    onDelete?: ((id: string) => void) | undefined;
    /** False hides the confidence pill whatever the threshold — same setting the tooltip reads. */
    confidencePill?: boolean;
    /** Hide the confidence pill below this score — same setting the tooltip reads. */
    confidencePillThreshold?: number;
    /** True while another turn is streaming; every re-dispatch bails until it settles. */
    inflight?: boolean;
    /** Enabled varieties — labels the language chip on a language-change variant. */
    varieties?: readonly Variety[];
    /** Every task, on or off. Re-run as offers the ones that are on; the turn's own task, when off or deleted, shows disabled. */
    taskViews?: readonly TaskView[] | undefined;
    /** True when the paired user turn carries an image, whatever kind the send used. */
    hasImage?: boolean;
    /** The language the paired send asked for; Read aloud picks its voice from it. */
    targetLang?: LangSelection | undefined;
    /** Source language the send named; Reword and Grammar read aloud in it when the model named none. */
    sourceLang?: LangSelection | undefined;
    /** Clock the stream ticks, so the relative timestamp does not freeze at "just now". */
    now?: number;
    /** The message this reply answers, as it was sent. */
    sentText?: string;
  }

  const {
    turn,
    focused = false,
    onRetry,
    onRefine,
    onSelectVariant,
    isLatest = false,
    canRetry = true,
    onSwap,
    onTaskSwitch,
    swapDisabled = false,
    swapPair = null,
    onRegenerate,
    onBookmark,
    onDelete,
    confidencePill = true,
    confidencePillThreshold = 0,
    inflight = false,
    varieties = [],
    taskViews = SHIPPED_TASK_VIEWS,
    hasImage = false,
    targetLang,
    sourceLang,
    now = Date.now(),
    sentText = '',
  }: Props = $props();

  // image-translate has no Task mapping, and the vision arm never receives a refinement, so an image turn gets no chips.
  const refineTask = $derived.by<Task | null>(() => {
    if (turn.status !== 'done') return null;
    if (!isLatest) return null;
    if (!onRefine) return null;
    if (hasImage || turn.kind === 'image-translate') return null;
    // A custom task has its own prompt, which the preset chips were not written for.
    return builtInTask(turnTaskValue(turn));
  });

  const variantCount = $derived(turn.variants?.length ?? 0);
  const activeIdx = $derived(turn.activeVariantIdx ?? 0);
  const activeVariant = $derived(activeVariantOf(turn));

  // A variant only mirrors onto the turn while it is active, so a sibling streams invisibly.
  const hiddenBusyIdx = $derived.by(() => {
    const vs = turn.variants ?? [];
    const i = vs.findIndex((v) => v.status === 'pending' || v.status === 'streaming');
    return i >= 0 && i !== activeIdx ? i : -1;
  });
  const refinementBody = $derived(activeVariant?.refinementBody);
  const refinementChipLabel = $derived(activeVariant?.refinementLabel);
  const refinementLabel = $derived.by(() => {
    if (!refinementBody) return '';
    if (refinementChipLabel !== undefined) return `Refined: ${refinementChipLabel}`;
    const trimmed = refinementBody.length > 60 ? `${refinementBody.slice(0, 59)}…` : refinementBody;
    return `Refined: "${trimmed}"`;
  });
  const variantLang = $derived(activeVariant?.targetLang);
  const langName = (lang: LangSelection): string =>
    varieties.find((v) => v.id === lang)?.label ?? labelFor(lang);
  const variantLangLabel = $derived(variantLang === undefined ? '' : langName(variantLang));

  const currentTaskValue = $derived(turnTaskValue(turn));
  // The stored context is the turn's; the router records per reply whether it went. Older replies fall back to the task's switch.
  const contextShown = $derived(
    (turn.meta?.pageContextSent ??
      taskViews.find((v) => v.id === currentTaskValue)?.pageContext ??
      true)
      ? turn.contextSent
      : null,
  );
  // Translate reads an image with the built-in image prompt; any other task sends its own prompt with the image.
  const imageMode = $derived(
    imageModeOf(
      turn.meta,
      hasImage || turn.kind === 'image-translate'
        ? currentTaskValue === 'translate'
          ? 'ocr'
          : 'task'
        : undefined,
    ),
  );
  const detailsText = $derived(sentText === IMAGE_TURN_PLACEHOLDER ? '' : sentText);
  // Only translate and explain reach the vision arm in router.ts; the rest would send the "[image]" marker as text.
  const taskOptions = $derived.by<readonly { id: TaskId; label: string; off: boolean }[]>(() => {
    const imageTurn = hasImage || turn.kind === 'image-translate';
    const out = taskViews
      .filter((v) => (!imageTurn || v.image) && (!v.disabled || v.id === currentTaskValue))
      .map((v) => ({ id: v.id, label: v.label, off: v.disabled }));
    if (!out.some((o) => o.id === currentTaskValue)) {
      out.push({ id: currentTaskValue, label: taskLabel(taskViews, currentTaskValue), off: true });
    }
    return out;
  });

  // With a fallback chain the user cannot tell which key to fix unless the card names the backend.
  const failedBackend = $derived(
    turn.error?.backendId === undefined ? '' : ` (${backendLabel(turn.error.backendId)})`,
  );

  // A deliberate stop is not a failure: no red, no "Error:" prefix, no alert role.
  const isCancelled = $derived(isCancelledError(turn.error?.code));

  // A null swapPair folds a running reply, an image and an unknown source into one value, so the reason reads the props that tell them apart.
  const swapReason = $derived(
    inflight
      ? 'wait for this reply to finish'
      : hasImage
        ? 'images have no source language to swap'
        : swapPair?.blocked === 'same-language'
          ? 'source and target are the same language'
          : swapPair?.blocked === 'answered'
            ? 'already answered this way'
            : swapDisabled
              ? 'no source language to swap from yet'
              : undefined,
  );
  const swapBlocked = $derived(swapReason !== undefined);
  // The reason is visible text in the item, not a tooltip: a menu item has no hover label.
  const swapNote = $derived(
    swapReason === undefined ? '' : swapReason.charAt(0).toUpperCase() + swapReason.slice(1),
  );
  const swapItemLabel = $derived(
    swapPair === null || swapBlocked
      ? 'Swap languages'
      : `Swap languages (${langName(swapPair.sourceLang)} → ${langName(swapPair.targetLang)})`,
  );
  // Swap and the task re-runs replay the send, so they need a finished latest reply that can be retried.
  const showTryAs = $derived(
    isLatest && turn.status === 'done' && onSwap !== undefined && canRetry,
  );
  // A setter keeps a busy reply from opening it (bits writes open first); a pick closes it, as the re-run unmounts it before bits can.
  let taskMenuOpen = $state(false);
  let taskMenuEl: HTMLElement | null = $state(null);

  // bits lands on the first item, Swap, so Enter then Enter would start a paid re-run. The checked task re-runs nothing.
  function onTaskMenuOpenFocus(e: Event): void {
    const checked = taskMenuEl?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!checked) return;
    e.preventDefault();
    checked.focus({ preventScroll: true });
  }

  // The chips stay hidden until asked for, so the newest reply is not followed by a row of buttons.
  let refineOpen = $state(false);
  // Lives here, not in the chips, so closing the row keeps what the user typed until it is sent.
  let refineDraft = $state('');
  const refineRowId = $derived(`ega-refine-${turn.id}`);
  // A refine that dispatched turns the reply pending, and a newer reply takes the chips away: both close the row.
  $effect(() => {
    if (refineTask === null) refineOpen = false;
  });

  async function toggleRefine(): Promise<void> {
    refineOpen = !refineOpen;
    if (!refineOpen) return;
    await tick();
    document
      .getElementById(refineRowId)
      ?.querySelector<HTMLElement>('button:not(:disabled)')
      ?.focus();
  }

  function onRefineRowKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    // The panel's Escape would cancel a running reply.
    e.preventDefault();
    refineOpen = false;
    actionsEl?.querySelector<HTMLElement>("[data-ega-action='refine']")?.focus();
  }

  const knownCode = $derived.by<ErrCode | null>(() => {
    const code = turn.error?.code;
    if (code === undefined) return null;
    return (ALL_ERR_CODES as readonly string[]).includes(code) ? (code as ErrCode) : null;
  });
  const optionsTab = $derived(optionsTabForMessage(turn.error?.message ?? '', knownCode));

  // A second failure on the same slot is not bad luck; offer the backend list even when the code names no tab.
  const fallbackTab = $derived(
    optionsTab === undefined && (turn.retries ?? 0) >= 1 && turn.status === 'error' && !isCancelled
      ? ('backends' as const)
      : undefined,
  );

  // A cancel is neutral, so it keeps Retry like the tooltip does; codes outside the policy
  // table ('unknown') keep it rather than lose it. An error Settings can fix keeps it too: fix, then retry.
  const showRetry = $derived.by(() => {
    if (!canRetry) return false;
    if (turn.error?.code === undefined) return false;
    if (isCancelled) return true;
    return knownCode === null || isRetryable(knownCode) || optionsTab !== undefined;
  });

  // A re-run unmounts the action row with the button or menu item that started it, and focus would drop to <body>.
  // Only on the step into answering, so a card that mounts mid-answer or a pending → streaming tick takes nothing.
  let articleEl: HTMLElement | null = $state(null);
  const answering = $derived(turn.status === 'pending' || turn.status === 'streaming');
  let wasAnswering = untrack(() => answering);
  $effect(() => {
    const now = answering;
    const el = articleEl;
    const started = now && !wasAnswering;
    wasAnswering = now;
    if (!started || el === null) return;
    const active = document.activeElement;
    if (active === null || active === document.body) el.focus({ preventScroll: true });
  });

  // `article` is not name-from-content, so without a label a j/k-focused reply is announced as a bare "article".
  const srLabel = $derived(
    variantCount > 1 ? `Ega reply · ${activeIdx + 1} of ${variantCount} variants` : 'Ega reply',
  );

  const speakable = canSpeak();
  let speaking = $state(false);
  // The input language is the one the model named, else the one the send named; a swap variant keeps it, as these
  // prompts never send a source. A variety id or an unnamed Auto-detect source names no voice, so the default voice reads.
  const answerTarget = $derived(activeVariant?.targetLang ?? targetLang);
  const answerLang = $derived(
    replyLang(currentTaskValue, answerTarget, turn.detectedLang ?? sourceLang),
  );
  const speechLang = $derived(
    answerLang !== undefined && isIsoCode(answerLang) ? answerLang : undefined,
  );
  // The panel is lang=en; a reply with no tag is marked unknown ('') rather than read as English.
  const answerTag = $derived(langTag(answerLang) ?? '');
  // The notes are written in the target, whatever language the answer is in.
  const notesTag = $derived(langTag(answerTarget) ?? '');
  // The end event of a cancelled read can land after the next read started.
  let speechRun = 0;

  async function toggleSpeech(): Promise<void> {
    const run = ++speechRun;
    if (speaking) {
      stopSpeaking();
      speaking = false;
      return;
    }
    speaking = true;
    const voice = await pickLocalVoice(speechLang);
    if (run !== speechRun || !speaking) return;
    if (voice === undefined) {
      speaking = false;
      toastStore.push({
        message: 'This computer has no voice installed to read this aloud.',
        variant: 'warning',
      });
      return;
    }
    speakWith(voice, turn.content, () => {
      if (run === speechRun) speaking = false;
    });
  }

  // A refine or regenerate replaces the text being read and hides the Stop button with it.
  $effect(() => {
    const done = turn.status === 'done';
    const on = speaking;
    if (done || !on) return;
    speechRun++;
    stopSpeaking();
    speaking = false;
  });

  // A voice pick still waiting on the voice list must not start reading for a removed turn.
  onDestroy(() => {
    speechRun++;
    if (speaking) stopSpeaking();
  });

  // Excludes what is disabled, not just what is absent: a tab stop parked on a disabled
  // button takes the whole row out of the tab order, because disabled is unfocusable.
  const actionKeys = $derived<readonly string[]>([
    'copy',
    ...(speakable && turn.content !== '' ? ['speak'] : []),
    ...(canRetry && !inflight ? ['regenerate'] : []),
    ...(turn.meta || turn.contextSent !== undefined ? ['details'] : []),
    ...(refineTask ? ['refine'] : []),
    ...(showTryAs ? ['try-as'] : []),
    'more',
  ]);

  let actionsEl: HTMLElement | null = $state(null);
  let pickedAction = $state('copy');
  // Clamped, not stored: the edit and details buttons come and go with the turn.
  const activeAction = $derived(
    actionKeys.includes(pickedAction) ? pickedAction : (actionKeys[0] ?? 'copy'),
  );

  // A click moves focus without touching pickedAction, so the next arrow would jump from the wrong button.
  function onActionsFocusIn(e: FocusEvent): void {
    const key = (e.target as HTMLElement | null)
      ?.closest('[data-ega-action]')
      ?.getAttribute('data-ega-action');
    if (key !== null && key !== undefined && actionKeys.includes(key)) pickedAction = key;
  }

  // One tab stop per turn instead of one per button; arrows move inside the row.
  function onActionsKeydown(e: KeyboardEvent): void {
    // Escape on the pressed Refine button closes its row; the panel's Escape would cancel a running reply.
    if (
      e.key === 'Escape' &&
      refineOpen &&
      (e.target as HTMLElement | null)?.closest('[data-ega-refine-toggle]')
    ) {
      e.preventDefault();
      refineOpen = false;
      return;
    }
    const idx = actionKeys.indexOf(activeAction);
    let next: number;
    if (e.key === 'ArrowRight') next = (idx + 1) % actionKeys.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + actionKeys.length) % actionKeys.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = actionKeys.length - 1;
    else return;
    e.preventDefault();
    // The window handler would take the same key and move focus to another turn.
    e.stopPropagation();
    const key = actionKeys[next];
    if (key === undefined) return;
    pickedAction = key;
    actionsEl?.querySelector<HTMLElement>(`[data-ega-action='${key}']`)?.focus();
  }

  let copied = $state(false);
  let inspectorOpen = $state(false);
  // The label truncates at 60 chars, and a hover tooltip is not reachable from the keyboard.
  let refinementExpanded = $state(false);

  // Ticks once a second only while a Retry-After window is open, then stops.
  let nowMs = $state(Date.now());
  const retryWaitSec = $derived.by(() => {
    const until = turn.error?.retryUntil;
    if (until === undefined) return 0;
    return Math.max(0, Math.ceil((until - nowMs) / 1000));
  });
  $effect(() => {
    const until = turn.error?.retryUntil;
    // Refresh now: nowMs was seeded at mount, and the error can land many seconds later.
    nowMs = Date.now();
    if (until === undefined || until <= Date.now()) return;
    const t = setInterval(() => {
      const now = Date.now();
      nowMs = now;
      if (now >= until) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  });

  async function copyToClipboard(): Promise<void> {
    if (!turn.content) return;
    try {
      await navigator.clipboard.writeText(turn.content);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (e) {
      debugCatch(e, 'sidepanel.conversation.AssistantTurn.1');
    }
  }

  const detectedLabel = $derived(
    formatDetectedLabel(turn.detectedLang, turn.detectedDetail, varieties),
  );
  const multiVarietyPills = $derived(
    turn.detectedLangs && turn.detectedLangs.length >= 2
      ? turn.detectedLangs.map((v) => formatDetectedLabel(v.id, v.detail, varieties))
      : null,
  );

  const prevVariant = $derived(
    turn.variants && activeIdx > 0 ? turn.variants[activeIdx - 1] : undefined,
  );
  // Diff only refine variants: an edited question's fresh answer vs the old answer is noise, not a revision.
  const diffAgainst = $derived(
    refinementBody !== undefined && prevVariant?.status === 'done'
      ? prevVariant.content
      : undefined,
  );
  const showDiff = $derived(
    turn.status === 'done' && diffAgainst !== undefined && diffAgainst !== turn.content,
  );
</script>

<article
  class="ega-assistant-turn"
  class:focused
  class:is-answering={turn.status === 'pending' || turn.status === 'streaming'}
  tabindex="-1"
  aria-label={srLabel}
  data-turn-id={turn.id}
  bind:this={articleEl}
>
  {#if variantCount > 1 || turn.status === 'done'}
    <header class="ega-assistant-meta">
      {#if turn.status === 'done'}
        <!-- What answered and how sure it was sit with the time, so the action row holds only buttons and fits 400px. -->
        {#if confidencePill && typeof turn.confidence === 'number' && turn.confidence > 0 && turn.confidence >= confidencePillThreshold}
          {@const pct = (turn.confidence * 100).toFixed(0)}
          <span
            class="ega-pill"
            data-ega-confidence
            data-tooltip="How sure the model is about this reply"
            data-tooltip-placement="top">{pct}% confident</span
          >
        {/if}
        {#if multiVarietyPills}
          <span class="ega-lang-cluster" data-ega-multi-variety>
            {#each multiVarietyPills as label, i (i)}
              <span class="ega-pill ega-lang-pill" data-tooltip={label} data-tooltip-placement="top"
                >{label}</span
              >
            {/each}
          </span>
        {:else if detectedLabel}
          <span
            class="ega-pill ega-lang-pill"
            data-tooltip={detectedLabel}
            data-tooltip-placement="top">{detectedLabel}</span
          >
        {/if}
        {#if turn.meta}
          <!-- A cache hit records no backend, so it says where the answer came from instead. -->
          {#if turn.meta.cacheHit}
            <span
              class="ega-pill ega-backend-pill"
              data-tooltip="Answered from the cache"
              data-tooltip-placement="top">Cached</span
            >
          {:else if turn.meta.backendId !== 'unknown'}
            {@const answeredBy = backendLabel(turn.meta.backendId)}
            <span
              class="ega-pill ega-backend-pill"
              data-tooltip={`Answered by ${answeredBy}`}
              data-tooltip-placement="top">{answeredBy}</span
            >
          {/if}
        {/if}
        <time
          class="ega-timestamp"
          data-ega-timestamp
          datetime={new Date(turn.createdAt).toISOString()}
          data-tooltip={new Date(turn.createdAt).toLocaleString()}
          data-tooltip-placement="top">{relativeTime(turn.createdAt, now)}</time
        >
      {/if}
      {#if variantCount > 1}
        <div class="ega-variant-nav" data-ega-variant-nav>
          <button
            type="button"
            class="ega-variant-btn"
            data-ega-variant-prev
            aria-label="Previous variant"
            disabled={activeIdx <= 0}
            onclick={() => onSelectVariant?.(turn.id, activeIdx - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          <span class="ega-variant-counter" aria-live="polite">
            {activeIdx + 1}/{variantCount}
            {#if hiddenBusyIdx >= 0}
              <span class="ega-variant-busy" data-ega-variant-busy
                >· {hiddenBusyIdx + 1} loading</span
              >
            {/if}
          </span>
          <button
            type="button"
            class="ega-variant-btn"
            data-ega-variant-next
            aria-label="Next variant"
            disabled={activeIdx >= variantCount - 1}
            onclick={() => onSelectVariant?.(turn.id, activeIdx + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      {/if}
    </header>
  {/if}
  {#if turn.status === 'error' && turn.error}
    {#if turn.content !== ''}
      <!-- A cut stream can end mid-token, so the partial text renders plain, never through Markdown. -->
      <div class="ega-assistant-body" dir="auto" lang={answerTag}>
        <span class="ega-streaming-plain">{turn.content}</span>
      </div>
    {/if}
    {#if isCancelled}
      <div class="ega-assistant-cancelled" data-ega-cancelled role="status">Canceled</div>
    {:else}
      {@const parts = errorTurnParts(turn.error)}
      <div class="ega-assistant-error" role="alert">
        <strong class="ega-error-title"
          ><CircleAlert size={14} aria-hidden="true" />{parts.title}{failedBackend}</strong
        >
        {#if parts.body}
          <span class="ega-error-body">{parts.body}</span>
        {/if}
        {#if parts.detail !== undefined}
          <details class="ega-error-details">
            <summary>Details</summary>
            <code>{parts.detail}</code>
          </details>
        {/if}
      </div>
    {/if}
    <div class="ega-assistant-actions">
      {#if turn.content !== ''}
        <span class="ega-copy-btn-wrap" class:is-copied={copied}>
          <IconButton
            icon={copied ? Check : Copy}
            ariaLabel={copied ? 'Copied' : 'Copy partial reply'}
            size="md"
            onclick={() => void copyToClipboard()}
          />
        </span>
        <span class="ega-partial-note">(partial)</span>
      {/if}
      {#if showRetry}
        <button
          type="button"
          class="ega-error-action-btn ega-retry-btn"
          disabled={retryWaitSec > 0 || inflight}
          onclick={() => onRetry(turn.id)}
        >
          <RotateCcw size={14} />
          {#if retryWaitSec > 0}
            Retry in {retryWaitSec}s
          {:else if inflight}
            Retry when this reply finishes
          {:else}
            Retry
          {/if}
        </button>
      {/if}
      {#if (optionsTab ?? fallbackTab) !== undefined}
        {@const tab = optionsTab ?? fallbackTab}
        <button
          type="button"
          class="ega-error-action-btn"
          data-ega-sidepanel-open-options
          onclick={() => tab !== undefined && openOptionsTab(tab)}
        >
          <SlidersHorizontal size={14} />
          {optionsTab === undefined ? 'Check your backends' : 'Open settings'}
        </button>
      {/if}
    </div>
  {:else}
    <!-- Only model text takes the reply's language: the skeleton and the empty-reply line are English UI. -->
    <div class="ega-assistant-body" dir="auto" lang={turn.content !== '' ? answerTag : undefined}>
      {#if turn.status === 'pending' && turn.content === ''}
        <!-- The stream's sr-only announcer speaks this; the log itself is aria-live=off. -->
        <span class="ega-stream-skeleton">
          <span class="ega-stream-skeleton-label">{taskGerund(currentTaskValue)}…</span>
          <span class="ega-stream-skeleton-bar" aria-hidden="true"></span>
        </span>
      {:else if showDiff && diffAgainst !== undefined}
        <DiffFadeText text={turn.content} {diffAgainst} />
      {:else if turn.status === 'pending' || turn.status === 'streaming'}
        <!-- Plain text skips the marked+DOMPurify pass per delta; aria-busy only works on the live region's own root. -->
        <!-- The caret is inside the text so it trails the last glyph instead of wrapping to its own flex line. -->
        <span class="ega-streaming-plain" aria-hidden="true"
          >{turn.content}<span class="ega-cursor">▍</span></span
        >
      {:else if turn.content === '' && !turn.explain}
        <span class="ega-empty-body" data-ega-empty-body>
          No reply came back. Click Regenerate, or check the model in Settings → Backends.
        </span>
      {:else}
        <Markdown text={turn.content} />
      {/if}
    </div>
    {#if turn.explain && !(turn.status === 'pending' && turn.content === '')}
      <div class="ega-assistant-explain" data-ega-explain dir="auto" lang={notesTag}>
        <div class="ega-explain-label" lang="en">{notesLabel(currentTaskValue)}</div>
        <Markdown text={turn.explain} />
      </div>
    {/if}
    {#if turn.status === 'done'}
      <div
        class="ega-assistant-actions ega-turn-actions"
        role="toolbar"
        tabindex="-1"
        aria-label="Reply actions"
        bind:this={actionsEl}
        onfocusin={onActionsFocusIn}
        onkeydown={onActionsKeydown}
      >
        <span class="ega-copy-btn-wrap" class:is-copied={copied}>
          <IconButton
            icon={copied ? Check : Copy}
            ariaLabel={copied ? 'Copied' : 'Copy reply'}
            size="md"
            dataAttrs={{
              'data-ega-action': 'copy',
              tabindex: activeAction === 'copy' ? 0 : -1,
            }}
            onclick={() => void copyToClipboard()}
          />
        </span>
        {#if speakable && turn.content !== ''}
          <IconButton
            icon={speaking ? Square : Volume2}
            ariaLabel={speaking ? 'Stop reading' : 'Read aloud'}
            size="md"
            dataAttrs={{
              'data-ega-action': 'speak',
              tabindex: activeAction === 'speak' ? 0 : -1,
            }}
            onclick={() => void toggleSpeech()}
          />
        {/if}
        <!-- Hidden, not disabled, while another reply runs: a disabled button cannot take focus, so its reason was hover-only. -->
        {#if canRetry && !inflight}
          <IconButton
            icon={RefreshCw}
            ariaLabel="Regenerate"
            size="md"
            dataAttrs={{
              'data-ega-regenerate': 'true',
              'data-ega-action': 'regenerate',
              tabindex: activeAction === 'regenerate' ? 0 : -1,
            }}
            onclick={() => onRegenerate?.(turn.id)}
          />
        {/if}
        {#if turn.meta || turn.contextSent !== undefined}
          <IconButton
            icon={Info}
            ariaLabel={inspectorOpen
              ? 'Hide details about this reply'
              : 'Show details about this reply'}
            size="md"
            dataAttrs={{
              'data-ega-inspector-toggle': 'true',
              'data-ega-action': 'details',
              'aria-expanded': String(inspectorOpen),
              tabindex: activeAction === 'details' ? 0 : -1,
            }}
            onclick={() => (inspectorOpen = !inspectorOpen)}
          />
        {/if}
        {#if refineTask}
          <IconButton
            icon={WandSparkles}
            ariaLabel="Refine this reply"
            tooltip="Refine"
            size="md"
            dataAttrs={{
              'data-ega-refine-toggle': 'true',
              'data-ega-action': 'refine',
              'aria-expanded': String(refineOpen),
              'aria-controls': refineRowId,
              tabindex: activeAction === 'refine' ? 0 : -1,
            }}
            onclick={() => void toggleRefine()}
          />
        {/if}
        {#if showTryAs && onSwap}
          <!-- A menu, not a select: Chrome commits a select on every arrow key, and each commit is a paid re-run. -->
          <DropdownMenu.Root bind:open={() => taskMenuOpen, (v) => (taskMenuOpen = v && !inflight)}>
            <!-- The bits Tooltip IconButton uses, so the hover label looks like the ones beside it. -->
            <Tooltip.Provider delayDuration={150} disableHoverableContent>
              <Tooltip.Root>
                <DropdownMenu.Trigger
                  class="ega-icon-btn variant-default size-md"
                  data-ega-task-switch
                  data-ega-action="try-as"
                  tabindex={activeAction === 'try-as' ? 0 : -1}
                  aria-disabled={inflight}
                  aria-label={inflight
                    ? 'Re-run with another task or language — wait for this reply to finish'
                    : 'Re-run with another task or language'}
                >
                  {#snippet child({ props })}
                    <Tooltip.Trigger {...props}>
                      <Icon icon={ListChecks} size={20} />
                    </Tooltip.Trigger>
                  {/snippet}
                </DropdownMenu.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content side="bottom" sideOffset={6} class="ega-icon-btn-tooltip">
                    {inflight ? 'Wait for this reply to finish' : 'Re-run as…'}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                class="sp-menu"
                align="end"
                sideOffset={6}
                bind:ref={taskMenuEl}
                onOpenAutoFocus={onTaskMenuOpenFocus}
              >
                <!-- Not bits' disabled: that drops the item from arrow keys, and a blocked swap must still be read. -->
                <DropdownMenu.Item
                  closeOnSelect={!swapBlocked}
                  onSelect={() => {
                    if (swapBlocked) return;
                    taskMenuOpen = false;
                    onSwap(turn.id);
                  }}
                >
                  {#snippet child({ props })}
                    <div
                      {...props}
                      class="sp-menu-item ega-swap-item"
                      aria-disabled={swapBlocked ? 'true' : 'false'}
                      data-ega-swap
                      data-ega-swap-item
                    >
                      <ArrowLeftRight size={16} aria-hidden="true" />
                      <span class="sp-menu-label">
                        {swapItemLabel}
                        {#if swapNote !== ''}
                          <span class="ega-swap-note" data-ega-swap-note>{swapNote}</span>
                        {/if}
                      </span>
                    </div>
                  {/snippet}
                </DropdownMenu.Item>
                {#if onTaskSwitch}
                  <DropdownMenu.Separator class="sp-menu-sep" />
                  <!-- Arrow keys only move the highlight; picking the task that already answered re-runs nothing. -->
                  <DropdownMenu.RadioGroup
                    value={currentTaskValue}
                    onValueChange={(v) => {
                      if (v === currentTaskValue) return;
                      taskMenuOpen = false;
                      onTaskSwitch(turn.id, v as TaskId);
                    }}
                  >
                    {#each taskOptions as o (o.id)}
                      <DropdownMenu.RadioItem
                        class="sp-menu-item"
                        value={o.id}
                        disabled={o.off}
                        data-ega-task-switch-item={o.id}
                      >
                        {#snippet children({ checked })}
                          <span class="sp-menu-label">{o.label}</span>
                          {#if checked}<Check size={16} aria-hidden="true" />{/if}
                        {/snippet}
                      </DropdownMenu.RadioItem>
                    {/each}
                  </DropdownMenu.RadioGroup>
                {/if}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        {/if}
        <!-- Bookmark and Delete sit in a menu at the row's end, so the row fits 400px and Delete stays away from Copy. -->
        <!-- The star shows a bookmark without opening the menu; the spacer already takes the free width, so it shifts nothing. -->
        <span class="ega-turn-action-end">
          {#if turn.bookmarked}
            <span
              class="ega-bookmarked-mark"
              data-ega-bookmarked-mark
              role="img"
              aria-label="Bookmarked"
              data-tooltip="Bookmarked"
              data-tooltip-placement="top"><Star size={12} aria-hidden="true" /></span
            >
          {/if}
        </span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="ega-icon-btn variant-default size-md"
            aria-label="More reply actions"
            data-ega-action="more"
            tabindex={activeAction === 'more' ? 0 : -1}
          >
            <Ellipsis size={16} aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="sp-menu" align="end" sideOffset={6}>
              <DropdownMenu.CheckboxItem
                class="sp-menu-item"
                checked={turn.bookmarked === true}
                onCheckedChange={() => onBookmark?.(turn.id)}
                data-ega-bookmark
              >
                {#snippet children({ checked })}
                  <Star size={16} aria-hidden="true" />
                  <span class="sp-menu-label">Bookmark</span>
                  {#if checked}<Check size={16} aria-hidden="true" />{/if}
                {/snippet}
              </DropdownMenu.CheckboxItem>
              <DropdownMenu.Separator class="sp-menu-sep" />
              <!-- Last, not first: a keyboard open lands on the first item, and a second Enter must not delete. -->
              <DropdownMenu.Item
                class="sp-menu-item ega-menu-item-danger"
                onSelect={() => onDelete?.(turn.id)}
                data-ega-delete
              >
                <Trash2 size={16} aria-hidden="true" />
                <span class="sp-menu-label">Delete this reply and its message</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {#if inspectorOpen && (turn.meta || turn.contextSent !== undefined)}
        <ReplyDetails
          meta={turn.meta}
          context={contextShown}
          sentText={detailsText}
          image={imageMode}
          taskLabel={taskLabel(taskViews, currentTaskValue)}
          onViewPrompt={() => openOptionsTab('tasks')}
          surface="panel"
          onClose={() => (inspectorOpen = false)}
        />
      {/if}
      {#if refinementBody}
        <button
          type="button"
          class="ega-refinement-chip"
          class:is-expanded={refinementExpanded}
          data-ega-refinement-chip
          aria-expanded={refinementExpanded}
          data-tooltip={refinementExpanded ? '' : refinementBody}
          data-tooltip-placement="top"
          onclick={() => (refinementExpanded = !refinementExpanded)}
        >
          {refinementExpanded ? `Refined: "${refinementBody}"` : refinementLabel}
        </button>
      {/if}
      {#if variantLang !== undefined}
        <span
          class="ega-refinement-chip"
          data-ega-lang-chip
          data-tooltip={`Answered in ${variantLangLabel}`}
          data-tooltip-placement="top"
        >
          → {variantLangLabel}
        </span>
      {/if}
      {#if activeVariant?.task !== undefined}
        <span
          class="ega-refinement-chip ega-task-chip"
          data-tooltip={`Answered as ${taskLabel(taskViews, activeVariant.task)}`}
          data-tooltip-placement="top"
        >
          {taskLabel(taskViews, activeVariant.task)}
        </span>
      {/if}
    {/if}
    {#if refineOpen && refineTask && onRefine}
      <!-- presentation: a layout box for the Escape handler; the chips carry their own group role. -->
      <div class="ega-refine-row" role="presentation" onkeydown={onRefineRowKeydown}>
        <QuickRefineChips
          id={refineRowId}
          {inflight}
          bind:draft={refineDraft}
          onRefine={async (args) => {
            const ok = await onRefine({ turnId: turn.id, ...args });
            if (ok) refineOpen = false;
            return ok;
          }}
        />
      </div>
    {/if}
  {/if}
</article>

<style>
  .ega-assistant-turn {
    align-self: flex-start;
    max-width: 95%;
    padding: var(--space-2) var(--space-3);
    color: var(--color-fg);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  /* Floor on the card, not the skeleton: the skeleton unmounts at the first token and the card would snap in. */
  .ega-assistant-turn.is-answering {
    min-width: 12rem;
  }
  .ega-assistant-turn.focused {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ega-assistant-body {
    display: flex;
    align-items: baseline;
    gap: 2px;
    flex-wrap: wrap;
  }
  .ega-assistant-error {
    color: var(--color-danger-fg, var(--color-fg));
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
  }
  .ega-error-title {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-weight: 600;
  }
  .ega-error-details {
    margin-top: var(--space-1);
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .ega-error-details summary {
    cursor: pointer;
  }
  .ega-error-details code {
    font-family: var(--font-mono, monospace);
    overflow-wrap: anywhere;
  }
  .ega-empty-body {
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
  }
  .ega-assistant-cancelled {
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
  }
  .ega-partial-note {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  .ega-explain-label {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: var(--space-1);
  }
  .ega-assistant-explain {
    padding: var(--space-2);
    border-inline-start: 3px solid var(--color-border);
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  /* Metrics copied from .ega-md so the body does not reflow when the stream settles. */
  .ega-streaming-plain {
    white-space: pre-wrap;
    font-family: inherit;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-fg);
    overflow-wrap: anywhere;
  }
  .ega-cursor {
    display: inline-block;
    color: var(--color-accent);
    animation: ega-cursor-blink 1s step-end infinite;
    font-weight: 600;
  }
  @keyframes ega-cursor-blink {
    0%,
    50% {
      opacity: 1;
    }
    50.01%,
    100% {
      opacity: 0;
    }
  }
  /* Without this the pre-stream bubble is an empty box with a blinking cursor. */
  .ega-stream-skeleton {
    display: inline-flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  .ega-stream-skeleton-label {
    font-style: italic;
  }
  .ega-stream-skeleton-bar {
    display: block;
    height: 10px;
    width: 100%;
    border-radius: var(--radius-sm);
    background: linear-gradient(
      90deg,
      var(--color-border) 0%,
      var(--color-dot-neutral) 50%,
      var(--color-border) 100%
    );
    background-size: 200% 100%;
    animation: ega-stream-shim 1.2s linear infinite;
  }
  @keyframes ega-stream-shim {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ega-stream-skeleton-bar {
      animation-duration: 0.01ms !important;
    }
  }
  /* Forced colors drops the gradient, leaving an invisible box where the bar should be. */
  @media (forced-colors: active) {
    .ega-stream-skeleton-bar {
      border: 1px solid CanvasText;
    }
  }
  .ega-assistant-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-1);
    font-size: var(--fs-xs);
  }
  .ega-assistant-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .ega-timestamp {
    margin-left: auto;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  /* Always visible; buttons rest muted (IconButton default) and gain emphasis per button on hover/focus. */
  .ega-turn-actions {
    min-height: 32px;
    margin-top: var(--space-1);
  }
  .ega-turn-action-end {
    display: inline-flex;
    margin-left: auto;
  }
  .ega-bookmarked-mark {
    display: inline-flex;
    color: var(--color-accent);
  }
  /* :global — the menu renders in a portal on <body>, outside this component's scope hash. */
  :global(.sp-menu-item.ega-menu-item-danger) {
    color: var(--color-danger-fg);
  }
  .ega-assistant-turn > .ega-assistant-actions:not(.ega-turn-actions) {
    padding-top: var(--space-2);
    margin-top: 0;
    border-top: 1px solid var(--color-border-subtle);
  }
  .ega-assistant-turn > .ega-turn-actions {
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
  }
  .ega-assistant-turn > .ega-refine-row {
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
  }
  .ega-refine-row > :global([data-ega-quick-refine]) {
    margin-top: 0;
  }
  /* Open, the Refine button reads as pressed, like IconButton's aria-pressed; border-color, not border, so it costs no reflow. */
  .ega-turn-actions :global([data-ega-refine-toggle][aria-expanded='true']) {
    color: var(--color-accent-hover);
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
  }
  /* :global — the Re-run as trigger is bits-ui's button. Busy, it stays focusable, so it is greyed rather than disabled. */
  .ega-turn-actions :global([data-ega-task-switch][aria-disabled='true']) {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  /* :global — the menu renders in a portal on <body>, outside this component's scope hash. */
  :global(.sp-menu-item.ega-swap-item[aria-disabled='true']) {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  /* The reason a blocked swap cannot run; muted, not disabled grey, so it stays readable. */
  :global(.ega-swap-note) {
    display: block;
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  .ega-pill {
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 1px var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  .ega-lang-pill {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
  .ega-lang-cluster {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .ega-copy-btn-wrap {
    display: inline-flex;
    border-radius: var(--radius-sm);
  }
  .ega-copy-btn-wrap.is-copied {
    animation: ega-success-pulse 600ms ease-out;
  }
  .ega-error-action-btn {
    box-sizing: border-box;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    font-size: var(--fs-xs);
    cursor: pointer;
  }
  .ega-error-action-btn:hover {
    background: var(--color-bg-sunken);
  }
  .ega-variant-nav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .ega-variant-btn {
    box-sizing: border-box;
    min-width: 32px;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-fg);
    cursor: pointer;
    line-height: 0;
  }
  .ega-variant-btn:hover:not(:disabled) {
    background: var(--color-bg-sunken);
  }
  .ega-variant-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .ega-variant-busy {
    color: var(--color-muted);
  }
  .ega-variant-counter {
    font-variant-numeric: tabular-nums;
    min-width: 2.5em;
    text-align: center;
  }
  .ega-refinement-chip:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .ega-refinement-chip {
    align-self: flex-start;
    padding: 2px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    /* accent lands under 4.5:1 on the soft accent tint; accent-hover clears it in both themes. */
    color: var(--color-accent-hover);
    font-size: var(--fs-xs);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button.ega-refinement-chip {
    cursor: pointer;
    font: inherit;
    text-align: start;
  }
  .ega-refinement-chip.is-expanded {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  /* :global — the spans render inside DiffFadeText, outside this component's scope hash. */
  .ega-assistant-body :global(.body-diff .diff-add) {
    color: var(--color-success-fg);
    background-color: var(--color-success-bg-soft);
    /* Forced colors drops the tint; underline vs line-through is what separates added from removed. */
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    border-radius: 2px;
    padding: 0 1px;
    transition:
      color 600ms ease,
      background-color 600ms ease;
  }
  .ega-assistant-body :global(.body-diff .diff-del) {
    color: var(--color-danger-fg);
    background-color: var(--color-danger-bg-soft);
    text-decoration: line-through;
    text-decoration-thickness: 1px;
    border-radius: 2px;
    padding: 0 1px;
    transition:
      color 600ms ease,
      background-color 600ms ease,
      text-decoration-color 600ms ease;
  }
  .ega-assistant-body :global(.body-diff-faded .diff-add),
  .ega-assistant-body :global(.body-diff-faded .diff-del) {
    color: inherit;
    background-color: transparent;
  }
  .ega-assistant-body :global(.body-diff-faded .diff-add) {
    text-decoration-line: none;
  }
  /* Deleted words leave the flow, so the faded body reads as the clean final sentence. */
  .ega-assistant-body :global(.body-diff-faded .diff-del) {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .ega-assistant-body :global(.body-diff .diff-add),
    .ega-assistant-body :global(.body-diff .diff-del) {
      transition-duration: 0ms;
    }
  }
</style>
