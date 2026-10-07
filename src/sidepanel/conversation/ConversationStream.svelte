<script lang="ts">
  import { tick, untrack } from 'svelte';
  import UserTurn from './UserTurn.svelte';
  import AssistantTurn from './AssistantTurn.svelte';
  import EmptySuggestions from './EmptySuggestions.svelte';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import SearchX from '@lucide/svelte/icons/search-x';
  import Star from '@lucide/svelte/icons/star';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import {
    activeVariant,
    answerLangs,
    imageBackedTurnIds,
    isCancelledError,
    retryableTurnIds,
    turnTaskValue,
    type SwapPair,
    type Turn,
  } from '../state/conversation';
  import {
    separatorLabel,
    separatorTurnIds,
    taskLabelsOnChange,
    type SuggestionKind,
    type SuggestionResult,
  } from '../state/thread-view';
  import { taskGerund } from '@/shared/task-prompts';
  import { errorCopy } from '@/shared/error-copy';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { SHIPPED_TASK_VIEWS, type TaskId, type TaskView } from '@/shared/task-view';
  import type { LangSelection, Variety } from '@/shared/types';
  import type { ConfidenceSetting } from '@/shared/reply-meta';

  interface Props {
    turns: readonly Turn[];
    /** The first storage read has landed; before it no empty-state text shows, so it never flashes. */
    loaded?: boolean;
    emptyBookmarkFilter?: boolean;
    emptySearch?: boolean;
    onClearSearch?: () => void;
    onClearBookmarkFilter?: () => void;
    focusedTurnId: string | null;
    /** Last turn id of the UNFILTERED conversation, so a filtered mid-turn can't claim the newest row. */
    latestTurnId?: string | null;
    onRetry: (turnId: string) => void;
    onFocusChange: (id: string | null) => void;
    onRefine?: (args: {
      turnId: string;
      refinementBody: string;
      refinementLabel?: string;
    }) => boolean | Promise<boolean>;
    onSelectVariant?: (turnId: string, idx: number) => void;
    /** The swap a reply's Refine menu can run, per reply. */
    swapPairFor?: (turnId: string) => SwapPair | null;
    onSwap?: (turnId: string) => void;
    onTaskSwitch?: (turnId: string, task: TaskId) => void;
    onTranslateInto?: (turnId: string, lang: LangSelection) => void;
    onDescribeChange?: (turnId: string) => void;
    /** The reply "Describe a change…" is open for. */
    changingTurnId?: string | null;
    /** The message being edited in the composer. */
    editingTurnId?: string | null;
    onRegenerate?: (turnId: string) => void;
    onBookmark?: (turnId: string) => void;
    onDelete?: (turnId: string) => void;
    onEdit?: (turnId: string) => void;
    /** Hands the j/k/r handler to the parent, which owns the one window keydown listener. */
    onRegisterKeydownHandler?: (handler: (e: KeyboardEvent) => void) => void;
    confidence?: ConfidenceSetting;
    /** Result count of an active search or bookmark filter; null when neither is on. */
    filterSummary?: string | null;
    /** Spoken once when the panel shows another conversation ("Showing the conversation for …"). */
    switchAnnouncement?: string | null;
    inflight?: boolean;
    varieties?: readonly Variety[];
    taskViews?: readonly TaskView[] | undefined;
    backendReady?: boolean | null;
    onSetUpBackend?: () => void;
    onSuggestion?: (kind: SuggestionKind) => Promise<SuggestionResult>;
    /** The composer's target, so each reply can offer "Translate into {it}". */
    composerTarget?: string | undefined;
    /** The "Record request details" switch, so About says why a reply has no record. */
    recordsDetails?: boolean | undefined;
    /** Unused: About this reply opens Settings → Advanced itself. Accepted until SidePanel stops passing it. */
    onOpenSettings?: () => void;
  }

  const {
    turns,
    loaded = true,
    emptyBookmarkFilter = false,
    emptySearch = false,
    onClearSearch,
    onClearBookmarkFilter,
    focusedTurnId,
    latestTurnId = null,
    onRetry,
    onFocusChange,
    onRefine,
    onSelectVariant,
    swapPairFor,
    onSwap,
    onTaskSwitch,
    onTranslateInto,
    onDescribeChange,
    changingTurnId = null,
    editingTurnId = null,
    onRegisterKeydownHandler,
    onRegenerate,
    onBookmark,
    onDelete,
    onEdit,
    confidence = { show: true, threshold: 0 },
    filterSummary = null,
    switchAnnouncement = null,
    inflight = false,
    varieties = [],
    taskViews = SHIPPED_TASK_VIEWS,
    backendReady = null,
    onSetUpBackend,
    onSuggestion,
    composerTarget,
    recordsDetails,
  }: Props = $props();

  /** Turns mounted at once; older ones mount via "Show earlier" so a 300-turn restore is not one Markdown pass. */
  const RENDER_WINDOW = 60;
  let shownBeyondWindow = $state(0);
  const hiddenCount = $derived(Math.max(0, turns.length - RENDER_WINDOW - shownBeyondWindow));
  const windowTurns = $derived(hiddenCount > 0 ? turns.slice(hiddenCount) : turns);

  // One pass per turns change; a per-turn scan would make mount O(n²).
  const retryableIds = $derived(retryableTurnIds(turns));
  const latestUserTurnId = $derived(turns.filter((t) => t.role === 'user').at(-1)?.id ?? null);
  const imageBackedIds = $derived(imageBackedTurnIds(turns));
  const answerLangPairs = $derived(answerLangs(turns));
  const userTextById = $derived(
    Object.fromEntries(turns.filter((t) => t.role === 'user').map((t) => [t.id, t.content])),
  );
  // A bookmark belongs to the pair (spec §5.2, F12): either half shows it, and unchecking clears both halves.
  const pairIds = $derived(
    new Map(
      turns.flatMap((t): [string, readonly string[]][] => {
        if (t.role !== 'assistant' || t.attachedToTurnId === undefined) return [];
        const ids = [t.attachedToTurnId, t.id];
        return [
          [t.id, ids],
          [t.attachedToTurnId, ids],
        ];
      }),
    ),
  );
  const markedIds = $derived(
    new Set(turns.filter((t) => t.bookmarked === true).flatMap((t) => pairIds.get(t.id) ?? [t.id])),
  );
  function toggleBookmark(id: string): void {
    const ids = pairIds.get(id) ?? [id];
    const on = ids.filter((i) => turns.some((t) => t.id === i && t.bookmarked === true));
    for (const i of on.length > 0 ? on : [id]) onBookmark?.(i);
  }
  const separators = $derived(separatorTurnIds(turns));
  const taskLabels = $derived(taskLabelsOnChange(turns, taskViews));
  const positions = $derived(new Map(turns.map((t, i) => [t.id, i])));

  // Separator labels are computed at render; with no tick "Today" would never become "Yesterday".
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  // How far up the reader may scroll and still count as at the bottom.
  const NEAR_BOTTOM_PX = 80;
  // A new exchange lands with the user's bubble this far under the thread top when it does not fit.
  const TOP_GAP_PX = 24;

  let scroller = $state<HTMLDivElement | null>(null);
  // Id, not length: the `turns` prop is filtered, so clearing a search grows it with no new turn.
  let priorLatestId: string | null | undefined;
  let awayFromLatest = $state(false);
  let following = true;

  function reducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    );
  }

  function updateAwayFromLatest(): void {
    const el = scroller;
    if (!el) return;
    const away = el.scrollHeight - (el.scrollTop + el.clientHeight) > NEAR_BOTTOM_PX;
    awayFromLatest = away;
    // The reader scrolling up stops the follow; coming back to the bottom starts it again.
    following = !away;
  }

  /** Where an element's top sits inside the scrolled content. */
  function topIn(el: HTMLElement, s: HTMLElement): number {
    return el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop;
  }

  /** A new exchange: the whole pair when it fits, else the bubble's top a little under the thread top. */
  function landNewExchange(el: HTMLElement): void {
    const user = el.querySelector<HTMLElement>(`[data-turn-id="${latestUserTurnId ?? ''}"]`);
    const bottom = el.scrollHeight - el.clientHeight;
    if (!user) {
      el.scrollTop = bottom;
      return;
    }
    const userTop = topIn(user, el);
    el.scrollTop =
      el.scrollHeight - userTop <= el.clientHeight ? bottom : Math.max(0, userTop - TOP_GAP_PX);
  }

  /** While the reply grows, follow it only while its own start stays in view (the reader reads from the top). */
  function followReply(el: HTMLElement): void {
    // One layout read per delta; the browser clamps scrollTop, so the full height is "the end".
    const height = el.scrollHeight;
    const reply = el.querySelector<HTMLElement>(
      `[data-turn-id="${latestTurnId ?? turns.at(-1)?.id ?? ''}"]`,
    );
    const replyTop = reply ? topIn(reply, el) : Infinity;
    if (replyTop < height - el.clientHeight) {
      el.scrollTop = Math.max(el.scrollTop, replyTop - TOP_GAP_PX);
      following = false;
      updateAwayFromLatestSoon();
      return;
    }
    el.scrollTop = height;
  }

  function updateAwayFromLatestSoon(): void {
    void tick().then(() => {
      const el = scroller;
      if (el) awayFromLatest = el.scrollHeight - (el.scrollTop + el.clientHeight) > NEAR_BOTTOM_PX;
    });
  }

  $effect.pre(() => {
    const len = turns.length;
    const last = turns[len - 1];
    // Registers this block on every delta and on the settle that mounts the action row.
    void last?.content.length;
    void last?.status;
    const growthKey = latestTurnId ?? last?.id ?? null;
    const grew = priorLatestId === undefined || growthKey !== priorLatestId;
    const el = scroller;
    if (!el) return;
    const first = priorLatestId === undefined;
    priorLatestId = growthKey;
    if (first) {
      void tick().then(() => {
        el.scrollTop = el.scrollHeight;
        awayFromLatest = false;
      });
      return;
    }
    if (grew) {
      following = true;
      void tick().then(() => {
        landNewExchange(el);
        updateAwayFromLatestSoon();
      });
      return;
    }
    // Read before Svelte writes this update, so it measures a frame that is already laid out.
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < NEAR_BOTTOM_PX;
    if (!following || !nearBottom) {
      updateAwayFromLatestSoon();
      return;
    }
    void tick().then(() => followReply(el));
  });

  $effect(() => {
    const el = scroller;
    if (!el) return;
    updateAwayFromLatest();
    el.addEventListener('scroll', updateAwayFromLatest, { passive: true });
    // A narrower panel is a taller thread: a reader at the bottom would be left mid-conversation.
    const ro = new ResizeObserver(() => {
      if (awayFromLatest) return;
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateAwayFromLatest);
      ro.disconnect();
    };
  });

  let focusedInDom: string | null = null;

  // The ring alone tells a screen-reader user nothing, and can sit off-screen while `r` acts on it.
  $effect(() => {
    const id = focusedTurnId;
    if (id === null) {
      focusedInDom = null;
      return;
    }
    if (id === focusedInDom) return;
    const el = scroller?.querySelector<HTMLElement>(`[data-turn-id="${id}"]`);
    if (!el) return;
    focusedInDom = id;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  });

  function settledAssistant(list: readonly Turn[]): Turn | null {
    const t = list[list.length - 1];
    if (t?.role !== 'assistant') return null;
    return t.status === 'done' || t.status === 'error' ? t : null;
  }

  /** Same words the reply shows on screen, so the announcement and the panel agree. */
  function settledText(t: Turn | null): string {
    if (!t) return '';
    if (!t.error) return t.content;
    if (isCancelledError(t.error.code)) return 'Stopped';
    if (t.error.code === 'interrupted')
      return 'Reply interrupted: The panel closed before this finished.';
    const c = errorCopy(t.error.code, t.error.message, {
      ...(t.error.backendId !== undefined ? { backend: backendLabel(t.error.backendId) } : {}),
      image: imageBackedIds.has(t.id) || t.kind === 'image-translate',
    });
    return c === null ? 'Stopped' : `${c.title}: ${c.body}`;
  }

  // Seeded when the first storage read lands (not at mount, which comes first), so a restored thread is not read out.
  let seeded = untrack(() => loaded);
  let announcedText = untrack(() => (loaded ? settledText(settledAssistant(turns)) : ''));
  let announcedAt = untrack(() => (loaded ? (settledAssistant(turns)?.createdAt ?? 0) : 0));
  let announcement = $state('');

  // Only this announcer is live; a live stream would re-read every turn on each filter change.
  $effect(() => {
    const settled = settledAssistant(turns);
    if (!loaded) return;
    if (!seeded) {
      seeded = true;
      announcedText = settledText(settled);
      announcedAt = settled?.createdAt ?? 0;
      return;
    }
    // A narrowed filter can leave an OLDER turn last — that is not a new answer.
    if (!settled || settled.createdAt < announcedAt) return;
    const text = settledText(settled);
    if (text === announcedText) return;
    announcedText = text;
    announcedAt = settled.createdAt;
    announcement = text;
  });

  // Keyed on the version too: Regenerate reuses the turn id and would otherwise stay silent.
  let announcedPendingKey: string | null = null;
  $effect(() => {
    const last = turns[turns.length - 1];
    if (last?.role !== 'assistant' || last.status !== 'pending') return;
    const key = `${last.id}:${activeVariant(last)?.id ?? ''}`;
    if (key === announcedPendingKey) return;
    announcedPendingKey = key;
    announcement = `${taskGerund(turnTaskValue(last))}…`;
  });

  // The settled-text announcer only hears the version on screen; one finishing behind it changes no text.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered.
  const openVariants = new Set<string>();
  $effect(() => {
    for (const t of turns) {
      t.variants?.forEach((v, i) => {
        if (v.status === 'pending' || v.status === 'streaming') {
          openVariants.add(v.id);
          return;
        }
        if (!openVariants.delete(v.id) || i === t.activeVariantIdx) return;
        if (v.status === 'done') announcement = `Version ${i + 1} ready`;
        else if (v.error && !isCancelledError(v.error.code)) {
          announcement = `Version ${i + 1} failed`;
        }
      });
    }
  });

  // Kept sticky: clearing a filter must not re-announce whatever the region held before it.
  $effect(() => {
    const summary = filterSummary;
    if (summary !== null) announcement = summary;
  });
  $effect(() => {
    const said = switchAnnouncement;
    if (said !== null) announcement = said;
  });

  function jumpToLatest(): void {
    const el = scroller;
    if (!el) return;
    following = true;
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // Registering a window listener here too would give two competing owners.
  $effect(() => {
    onRegisterKeydownHandler?.(handleKeydown);
  });

  /** A focused box that scrolls on its own (Instructions sent, a long quote) owns the arrow keys. */
  function scrollsItself(el: HTMLElement): boolean {
    return (
      el.scrollHeight > el.clientHeight && /^(?:auto|scroll)$/.test(getComputedStyle(el).overflowY)
    );
  }

  function handleKeydown(e: KeyboardEvent): void {
    // A bits-ui trigger already used this key (ArrowDown opens its menu); bits never stops propagation.
    if (windowTurns.length === 0 || e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (
      (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
      target instanceof HTMLElement &&
      scrollsItself(target)
    ) {
      return;
    }
    if (
      // A native select or a bits-ui menu owns its own arrow keys and letter type-ahead.
      target instanceof HTMLSelectElement ||
      (target instanceof Element && target.closest('[role="menu"], [role="dialog"]') !== null) ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }
    // Navigation walks the rendered window only; a focus on an unmounted turn would go nowhere.
    const idx = focusedTurnId ? windowTurns.findIndex((t) => t.id === focusedTurnId) : -1;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(windowTurns.length - 1, idx + 1);
      const t = windowTurns[next];
      if (t) onFocusChange(t.id);
      return;
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(0, idx <= 0 ? 0 : idx - 1);
      const t = windowTurns[prev];
      if (t) onFocusChange(t.id);
      return;
    }
    if (e.key === 'r' && focusedTurnId) {
      const turn = windowTurns.find((t) => t.id === focusedTurnId);
      if (turn?.role === 'assistant') {
        e.preventDefault();
        onRetry(turn.id);
      }
    }
  }
</script>

<!-- Above the branches: an empty result replaces the stream, and its 0-count still has to be announced. -->
<span class="ega-sr-only" role="status" aria-live="polite" aria-atomic="true" data-ega-stream-live
  >{announcement}</span
>
{#if emptySearch}
  <div class="ega-empty-shell" data-ega-no-search-matches>
    <EmptyState
      title="No matches"
      description="No message here contains that text."
      icon={SearchX}
      {...onClearSearch ? { ctaLabel: 'Clear search', onCta: onClearSearch } : {}}
    />
  </div>
{:else if emptyBookmarkFilter}
  <div class="ega-empty-shell" data-ega-no-bookmarks>
    <EmptyState
      title="No bookmarked messages"
      description="Bookmark a message from its More menu to keep it here."
      icon={Star}
      {...onClearBookmarkFilter
        ? { ctaLabel: 'Show all messages', onCta: onClearBookmarkFilter }
        : {}}
    />
  </div>
{:else if turns.length === 0}
  <!-- Outside role=log on purpose: a status inside it would nest one polite region in another. -->
  <div class="ega-empty-shell">
    {#if loaded && onSetUpBackend}
      <EmptySuggestions {backendReady} {onSuggestion} {onSetUpBackend} />
    {/if}
  </div>
{:else}
  <div class="ega-conv-shell">
    <!-- aria-live=off: role=log announces politely by default, so every filter change would re-read the thread. -->
    <!-- The ring is state, not DOM focus, so leaving the stream has to drop it or `r` acts on an unseen turn. -->
    <div
      class="ega-conv-stream"
      bind:this={scroller}
      role="log"
      aria-live="off"
      onfocusout={(e) => {
        const to = e.relatedTarget;
        if (!(to instanceof Node) || !scroller?.contains(to)) onFocusChange(null);
      }}
    >
      <div class="ega-thread-col">
        {#if hiddenCount > 0}
          <button
            type="button"
            class="ega-show-earlier"
            data-ega-show-earlier
            onclick={() => (shownBeyondWindow += RENDER_WINDOW)}
          >
            Show {hiddenCount} earlier {hiddenCount === 1 ? 'message' : 'messages'}
          </button>
        {/if}
        {#each windowTurns as turn (turn.id)}
          {#if separators.has(turn.id)}
            <p class="ega-day-sep" data-ega-day-separator>
              <time datetime={new Date(turn.createdAt).toISOString()}
                >{separatorLabel(turn.createdAt, now)}</time
              >
            </p>
          {/if}
          {#if turn.role === 'user'}
            <UserTurn
              {turn}
              taskLabel={taskLabels.get(turn.id)}
              focused={turn.id === focusedTurnId}
              latest={turn.id === latestUserTurnId}
              laterCount={turns.length - (positions.get(turn.id) ?? 0) - 1}
              editing={turn.id === editingTurnId}
              bookmarked={markedIds.has(turn.id)}
              {inflight}
              onBookmark={toggleBookmark}
              {onDelete}
              {onEdit}
            />
          {:else}
            <AssistantTurn
              {turn}
              focused={turn.id === focusedTurnId}
              canRetry={retryableIds.has(turn.id)}
              hasImage={imageBackedIds.has(turn.id)}
              targetLang={answerLangPairs.get(turn.id)?.targetLang}
              sourceLang={answerLangPairs.get(turn.id)?.sourceLang}
              sentText={turn.attachedToTurnId ? (userTextById[turn.attachedToTurnId] ?? '') : ''}
              {confidence}
              {onRetry}
              {onRefine}
              {onSelectVariant}
              swapPair={turn.status === 'done' ? (swapPairFor?.(turn.id) ?? null) : null}
              {onSwap}
              {onTaskSwitch}
              {onTranslateInto}
              {onDescribeChange}
              changing={turn.id === changingTurnId}
              isLatest={turn.id === latestTurnId}
              {onRegenerate}
              bookmarked={markedIds.has(turn.id)}
              onBookmark={toggleBookmark}
              {onDelete}
              {inflight}
              {varieties}
              {taskViews}
              {composerTarget}
              {recordsDetails}
            />
          {/if}
        {/each}
      </div>
    </div>
    {#if awayFromLatest}
      <button type="button" class="ega-jump-latest" data-ega-jump-latest onclick={jumpToLatest}>
        <ArrowDown size={16} aria-hidden="true" />
        Jump to latest
      </button>
    {/if}
  </div>
{/if}

<style>
  .ega-conv-shell {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .ega-conv-stream {
    /* The containing block of every out-of-flow box in the thread (screen-reader-only text too):
       one that escapes the scroller sits below the panel and makes the whole page scroll. */
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    /* clip on x: a tooltip past the right edge must not add a horizontal scrollbar. */
    overflow: clip auto;
    /* Reserve the gutter: a scrollbar appearing would re-wrap every message. */
    scrollbar-gutter: stable;
    padding: var(--space-5) var(--space-3) var(--space-4);
    /* The reserved gutter sits inside the padding, so the text lines up with the composer. */
    padding-inline-end: calc(var(--space-3) - var(--scrollbar-w));
  }
  /* Wide windows: one readable column. */
  .ega-thread-col {
    display: flex;
    flex-direction: column;
    max-inline-size: 720px;
    margin-inline: auto;
  }
  /* 24 between exchanges, 8 between a message and its reply. */
  .ega-thread-col > :global(.ega-user-turn) {
    margin-block-start: var(--space-5);
  }
  .ega-thread-col > :global(.ega-reply) {
    margin-block-start: var(--space-2);
  }
  .ega-thread-col > :global(:first-child),
  .ega-thread-col > .ega-day-sep + :global(*) {
    margin-block-start: 0;
  }
  .ega-day-sep {
    margin: var(--space-5) 0 var(--space-2);
    text-align: center;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .ega-thread-col > .ega-day-sep:first-child {
    margin-block-start: 0;
  }
  .ega-show-earlier {
    align-self: center;
    min-block-size: 28px;
    margin-block-end: var(--space-2);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
  }
  .ega-show-earlier:hover {
    background: var(--color-bg-hover);
  }
  .ega-jump-latest {
    position: absolute;
    inset-block-end: var(--space-3);
    inset-inline-start: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-block-size: 28px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
    box-shadow: 0 1px 3px var(--color-shadow);
    z-index: 5;
  }
  .ega-jump-latest:hover {
    background: var(--color-bg-hover);
  }
  .ega-empty-shell {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: var(--space-3);
  }
  .ega-empty-shell :global([data-ega-empty-state]) {
    max-width: 320px;
  }
</style>
