<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { debugCatch } from '@/shared/logger';
  import ReplyDetails from '@/shared/components/ReplyDetails.svelte';
  import ReplyMeta from '@/shared/components/ReplyMeta.svelte';
  import { imageModeOf } from '@/shared/components/reply-details';
  import DiffFadeText from '@/shared/components/DiffFadeText.svelte';
  import Markdown from '@/shared/components/Markdown.svelte';
  import { langTag, replyLang } from '@/shared/lang-tag';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { canSpeak, pickLocalVoice, speakWith, stopSpeaking } from '../speech';
  import {
    activeVariant as activeVariantOf,
    isCancelledError,
    turnTaskValue,
    type SwapPair,
    type Turn,
  } from '../state/conversation';
  import { refinePresets, answerAgainLabel, type RefinePreset } from '../state/refine-presets';
  import { taskGerund } from '@/shared/task-prompts';
  import {
    SHIPPED_TASK_VIEWS,
    notesLabel,
    taskLabel,
    type TaskId,
    type TaskView,
  } from '@/shared/task-view';
  import { isRetryable } from '@/shared/error-policy';
  import { errorCopy, errorActionLabel, type ErrorAction } from '@/shared/error-copy';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { ALL_ERR_CODES, type ErrCode, type LangSelection, type Variety } from '@/shared/types';
  import { isIsoCode, labelFor } from '@/shared/languages';
  import { openOptionsTab } from '@/shared/open-options-tab';
  import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
  import { directionLabel, replyMetaItems, type ConfidenceSetting } from '@/shared/reply-meta';
  import ReplyMenus from './ReplyMenus.svelte';

  interface Props {
    turn: Turn;
    focused?: boolean;
    onRetry: (turnId: string) => void;
    onRefine?:
      | ((args: {
          turnId: string;
          refinementBody: string;
          refinementLabel?: string;
        }) => boolean | Promise<boolean>)
      | undefined;
    onSelectVariant?: ((turnId: string, idx: number) => void) | undefined;
    /** The newest reply keeps its action row in view; older ones show it on hover or focus. */
    isLatest?: boolean;
    /** False when the turn has no dispatch to replay: Regenerate, Refine and Answer again stay hidden. */
    canRetry?: boolean;
    /** The swap this reply's Refine menu can run, or null. */
    swapPair?: SwapPair | null;
    onSwap?: ((turnId: string) => void) | undefined;
    onTaskSwitch?: ((turnId: string, task: TaskId) => void) | undefined;
    onTranslateInto?: ((turnId: string, lang: LangSelection) => void) | undefined;
    onDescribeChange?: ((turnId: string) => void) | undefined;
    /** This reply is the one "Describe a change…" is open for. */
    changing?: boolean;
    onRegenerate?: ((id: string) => void) | undefined;
    onBookmark?: ((id: string) => void) | undefined;
    onDelete?: ((id: string) => void) | undefined;
    confidence?: ConfidenceSetting;
    /** Another reply runs; every re-run would bail until it settles. */
    inflight?: boolean;
    varieties?: readonly Variety[];
    taskViews?: readonly TaskView[] | undefined;
    hasImage?: boolean;
    targetLang?: LangSelection | undefined;
    sourceLang?: LangSelection | undefined;
    /** The composer's target, so the Refine menu can offer "Translate into {it}". */
    composerTarget?: string | undefined;
    /** The message this reply answers, as it was sent. */
    sentText?: string;
    /** Opens Settings, for "Turn on Record request details". */
    onOpenSettings?: (() => void) | undefined;
  }

  const {
    turn,
    focused = false,
    onRetry,
    onRefine,
    onSelectVariant,
    isLatest = false,
    canRetry = true,
    swapPair = null,
    onSwap,
    onTaskSwitch,
    onTranslateInto,
    onDescribeChange,
    changing = false,
    onRegenerate,
    onBookmark,
    onDelete,
    confidence = { show: true, threshold: 0 },
    inflight = false,
    varieties = [],
    taskViews = SHIPPED_TASK_VIEWS,
    hasImage = false,
    targetLang,
    sourceLang,
    composerTarget,
    sentText = '',
    onOpenSettings,
  }: Props = $props();

  const variantCount = $derived(turn.variants?.length ?? 0);
  const activeIdx = $derived(turn.activeVariantIdx ?? 0);
  const activeVariant = $derived(activeVariantOf(turn));
  const imageTurn = $derived(hasImage || turn.kind === 'image-translate');
  const currentTaskValue = $derived(turnTaskValue(turn));
  const answering = $derived(turn.status === 'pending' || turn.status === 'streaming');

  // A version only mirrors onto the turn while it is active, so a sibling streams out of sight.
  const hiddenBusyIdx = $derived.by(() => {
    const vs = turn.variants ?? [];
    const i = vs.findIndex((v) => v.status === 'pending' || v.status === 'streaming');
    return i >= 0 && i !== activeIdx ? i : -1;
  });

  const langName = (lang: string): string =>
    varieties.find((v) => v.id === lang)?.label ?? labelFor(lang);

  // The input language is the one the model named, else the one the send named; a swap version keeps its own.
  const answerTarget = $derived(activeVariant?.targetLang ?? targetLang);
  const answerSource = $derived(activeVariant?.sourceLang ?? sourceLang);
  // Reword and Grammar answer in the input's language, which a swap version never re-sends.
  const answerLang = $derived(
    replyLang(currentTaskValue, answerTarget, turn.detectedLang ?? sourceLang),
  );
  const speechLang = $derived(
    answerLang !== undefined && isIsoCode(answerLang) ? answerLang : undefined,
  );
  // The panel is lang=en; a reply with no tag is marked unknown ('') rather than read as English.
  const answerTag = $derived(langTag(answerLang) ?? '');
  const notesTag = $derived(langTag(answerTarget) ?? '');

  const direction = $derived(
    directionLabel({
      detected:
        turn.detectedLangs !== undefined && turn.detectedLangs.length > 0
          ? turn.detectedLangs
          : turn.detectedLang !== undefined
            ? [
                turn.detectedDetail !== undefined
                  ? { id: turn.detectedLang, detail: turn.detectedDetail }
                  : { id: turn.detectedLang },
              ]
            : [],
      ...(answerSource !== undefined ? { sourceLang: answerSource } : {}),
      ...(answerTarget !== undefined ? { targetLang: answerTarget } : {}),
      sourceOnly: currentTaskValue === 'reword' || currentTaskValue === 'grammar',
      varieties,
    }),
  );

  const refinementBody = $derived(activeVariant?.refinementBody);
  // What made this version, as the meta line names it; a language change shows in the direction instead.
  const versionLabel = $derived.by(() => {
    if (refinementBody !== undefined) return activeVariant?.refinementLabel ?? 'Your change';
    if (activeVariant?.task !== undefined) return `As ${taskLabel(taskViews, activeVariant.task)}`;
    return undefined;
  });

  // Speech and copy notes live in the meta line for a few seconds, next to the reply they are about.
  let transient = $state<string | null>(null);
  let transientTimer: ReturnType<typeof setTimeout> | undefined;
  function note(text: string, ms: number): void {
    clearTimeout(transientTimer);
    transient = text;
    transientTimer = setTimeout(() => (transient = null), ms);
  }

  const speakable = canSpeak();
  let speaking = $state(false);
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
      note(
        `No voice for ${speechLang !== undefined ? labelFor(speechLang) : 'this language'} on this computer`,
        6000,
      );
      return;
    }
    speakWith(voice, turn.content, () => {
      if (run === speechRun) speaking = false;
    });
  }

  // A refine or regenerate replaces the text being read.
  $effect(() => {
    const done = turn.status === 'done';
    const on = speaking;
    if (done || !on) return;
    speechRun++;
    stopSpeaking();
    speaking = false;
  });

  onDestroy(() => {
    speechRun++;
    clearTimeout(transientTimer);
    if (speaking) stopSpeaking();
  });

  const partial = $derived(turn.status === 'error' && turn.content !== '');
  const statusText = $derived.by(() => {
    if (answering) return `${taskGerund(currentTaskValue)}…`;
    if (transient !== null) return transient;
    if (speaking) return 'Reading aloud';
    if (hiddenBusyIdx >= 0) return `Version ${hiddenBusyIdx + 1} loading…`;
    if (partial) return 'Partial answer';
    return undefined;
  });
  const metaItems = $derived(
    replyMetaItems({
      ...(statusText !== undefined ? { status: statusText } : {}),
      bookmarked: turn.bookmarked === true,
      meta: answering ? undefined : turn.meta,
      direction: answering ? '' : direction,
      ...(versionLabel !== undefined && !answering ? { version: versionLabel } : {}),
      confidence: answering ? undefined : turn.confidence,
      confidenceSetting: confidence,
    }),
  );

  // ── Errors ─────────────────────────────────────────────────────────────────
  const isCancelled = $derived(isCancelledError(turn.error?.code));
  const knownCode = $derived.by<ErrCode | null>(() => {
    const code = turn.error?.code;
    if (code === undefined) return null;
    return (ALL_ERR_CODES as readonly string[]).includes(code) ? (code as ErrCode) : null;
  });
  // "interrupted" is the panel's own: the reply was saved mid-stream when the panel closed.
  const copy = $derived.by(() => {
    const e = turn.error;
    if (e === undefined || isCancelled) return null;
    if (e.code === 'interrupted') {
      return {
        title: 'Reply interrupted',
        body: 'The panel closed before this finished.',
        actions: ['try-again'] as readonly ErrorAction[],
        tab: 'backends' as const,
        detail: undefined,
      };
    }
    return errorCopy(e.code, e.message, {
      ...(e.backendId !== undefined ? { backend: backendLabel(e.backendId) } : {}),
      image: imageTurn,
    });
  });
  // A cancel is neutral and keeps its Try again; an error Settings can fix keeps it too: fix, then retry.
  const canTryAgain = $derived.by(() => {
    if (!canRetry || turn.error?.code === undefined) return false;
    if (isCancelled || turn.error.code === 'interrupted') return true;
    return (
      knownCode === null ||
      isRetryable(knownCode) ||
      (copy?.actions.includes('open-settings') ?? false)
    );
  });
  const errorActions = $derived.by<readonly ErrorAction[]>(() => {
    const out = (copy?.actions ?? []).filter(
      (a) => a === 'open-settings' || (a === 'try-again' && canTryAgain),
    );
    // A second failure on the same slot is not bad luck; offer the backends even when the code names no fix.
    if ((turn.retries ?? 0) >= 1 && !out.includes('open-settings'))
      return [...out, 'open-settings'];
    return out;
  });
  let detailsOpen = $state(false);

  // Ticks once a second only while a Retry-After window is open, then stops.
  let nowMs = $state(Date.now());
  const retryWaitSec = $derived.by(() => {
    const until = turn.error?.retryUntil;
    if (until === undefined) return 0;
    return Math.max(0, Math.ceil((until - nowMs) / 1000));
  });
  $effect(() => {
    const until = turn.error?.retryUntil;
    nowMs = Date.now();
    if (until === undefined || until <= Date.now()) return;
    const t = setInterval(() => {
      const now = Date.now();
      nowMs = now;
      if (now >= until) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  });

  function runErrorAction(a: ErrorAction): void {
    if (a === 'open-settings') {
      openOptionsTab(
        (turn.retries ?? 0) >= 1 && !copy?.actions.includes('open-settings')
          ? 'backends'
          : (copy?.tab ?? 'backends'),
      );
      return;
    }
    if (retryWaitSec > 0 || inflight) return;
    onRetry(turn.id);
  }

  function errorActionName(a: ErrorAction): string {
    if (a !== 'try-again') return errorActionLabel(a);
    if (retryWaitSec > 0) return errorActionLabel(a, retryWaitSec);
    return inflight ? 'Try again (wait for the current reply)' : 'Try again';
  }

  // ── Focus on a re-run ──────────────────────────────────────────────────────
  // A re-run unmounts the row with the button or item that started it; focus would drop to <body>.
  let articleEl: HTMLElement | null = $state(null);
  let wasAnswering = untrack(() => answering && (turn.retries ?? 0) === 0);
  $effect(() => {
    const now = answering;
    const el = articleEl;
    if (el === null) return;
    const started = now && !wasAnswering;
    wasAnswering = now;
    if (!started) return;
    const active = document.activeElement;
    if (active === null || active === document.body) el.focus({ preventScroll: true });
  });

  const srLabel = $derived(
    variantCount > 1 ? `Ega reply, version ${activeIdx + 1} of ${variantCount}` : 'Ega reply',
  );

  // ── Action row ─────────────────────────────────────────────────────────────
  const canRerun = $derived(canRetry && onRefine !== undefined);
  const presets = $derived<readonly RefinePreset[]>(
    imageTurn ? [] : refinePresets(currentTaskValue),
  );
  const translateInto = $derived(
    composerTarget !== undefined && composerTarget !== answerLang
      ? { id: composerTarget, label: langName(composerTarget) }
      : null,
  );
  const swapLabel = $derived(
    swapPair === null || swapPair.blocked !== undefined || imageTurn
      ? null
      : `Swap: ${langName(swapPair.sourceLang)} → ${langName(swapPair.targetLang)}`,
  );
  // Image replies can only re-run as a task that reads images.
  const answerAgain = $derived(
    !canRetry || onTaskSwitch === undefined
      ? []
      : taskViews
          .filter((v) => !v.disabled && v.id !== currentTaskValue && (!imageTurn || v.image))
          .map((v) => ({ id: v.id, label: answerAgainLabel(v.id, v.label) })),
  );
  const refined = $derived(refinementBody !== undefined);
  let showChanges = $state(false);

  // One tab stop for the row; arrows move inside it. Hidden items are left out, never disabled ones.
  const actionKeys = $derived<readonly string[]>([
    'copy',
    ...(canRetry ? ['regenerate'] : []),
    ...(canRerun ? ['refine'] : []),
    'more',
    ...(variantCount > 1 ? ['prev', 'next'] : []),
  ]);
  let actionsEl: HTMLElement | null = $state(null);
  let pickedAction = $state('copy');
  const activeAction = $derived(
    actionKeys.includes(pickedAction) ? pickedAction : (actionKeys[0] ?? 'copy'),
  );
  const tab = (key: string): number => (activeAction === key ? 0 : -1);

  function onActionsFocusIn(e: FocusEvent): void {
    const key = (e.target as HTMLElement | null)
      ?.closest('[data-ega-action]')
      ?.getAttribute('data-ega-action');
    if (key !== null && key !== undefined && actionKeys.includes(key)) pickedAction = key;
  }

  function onActionsKeydown(e: KeyboardEvent): void {
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
  async function copyReply(): Promise<void> {
    if (!turn.content) return;
    try {
      await navigator.clipboard.writeText(turn.content);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (e) {
      debugCatch(e, 'sidepanel.AssistantTurn.copy');
      note("Couldn't copy. Try again.", 4000);
    }
  }

  let aboutOpen = $state(false);
  async function setAbout(open: boolean): Promise<void> {
    aboutOpen = open;
    await tick();
    if (open) articleEl?.querySelector<HTMLElement>('[data-ega-inspector-title]')?.focus();
    else actionsEl?.querySelector<HTMLElement>("[data-ega-action='more']")?.focus();
  }

  const contextShown = $derived(
    (turn.meta?.pageContextSent ??
      taskViews.find((v) => v.id === currentTaskValue)?.pageContext ??
      true)
      ? turn.contextSent
      : null,
  );
  const imageMode = $derived(
    imageModeOf(
      turn.meta,
      imageTurn ? (currentTaskValue === 'translate' ? 'ocr' : 'task') : undefined,
    ),
  );
  const detailsText = $derived(sentText === IMAGE_TURN_PLACEHOLDER ? '' : sentText);

  // Diff only refine versions: an edited question's fresh answer against the old one is noise.
  const prevVariant = $derived(
    turn.variants && activeIdx > 0 ? turn.variants[activeIdx - 1] : undefined,
  );
  const diffAgainst = $derived(
    refinementBody !== undefined && prevVariant?.status === 'done'
      ? prevVariant.content
      : undefined,
  );
  const showDiff = $derived(
    showChanges &&
      turn.status === 'done' &&
      diffAgainst !== undefined &&
      diffAgainst !== turn.content,
  );
</script>

<article
  class="ega-reply"
  class:focused
  class:older={!isLatest}
  tabindex="-1"
  aria-label={srLabel}
  data-turn-id={turn.id}
  data-ega-reply
  bind:this={articleEl}
>
  {#if turn.status === 'error' && turn.error}
    {#if partial}
      <!-- A cut stream can end mid-token, so the partial text renders plain, never through Markdown. -->
      <div class="ega-answer" dir="auto" lang={answerTag}>
        <span class="ega-plain">{turn.content}</span>
      </div>
      <ReplyMeta items={metaItems} />
    {/if}
    {#if isCancelled}
      <p class="ega-stopped" role="status" data-ega-cancelled>Stopped</p>
      {#if canTryAgain}
        <div class="ega-error-actions">
          <Button
            variant="ghost"
            size="sm"
            dataAttrs={{ 'data-ega-retry': 'true' }}
            onclick={() => runErrorAction('try-again')}>{errorActionName('try-again')}</Button
          >
        </div>
      {/if}
    {:else if copy}
      <div class="ega-error" data-ega-error>
        <div role="alert">
          <p class="ega-error-title">
            <Icon icon={CircleAlert} size={16} />{copy.title}
          </p>
          <p class="ega-error-body">{copy.body}</p>
        </div>
        <div class="ega-error-actions">
          {#if partial}
            <IconButton
              icon={copied ? Check : Copy}
              ariaLabel={copied ? 'Copied' : 'Copy'}
              size="sm"
              dataAttrs={{ 'data-ega-action': 'copy' }}
              onclick={() => void copyReply()}
            />
          {/if}
          {#each errorActions as a, i (a)}
            {@const waiting = a === 'try-again' && (retryWaitSec > 0 || inflight)}
            <Button
              variant={i === 0 ? 'secondary' : 'ghost'}
              size="sm"
              dataAttrs={{
                ...(a === 'try-again'
                  ? { 'data-ega-retry': 'true' }
                  : { 'data-ega-sidepanel-open-options': 'true' }),
                ...(waiting ? { 'aria-disabled': 'true' } : {}),
              }}
              onclick={() => runErrorAction(a)}>{errorActionName(a)}</Button
            >
          {/each}
          {#if copy.detail !== undefined}
            <Button
              variant="ghost"
              size="sm"
              dataAttrs={{ 'aria-expanded': String(detailsOpen), 'data-ega-error-details': 'true' }}
              onclick={() => (detailsOpen = !detailsOpen)}>Details {detailsOpen ? '▾' : '▸'}</Button
            >
          {/if}
        </div>
        {#if detailsOpen && copy.detail !== undefined}
          <pre class="ega-error-detail">{copy.detail}</pre>
        {/if}
      </div>
    {/if}
  {:else}
    <!-- Only model text takes the reply's language: the skeleton and the empty line are English UI. -->
    <div class="ega-answer" dir="auto" lang={turn.content !== '' ? answerTag : undefined}>
      {#if turn.status === 'pending' && turn.content === ''}
        <span class="ega-skeleton" aria-hidden="true">
          <span class="ega-skeleton-bar"></span>
          <span class="ega-skeleton-bar"></span>
          <span class="ega-skeleton-bar"></span>
        </span>
      {:else if showDiff && diffAgainst !== undefined}
        <DiffFadeText text={turn.content} {diffAgainst} fade={false} />
      {:else if answering}
        <!-- Plain text skips the Markdown pass per delta; the caret trails the last glyph. -->
        <span class="ega-plain" aria-hidden="true"
          >{turn.content}<span class="ega-cursor">▍</span></span
        >
      {:else if turn.content === '' && !turn.explain}
        <span class="ega-empty-answer" data-ega-empty-body
          >No answer came back. Try Regenerate.</span
        >
      {:else}
        <Markdown text={turn.content} />
      {/if}
    </div>
    {#if turn.explain && !(turn.status === 'pending' && turn.content === '')}
      <div class="ega-notes" data-ega-explain dir="auto" lang={notesTag}>
        <p class="ega-notes-label" lang="en">{notesLabel(currentTaskValue)}</p>
        <div class="ega-notes-text"><Markdown text={turn.explain} /></div>
      </div>
    {/if}
    <ReplyMeta
      items={metaItems}
      statusAction={speaking && transient === null
        ? { label: 'Stop', onclick: () => void toggleSpeech() }
        : undefined}
    />
    {#if turn.status === 'done'}
      <div
        class="ega-reply-actions"
        role="toolbar"
        tabindex="-1"
        aria-label="Reply actions"
        bind:this={actionsEl}
        onfocusin={onActionsFocusIn}
        onkeydown={onActionsKeydown}
      >
        <IconButton
          icon={copied ? Check : Copy}
          ariaLabel={copied ? 'Copied' : 'Copy'}
          size="sm"
          dataAttrs={{ 'data-ega-action': 'copy', tabindex: tab('copy') }}
          onclick={() => void copyReply()}
        />
        {#if canRetry}
          <IconButton
            icon={RefreshCw}
            ariaLabel={inflight ? 'Regenerate (wait for the current reply)' : 'Regenerate'}
            tooltip="Regenerate"
            size="sm"
            dataAttrs={{
              'data-ega-regenerate': 'true',
              'data-ega-action': 'regenerate',
              tabindex: tab('regenerate'),
              ...(inflight ? { 'aria-disabled': 'true' } : {}),
            }}
            onclick={() => {
              if (!inflight) onRegenerate?.(turn.id);
            }}
          />
        {/if}
        <ReplyMenus
          turnId={turn.id}
          refineTab={tab('refine')}
          moreTab={tab('more')}
          {canRerun}
          busy={inflight}
          {presets}
          canDescribe={!imageTurn}
          {translateInto}
          defaultLang={composerTarget ?? answerTarget ?? 'en'}
          {varieties}
          {swapLabel}
          {refined}
          {showChanges}
          {changing}
          speakable={speakable && turn.content !== ''}
          {speaking}
          {aboutOpen}
          {answerAgain}
          bookmarked={turn.bookmarked === true}
          onPreset={(p) =>
            void onRefine?.({ turnId: turn.id, refinementBody: p.body, refinementLabel: p.label })}
          onDescribeChange={() => onDescribeChange?.(turn.id)}
          onTranslateInto={(lang) => onTranslateInto?.(turn.id, lang as LangSelection)}
          onSwap={() => onSwap?.(turn.id)}
          onShowChanges={(on) => (showChanges = on)}
          onSpeak={() => void toggleSpeech()}
          onAbout={(open) => void setAbout(open)}
          onAnswerAgain={(task) => onTaskSwitch?.(turn.id, task)}
          onBookmark={() => onBookmark?.(turn.id)}
          onDelete={() => onDelete?.(turn.id)}
        />
        {#if variantCount > 1}
          <span class="ega-pager" data-ega-variant-nav>
            <IconButton
              icon={ChevronLeft}
              ariaLabel="Previous version"
              size="sm"
              dataAttrs={{
                'data-ega-variant-prev': 'true',
                'data-ega-action': 'prev',
                tabindex: tab('prev'),
                ...(activeIdx <= 0 ? { 'aria-disabled': 'true' } : {}),
              }}
              onclick={() => {
                if (activeIdx > 0) onSelectVariant?.(turn.id, activeIdx - 1);
              }}
            />
            <span class="ega-pager-count" aria-hidden="true">{activeIdx + 1}/{variantCount}</span>
            <span class="ega-sr-only" aria-live="polite"
              >Version {activeIdx + 1} of {variantCount}</span
            >
            <IconButton
              icon={ChevronRight}
              ariaLabel="Next version"
              size="sm"
              dataAttrs={{
                'data-ega-variant-next': 'true',
                'data-ega-action': 'next',
                tabindex: tab('next'),
                ...(activeIdx >= variantCount - 1 ? { 'aria-disabled': 'true' } : {}),
              }}
              onclick={() => {
                if (activeIdx < variantCount - 1) onSelectVariant?.(turn.id, activeIdx + 1);
              }}
            />
          </span>
        {/if}
      </div>
      {#if aboutOpen}
        <ReplyDetails
          meta={turn.meta}
          context={contextShown}
          sentText={detailsText}
          image={imageMode}
          taskLabel={taskLabel(taskViews, currentTaskValue)}
          surface="panel"
          {direction}
          confidence={turn.confidence}
          change={activeVariant?.refinementLabel === undefined ? refinementBody : undefined}
          {onOpenSettings}
          onClose={() => void setAbout(false)}
        />
      {/if}
    {:else}
      <!-- The row's height is kept while the reply runs, so nothing jumps when it lands. -->
      <div class="ega-reply-actions-slot" aria-hidden="true"></div>
    {/if}
  {/if}
</article>

<style>
  .ega-reply {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
    color: var(--color-fg);
    border-radius: var(--radius-sm);
    --ega-md-fs: var(--fs-md);
  }
  .ega-reply.focused {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ega-reply:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ega-answer {
    font-size: var(--fs-md);
    line-height: var(--lh-body);
    min-inline-size: 0;
  }
  /* Headings inside an answer stay at the answer size; the panel uses two text sizes. */
  .ega-answer :global(.ega-md h1),
  .ega-answer :global(.ega-md h2),
  .ega-answer :global(.ega-md h3),
  .ega-answer :global(.ega-md h4) {
    font-size: var(--fs-md);
    font-weight: 600;
  }
  .ega-answer :global(.ega-md code) {
    font-size: inherit;
  }
  .ega-answer :global(.ega-md pre) {
    font-size: var(--fs-sm);
  }
  .ega-plain {
    white-space: pre-wrap;
    font-family: inherit;
    font-size: var(--fs-md);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }
  .ega-cursor {
    display: inline-block;
    color: var(--color-accent);
    font-weight: 600;
  }
  @media (prefers-reduced-motion: no-preference) {
    .ega-cursor {
      animation: ega-cursor-blink 1s step-end infinite;
    }
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
  /* Three text-shaped bars, static: a still bar is honest about having nothing yet. */
  .ega-skeleton {
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding-block: 5px;
  }
  .ega-skeleton-bar:nth-child(2) {
    inline-size: 92%;
  }
  .ega-skeleton-bar:nth-child(3) {
    inline-size: 60%;
  }
  .ega-skeleton-bar {
    display: block;
    inline-size: 100%;
    block-size: 10px;
    border-radius: var(--radius-sm);
    background: var(--color-bg-hover);
  }
  @media (forced-colors: active) {
    .ega-skeleton-bar {
      border: 1px solid CanvasText;
    }
  }
  .ega-empty-answer,
  .ega-stopped {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-md);
    line-height: var(--lh-body);
  }
  .ega-notes {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-block-start: var(--space-1);
  }
  .ega-notes-label {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-muted);
  }
  .ega-notes-text {
    padding-inline-start: var(--space-2);
    border-inline-start: 2px solid var(--color-border);
    color: var(--color-muted);
    --ega-md-fs: var(--fs-md);
  }
  .ega-notes-text :global(.ega-md) {
    color: var(--color-muted);
  }
  .ega-error {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ega-error-title {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    font-size: var(--fs-md);
    font-weight: 600;
    line-height: var(--lh-body);
    color: var(--color-danger-fg);
  }
  .ega-error-body {
    margin: 0;
    font-size: var(--fs-md);
    line-height: var(--lh-body);
    color: var(--color-fg);
  }
  .ega-error-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin-block-start: var(--space-1);
  }
  .ega-error-actions :global(.ega-btn[aria-disabled='true']) {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  .ega-error-detail {
    margin: 0;
    padding-inline-start: var(--space-2);
    border-inline-start: 2px solid var(--color-border);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .ega-reply-actions,
  .ega-reply-actions-slot {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--space-1);
    min-block-size: 28px;
  }
  .ega-reply-actions :global([aria-disabled='true']) {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  /* Open, Refine reads as pressed: border-color only, so it costs no reflow. */
  .ega-reply-actions :global([data-ega-action='refine'][aria-expanded='true']),
  .ega-reply-actions :global([data-ega-action='refine'][aria-pressed='true']) {
    color: var(--color-accent-hover);
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
  }
  .ega-pager {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: auto;
  }
  .ega-pager-count {
    min-inline-size: 2.5em;
    text-align: center;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
  }
  /* Older replies keep the row's height and its tab stop; hover or focus shows it. Touch always shows it. */
  @media (hover: hover) {
    .ega-reply.older:not(:hover):not(:focus-within) .ega-reply-actions {
      opacity: 0;
      pointer-events: none;
    }
    .ega-reply-actions {
      transition: opacity var(--motion-fast) var(--ease-out);
    }
  }
  .ega-answer :global(.body-diff .diff-add) {
    color: var(--color-success-fg);
    background-color: var(--color-success-bg-soft);
    /* Forced colors drops the tint; underline vs line-through is what separates added from removed. */
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    border-radius: 2px;
  }
  .ega-answer :global(.body-diff .diff-del) {
    color: var(--color-danger-fg);
    background-color: var(--color-danger-bg-soft);
    text-decoration: line-through;
    text-decoration-thickness: 1px;
    border-radius: 2px;
  }
</style>
