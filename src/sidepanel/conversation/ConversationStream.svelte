<script lang="ts">
  import { tick, untrack } from 'svelte';
  import UserTurn from './UserTurn.svelte';
  import AssistantTurn from './AssistantTurn.svelte';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import Languages from '@lucide/svelte/icons/languages';
  import SearchX from '@lucide/svelte/icons/search-x';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import {
    activeVariant,
    errorTurnParts,
    answerLangs,
    imageBackedTurnIds,
    isCancelledError,
    retryableTurnIds,
    turnTaskValue,
    type Turn,
  } from '../state/conversation';
  import { taskGerund } from '@/shared/task-prompts';
  import type { TaskId, TaskView } from '@/shared/task-view';
  import type { Variety } from '@/shared/types';

  interface Props {
    turns: readonly Turn[];
    /** When true the bookmark filter is on but produced no results — show the empty hint. */
    emptyBookmarkFilter?: boolean;
    /** When true a search query is active but produced no results. */
    emptySearch?: boolean;
    /** Clears the active search query. Wired only when a search is on. */
    onClearSearch?: () => void;
    /** Turns the bookmark-only filter off. Wired only when the filter is on. */
    onClearBookmarkFilter?: () => void;
    /** Currently focused turn id; null when nothing is focused. */
    focusedTurnId: string | null;
    /** Last turn id of the UNFILTERED conversation, so a filtered mid-turn can't claim isLatest. */
    latestTurnId?: string | null;
    onRetry: (turnId: string) => void;
    onFocusChange: (id: string | null) => void;
    /** Spawns a variant with a request-scoped refinement; never persisted. */
    onRefine?: (args: {
      turnId: string;
      refinementBody: string;
      refinementLabel?: string;
    }) => boolean | Promise<boolean>;
    /** Flip the active variant on an assistant turn. */
    onSelectVariant?: (turnId: string, idx: number) => void;
    /** Swap source/target langs and re-dispatch on the latest turn. */
    onSwap?: (turnId: string) => void;
    /** Re-dispatch with a different task on the latest turn. */
    onTaskSwitch?: (turnId: string, task: TaskId) => void;
    /** True when the latest turn has no swap to run (`canSwap` is false). */
    swapDisabled?: boolean;
    /** Regenerate a new variant for an assistant turn. */
    onRegenerate?: (turnId: string) => void;
    /** Bookmark toggle — both turn roles. */
    onBookmark?: (turnId: string) => void;
    /** Delete a turn and its pair — both turn roles. */
    onDelete?: (turnId: string) => void;
    /** Edit a user turn — SidePanel decides last-vs-mid branch. */
    onEdit?: (turnId: string) => void;
    /** Hands the j/k/r handler to the parent, which owns the one window keydown listener. */
    onRegisterKeydownHandler?: (handler: (e: KeyboardEvent) => void) => void;
    /** False hides the confidence pill whatever the threshold. */
    confidencePill?: boolean;
    /** Hide the confidence pill below this score. */
    confidencePillThreshold?: number;
    /** Result count of an active search or bookmark filter; null when neither is on. */
    filterSummary?: string | null;
    /** True while a turn is streaming; re-dispatch buttons bail until it settles. */
    inflight?: boolean;
    /** Enabled varieties — labels the language chip on a language-change variant. */
    varieties?: readonly Variety[];
    /** Every task, on or off: names custom tasks and fills Re-run. */
    taskViews?: readonly TaskView[] | undefined;
    /** False when no backend is ready; null while the check runs. Drives the first-run CTA. */
    backendReady?: boolean | null;
    /** Opens Settings → Backends from the empty state. */
    onSetUpBackend?: () => void;
    /** Opens the shortcuts overlay from the empty state. */
    onShowShortcuts?: () => void;
  }

  const {
    turns,
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
    onSwap,
    onTaskSwitch,
    swapDisabled = false,
    onRegisterKeydownHandler,
    onRegenerate,
    onBookmark,
    onDelete,
    onEdit,
    confidencePill = true,
    confidencePillThreshold = 0,
    filterSummary = null,
    inflight = false,
    varieties = [],
    taskViews,
    backendReady = null,
    onSetUpBackend,
    onShowShortcuts,
  }: Props = $props();

  /** Turns mounted at once; older ones mount via "Show earlier" so a 300-turn restore is not one Markdown pass. */
  const RENDER_WINDOW = 60;
  let shownBeyondWindow = $state(0);
  const hiddenCount = $derived(Math.max(0, turns.length - RENDER_WINDOW - shownBeyondWindow));
  const windowTurns = $derived(hiddenCount > 0 ? turns.slice(hiddenCount) : turns);

  // One pass per turns change; a per-turn findRetryTarget scan would make mount O(n²).
  const retryableIds = $derived(retryableTurnIds(turns));
  const latestUserTurnId = $derived(turns.filter((t) => t.role === 'user').at(-1)?.id ?? null);
  const imageBackedIds = $derived(imageBackedTurnIds(turns));
  const answerLangPairs = $derived(answerLangs(turns));
  const userTextById = $derived(
    Object.fromEntries(turns.filter((t) => t.role === 'user').map((t) => [t.id, t.content])),
  );

  // Timestamps are strings computed at render; with no tick every turn reads "just now" for ever.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  // How far up the reader may scroll and still count as at the bottom; the stream keeps following inside it.
  const NEAR_BOTTOM_PX = 80;

  let scroller = $state<HTMLDivElement | null>(null);
  // Id, not length: the `turns` prop is filtered, so clearing a search grows it with no new turn.
  let priorLatestId: string | null | undefined;
  let awayFromLatest = $state(false);

  function updateAwayFromLatest(): void {
    const el = scroller;
    if (!el) return;
    awayFromLatest = el.scrollHeight - (el.scrollTop + el.clientHeight) > NEAR_BOTTOM_PX;
  }

  // Follow the stream unless the reader scrolled up past NEAR_BOTTOM_PX (a new turn always follows); one effect, so a delta costs one layout.
  $effect.pre(() => {
    const len = turns.length;
    const last = turns[len - 1];
    // Registers this block on every delta and on the settle that mounts the footer.
    void last?.content.length;
    void last?.status;
    const growthKey = latestTurnId ?? last?.id ?? null;
    const grew = priorLatestId === undefined || growthKey !== priorLatestId;
    const el = scroller;
    // Commit only once there is a scroller: a restored thread lands before bind:this, and a run that
    // recorded it with no element would make the first measured run read "no growth" and stay at the top.
    if (!el) return;
    priorLatestId = growthKey;
    // Read before Svelte writes this update, so it measures a frame that is already laid out.
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < NEAR_BOTTOM_PX;
    if (!grew && !nearBottom) {
      // Content grew while the reader is scrolled up: the distance moved with no scroll event.
      void tick().then(updateAwayFromLatest);
      return;
    }
    void tick().then(() => {
      el.scrollTop = el.scrollHeight;
      awayFromLatest = false;
    });
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

  /** Same words the turn shows on screen, so the announcement and the panel agree. */
  function settledText(t: Turn | null): string {
    if (!t) return '';
    if (!t.error) return t.content;
    if (isCancelledError(t.error.code)) return 'Canceled';
    const { title, body } = errorTurnParts(t.error);
    return body ? `${title}: ${body}` : title;
  }

  /** Seeded from the first render on purpose, so a restored thread is not read out on open. */
  let announcedText = untrack(() => settledText(settledAssistant(turns)));
  let announcedAt = untrack(() => settledAssistant(turns)?.createdAt ?? 0);
  let announcement = $state('');

  // Only this announcer is live; a live stream would re-read every turn on each filter change.
  $effect(() => {
    const settled = settledAssistant(turns);
    // A narrowed filter can leave an OLDER turn last — that is not a new answer.
    if (!settled || settled.createdAt < announcedAt) return;
    const text = settledText(settled);
    if (text === announcedText) return;
    announcedText = text;
    announcedAt = settled.createdAt;
    announcement = text;
  });

  // Keyed on the variant too: Regenerate reuses the turn id and would otherwise stay silent.
  let announcedPendingKey: string | null = null;
  $effect(() => {
    const last = turns[turns.length - 1];
    if (last?.role !== 'assistant' || last.status !== 'pending') return;
    const key = `${last.id}:${activeVariant(last)?.id ?? ''}`;
    if (key === announcedPendingKey) return;
    announcedPendingKey = key;
    announcement = `${taskGerund(turnTaskValue(last))}…`;
  });

  // The settled-text announcer only hears the variant on screen; one finishing behind it changes no text.
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
        if (v.status === 'done') announcement = `Variant ${i + 1} ready`;
        else if (v.error && !isCancelledError(v.error.code)) {
          announcement = `Variant ${i + 1} failed`;
        }
      });
    }
  });

  // Kept sticky: clearing a filter must not re-announce whatever the region held before it.
  $effect(() => {
    const summary = filterSummary;
    if (summary !== null) announcement = summary;
  });

  function jumpToLatest(): void {
    const el = scroller;
    if (!el) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }

  // Registering a window listener here too would give two competing owners.
  $effect(() => {
    onRegisterKeydownHandler?.(handleKeydown);
  });

  function handleKeydown(e: KeyboardEvent): void {
    if (windowTurns.length === 0) return;
    const target = e.target as HTMLElement | null;
    if (
      // A native select owns its own arrow keys and letter type-ahead.
      target instanceof HTMLSelectElement ||
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
      description="No message in this conversation contains that text."
      icon={SearchX}
      {...onClearSearch ? { ctaLabel: 'Clear search', onCta: onClearSearch } : {}}
    />
  </div>
{:else if emptyBookmarkFilter}
  <div class="ega-empty-shell" data-ega-no-bookmarks>
    <EmptyState
      title="No bookmarked messages"
      description="Bookmark a message with the ☆ button to keep it here."
      icon={Bookmark}
      {...onClearBookmarkFilter
        ? { ctaLabel: 'Show all messages', onCta: onClearBookmarkFilter }
        : {}}
    />
  </div>
{:else if turns.length === 0}
  <!-- Outside role=log on purpose: EmptyState's role=status would nest a polite region inside a polite one. -->
  <div class="ega-empty-shell" data-ega-sidepanel-empty>
    {#if backendReady === false && onSetUpBackend}
      <EmptyState
        title="Add a backend to start"
        description="Ega needs a model to translate with. Add an API key, or set up Ollama or the native host."
        icon={Languages}
        ctaLabel="Set up a backend"
        onCta={onSetUpBackend}
      />
    {:else}
      <EmptyState
        title="Start a conversation"
        description="Right-click a selection, or type below to translate, explain, reword, and more."
        icon={Languages}
      />
    {/if}
    {#if onShowShortcuts}
      <button type="button" class="ega-kbd-link" data-ega-kbd-hints onclick={onShowShortcuts}>
        Keyboard shortcuts
      </button>
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
      {#if hiddenCount > 0}
        <button
          type="button"
          class="ega-show-earlier"
          data-ega-show-earlier
          onclick={() => (shownBeyondWindow += RENDER_WINDOW)}
        >
          Show earlier messages ({hiddenCount})
        </button>
      {/if}
      {#each windowTurns as turn (turn.id)}
        {#if turn.role === 'user'}
          <UserTurn
            {turn}
            {taskViews}
            focused={turn.id === focusedTurnId}
            latest={turn.id === latestUserTurnId}
            {now}
            {inflight}
            {onBookmark}
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
            {confidencePill}
            {confidencePillThreshold}
            {onRetry}
            {onRefine}
            {onSelectVariant}
            {onSwap}
            {onTaskSwitch}
            {swapDisabled}
            isLatest={turn.id === latestTurnId}
            {onRegenerate}
            {onBookmark}
            {onDelete}
            {inflight}
            {varieties}
            {taskViews}
            {now}
          />
        {/if}
      {/each}
    </div>
    {#if awayFromLatest}
      <button type="button" class="ega-jump-latest" data-ega-jump-latest onclick={jumpToLatest}>
        <ArrowDown size={14} />
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
  .ega-jump-latest {
    position: absolute;
    bottom: var(--space-3);
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-size: var(--fs-xs);
    cursor: pointer;
    box-shadow: 0 1px 3px var(--color-shadow);
    z-index: 5;
  }
  .ega-jump-latest:hover {
    background: var(--color-bg-hover, var(--color-bg-sunken));
  }
  .ega-show-earlier {
    align-self: center;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-fg-subtle);
    font-size: var(--fs-xs);
    cursor: pointer;
  }
  .ega-show-earlier:hover {
    background: var(--color-bg-hover, var(--color-bg-sunken));
    color: var(--color-fg);
  }
  .ega-kbd-link {
    margin: var(--space-2) 0 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-decoration: underline;
    cursor: pointer;
  }
  .ega-kbd-link:hover {
    color: var(--color-fg);
  }
  .ega-conv-stream {
    flex: 1 1 auto;
    min-height: 0;
    /* clip on x: a tooltip past the right edge must not add a horizontal scrollbar. */
    overflow: clip auto;
    /* Reserve the gutter — a scrollbar appearing re-wraps every message. */
    scrollbar-gutter: stable;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    /* The reserved gutter is inset too, so the cards would sit a scrollbar left of the composer. */
    padding-inline-end: calc(var(--space-3) - var(--scrollbar-w));
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
