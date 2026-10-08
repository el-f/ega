// A factory, not module state: the panel remounts on every open, and module state would carry the old session's turns in.

import {
  activeVariant,
  addAssistantTurn,
  addDeliveredAssistantTurn,
  addUserTurn as addUserTurnPure,
  addVariant as addVariantPure,
  applyChunk as applyChunkPure,
  buildStartArgs,
  failDispatch as failDispatchPure,
  cancel as cancelPure,
  deleteTurnPair,
  dropOrphanHead,
  dropVariant as dropVariantPure,
  emptyConversation,
  findEditableLastUserTurn,
  isImageTurn,
  findRetryTarget,
  dropLastUserExchange as dropLastUserExchangePure,
  imageBackedTurnIds,
  interruptPendingTurns,
  isCancelledError,
  openVariantIds,
  replaceAssistantTurn,
  selectVariant as selectVariantPure,
  toggleBookmark as toggleBookmarkPure,
  truncateFrom,
  variantIdxForTarget,
  type Turn,
  type TurnDispatch,
  type TurnKind,
  type SwapPair,
  type Variant,
  type VariantSeed,
} from './conversation';
import {
  type LoadThreadResult,
  loadThreadResult,
  mergeStoredThread,
  parseThreadChange,
  saveThread,
  settleStoredTurn,
  stripImage,
  threadKey,
  GENERAL_ORIGIN,
  IMAGE_SHED_NOTE,
  MAX_TURNS_PER_THREAD,
  isQuotaError,
  type SaveThreadResult,
  type EvictedConversation,
  type StoredThreadView,
} from './conversation-store';
import {
  currentConversation,
  markConversationOpened,
  newConversationId,
  pendingDeleteIds,
  readIndex,
  scheduleConversationDelete,
  siteOf,
} from '@/shared/saved-conversations';
import { sendTranslateCancel, sendTranslateStart } from '@/shared/translate-ui';
import { imageStuckTimeoutMs, stuckTimeoutMs } from '@/shared/stuck-timeout';
import { isRetryable, optionsTabForMessage } from '@/shared/error-policy';
import { errCodeLabel } from '@/shared/err-labels';
import { ALL_ERR_CODES, type ErrCode } from '@/shared/types';
import { debugCatch } from '@/shared/logger';
import { asLangSelection } from '@/shared/brands';
import { isIsoCode } from '@/shared/languages';
import { toastStore } from '@/shared/components/toastStore';
import { makeAsyncLock } from '@/shared/utils/async-lock';
import { isSafeRenderImageSrc } from '@/shared/image-url-guard';
import { uuid } from '@/shared/uuid';
import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
import { createMemoizedJsonParser } from '@/shared/backends/base';
import type { LangSelection, PageContext, TranslationChunk } from '@/shared/types';
import type { ImageTask, Tone } from '@/shared/task-prompts';
import type { TaskId } from '@/shared/task-view';

interface DispatchInput {
  /** Pre-built user-turn content; "[image]" for image-translate, whose data URL comes separately. */
  content: string;
  /** Drives the user-turn marker and the task sent to the router. */
  kind: TurnKind;
  /** Optional image data URL for image-translate turns. */
  imageDataUrl?: string;
  /** Source language (variety id or 'auto'). */
  sourceLang: LangSelection;
  /** Target language (variety id or ISO). */
  targetLang: LangSelection;
  /** User streaming preference. */
  stream: boolean;
  /** Optional tone modifier; only meaningful when kind='reword'. */
  tone?: Tone;
  /** null = context off or the tab cannot be read; undefined = not provided. */
  context?: PageContext | null;
  /** Explanation the tooltip already produced. A response carrying its own explain wins. */
  explain?: string;
  /** Answer replaced by an edit-last re-send, kept as a done variant. */
  preservedResponse?: string;
  /** A custom task's id; it runs under kind `translate`. */
  taskId?: TaskId;
  /** The text was cut to this many characters on its way in. */
  trimmedTo?: number;
}

/** What `deleteTurn` removed, so the caller can offer Undo. */
export interface DeletedSlice {
  removed: Turn[];
  /** Index the slice sat at, so Undo puts it back in place rather than at the end. */
  index: number;
  /** Thread the delete happened on; an Undo after the panel followed the tab must not land here. */
  origin: string;
  /** Thread generation at delete time; a clear, purge or reload since then makes the slice stale. */
  gen: number;
  /** Turn id to the moment this delete buried it, so an Undo answers that burial and no other. */
  deletedAt: ReadonlyMap<string, number>;
}

export interface ConversationContainer {
  /** Reactive list of turns. */
  readonly turns: Turn[];
  /** Reactive id of the streaming assistant turn (null when idle). */
  readonly inflightId: string | null;
  /** True when this sidepanel dispatched `requestId`, or holds it for a seed. False for undefined or foreign ids. */
  ownsRequest: (requestId: string | undefined) => boolean;
  /** Keeps the chunks of an image seed that waits for a conversation switch; seeding replays them. */
  holdRequest: (requestId: string) => void;
  /** Append a user turn + a loading assistant turn and dispatch. Returns the assistant turn id. */
  send: (input: DispatchInput) => Promise<string>;
  /** Apply a streaming chunk to the inflight assistant turn. */
  applyChunk: (c: TranslationChunk) => void;
  /** Abort the currently inflight assistant turn. */
  cancel: () => void;
  /** Re-dispatch the user turn that produced the given assistant id. */
  retry: (assistantId: string) => Promise<void>;
  /** Re-dispatch as a sibling variant; `refinementBody` reaches the prompt and the cache key, never advanced.rules. */
  refine: (args: {
    turnId: string;
    refinementBody: string;
    refinementLabel?: string;
  }) => Promise<boolean>;
  /** The pair `swapVariant(turnId)` would send, with `blocked` when it would add nothing; null when there is no swap at all. Names the swap in the menu. */
  swapPair: (turnId: string) => SwapPair | null;
  /** Re-dispatch with source and target langs swapped. False when `swapPair` is null or blocked. */
  swapVariant: (turnId: string) => Promise<boolean>;
  /** Re-dispatch the turn with a different task. False when inflight or unresolvable. */
  taskVariant: (turnId: string, task: TaskId) => Promise<boolean>;
  /** Answer the reply `turnId` in `targetLang`: flips to a done variant already in that language,
   *  else dispatches one. A second pick replaces its own still-streaming variant. False when nothing changed. */
  langVariant: (turnId: string, targetLang: LangSelection) => Promise<boolean>;
  /** Flip the active variant on an assistant turn. */
  selectVariant: (turnId: string, idx: number) => void;
  /** The last user turn, or null when there is none. Reads only — nothing is removed. */
  lastUserTurn: () => { id: string; content: string; kind: TurnKind; hasImage: boolean } | null;
  /** Drop the last user turn and its assistant turns. */
  dropLastUserExchange: () => void;
  /** Remove a turn and its linked pair. Cancels the inflight dispatch when it is in
   *  the removed set. Returns the removed slice so the caller can offer Undo. */
  deleteTurn: (turnId: string) => DeletedSlice | null;
  /** Put a slice back at its old index. False when the thread moved on and nothing was restored. */
  restoreTurns: (slice: DeletedSlice) => boolean;
  /** Flip `bookmarked` on the turn. Drives the ★-only filter. */
  toggleBookmark: (turnId: string) => void;
  /** Re-run the turn's own task as a new variant. False when inflight or unresolvable. */
  regenerateVariant: (turnId: string) => Promise<boolean>;
  /** Truncate from `userTurnId` on and return its content. Null when it is not a user turn. */
  editFrom: (userTurnId: string) => string | null;
  /** The tab now shows `site`: keep the open conversation if it is that site's, else open the site's current one. True when this call changed the conversation on screen. */
  followSite: (site: string) => Promise<boolean>;
  /** Show conversation `id`: save the open one, load this one, and make it its site's current conversation. False: unreadable, nothing changed. */
  openConversation: (id: string) => Promise<boolean>;
  /** Open an empty conversation for the tab's site; nothing is stored until its first message. Returns the id it left, for Undo. */
  startNewConversation: () => Promise<string>;
  /** Deletes `id` after the Undo window. The open conversation is replaced by an empty one at once. */
  deleteConversation: (id: string, onFail?: () => void) => Promise<{ undo: () => void }>;
  /** Force-flush any pending debounced persistence. */
  flush: () => Promise<void>;
  /** True while the last save failed, so the panel can warn that turns are no longer kept. */
  readonly saveFailed: boolean;
  /** True when the last failure was a storage-quota rejection, so the panel can name the lever. */
  readonly saveFailedQuota: boolean;
  /** Id of the conversation on screen; the storage key suffix. */
  readonly activeId: string;
  /** The site the conversation on screen belongs to. */
  readonly activeSite: string;
  /** The site of the tab the panel follows. Differs from `activeSite` while the user reads another site's conversation. */
  readonly tabSite: string;
  /** The panel is closing: cancel replies still finishing for threads it no longer shows. */
  stopBackground: () => void;
  /** Storage was wiped elsewhere: drop the thread from memory without writing it back. */
  resetAfterPurge: () => void;
  /** Another window wrote the active thread: merge its turns in. Own writes and other origins are ignored. */
  onStorageChanged: (changes: Record<string, chrome.storage.StorageChange>) => void;
  /** Seed a turn pair for a context-menu image translate: unseeded, its chunks match no turn id and are dropped. */
  seedExternalImageTurn: (
    requestId: string,
    imageUrl: string,
    dispatch?: TurnDispatch,
    task?: ImageTask,
  ) => void;
  /** Land a tooltip payload as a completed exchange — no dispatch. */
  seedDeliveredTurn: (input: {
    kind: TurnKind;
    sourceText: string;
    response: string;
    imageDataUrl?: string;
    imageDropped?: boolean;
    sourceLang: LangSelection;
    targetLang: LangSelection;
    stream: boolean;
    tone?: Tone;
    trimmedTo?: number;
  }) => void;
}

/** What a toast calls the conversation's site. */
function siteLabel(id: string): string {
  const site = siteOf(id);
  return site === GENERAL_ORIGIN ? 'other pages' : site.replace(/^https?:\/\//, '');
}

/** Names the conversation the store removed to make room. */
function evictedMessage(e: EvictedConversation): string {
  return e.title !== undefined
    ? `The conversation "${e.title}" on ${siteLabel(e.id)} was removed to make room.`
    : `An older conversation for ${siteLabel(e.id)} was removed to make room.`;
}

/** Bounded so a long session does not grow the set without limit. */
const OWNED_REQUEST_CAP = 32;
/** A clear of a full thread records one per turn; the store keeps the same number. */
const DELETED_ID_CAP = MAX_TURNS_PER_THREAD;

export interface ConversationOptions {
  /** Silence budget before a streaming turn is failed as TIMEOUT; the flag picks the vision budget. */
  stallMs?: (hasImage: boolean) => number;
}

const STALL_MESSAGE = 'The reply stopped arriving. Send it again.';
const ADOPTED_STALL_MESSAGE = 'The window that sent this stopped before it finished.';

export function createConversation(opts: ConversationOptions = {}): ConversationContainer {
  const initial = emptyConversation();
  const switchLock = makeAsyncLock();
  /** Stamped on every save, so this panel's own `onChanged` echo is told apart from another window's write. */
  const writer = uuid();
  // Ids this panel loaded or created; saveThread keeps stored turns outside this set (another window wrote them).
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const knownIds = new Set<string>();
  /** The Settings delete stamp this panel has applied; a later one, not the clock, decides what it drops. */
  let seenClearedAt: number | undefined;
  function noteKnownTurns(turns: readonly Turn[]): void {
    for (const t of turns) knownIds.add(t.id);
  }
  // Read only from the toast callback, never in a derivation.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const ownedRequests = new Set<string>();
  /** Chunks that came before their seed: the worker streams at once, and the seed may wait for a switch. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const heldChunks = new Map<string, TranslationChunk[]>();
  function noteOwnedRequest(requestId: string): void {
    ownedRequests.add(requestId);
    if (ownedRequests.size > OWNED_REQUEST_CAP) {
      const oldest = ownedRequests.values().next().value;
      if (oldest !== undefined) ownedRequests.delete(oldest);
    }
  }
  // A lost terminal chunk (worker restart, dead port) would leave the turn streaming forever.
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let stallMs = 0;
  function clearStall(): void {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }
  function rearmStall(requestId: string): void {
    clearStall();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (state.requestId !== requestId) return;
      sendTranslateCancel(requestId);
      applyChunk({ type: 'error', requestId, code: 'TIMEOUT', message: STALL_MESSAGE });
    }, stallMs);
  }
  function budgetMs(hasImage: boolean): number {
    return (
      opts.stallMs?.(hasImage) ?? (hasImage ? imageStuckTimeoutMs(null) : stuckTimeoutMs(null))
    );
  }
  function armStall(requestId: string, hasImage: boolean): void {
    stallMs = budgetMs(hasImage);
    rearmStall(requestId);
  }
  const state = $state({
    turns: initial.turns,
    inflightId: initial.inflightId as string | null,
    /** Variant the inflight stream writes to. Set on every dispatch (seed v1 or sibling), null when idle. */
    inflightVariantId: null as string | null,
    /** The router-level request id, distinct from `inflightId`, which is a turn id. */
    requestId: null as string | null,
    /** Last-dispatch metadata so retry can re-fire the same task/tone/lang. */
    lastDispatch: null as DispatchInput | null,
    /** Per-request parser cache — collapses the delta-then-done double parse. */
    parser: createMemoizedJsonParser(),
    /** Origin whose thread is currently loaded. Drives persistence target. */
    activeId: GENERAL_ORIGIN as string,
    /** Site of the tab the panel follows. */
    tabSite: GENERAL_ORIGIN as string,
    /** Set when a save is rejected — quota is full, so new turns are on screen only. */
    saveFailed: false,
    saveFailedQuota: false,
  });

  /** The <img> paints before the router's SSRF check, so an unsafe src would fire a privileged-origin GET. */
  function safeImageSrc(raw: string | undefined): string | undefined {
    return raw !== undefined && isSafeRenderImageSrc(raw) ? raw : undefined;
  }

  /** The start message never reached the background: fail the turn so it is retryable, not stuck loading. */
  function failDispatch(turnId: string, requestId: string, e: unknown, variantId?: string): void {
    debugCatch(e, 'conversation.failDispatch');
    mutate((turns) => [...failDispatchPure(turns, turnId, variantId)], 'debounce');
    // Something dispatched while we awaited owns the slot now — clearing it would strand that turn.
    if (state.requestId !== requestId) return;
    clearStall();
    state.inflightId = null;
    state.inflightVariantId = null;
    state.requestId = null;
  }

  async function send(input: DispatchInput): Promise<string> {
    // Taking the inflight slot without closing a running stream leaves that turn streaming forever.
    cancel();
    const userId = uuid();
    const assistantId = uuid();
    const requestId = uuid();
    const safeImg = safeImageSrc(input.imageDataUrl);
    const dispatch: TurnDispatch = {
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      stream: input.stream,
    };
    const userTurns = addUserTurnPure(state.turns, {
      id: userId,
      kind: input.kind,
      content: input.content,
      // Same rule as a delivered turn: an image the panel refused cannot be replayed.
      ...(input.imageDataUrl === undefined || safeImg !== undefined ? { dispatch } : {}),
      ...(safeImg ? { imageDataUrl: safeImg } : {}),
      ...(input.tone ? { tone: input.tone } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.trimmedTo !== undefined ? { trimmedTo: input.trimmedTo } : {}),
    });
    const userTurn = userTurns[userTurns.length - 1];
    if (userTurn === undefined) throw new Error('addUserTurn returned no turn');
    const withAssistant = addAssistantTurn(userTurns, {
      id: assistantId,
      kind: input.kind,
      attachedToTurnId: userId,
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.context !== undefined ? { contextSent: input.context } : {}),
      ...(input.explain ? { explain: input.explain } : {}),
      ...(input.preservedResponse !== undefined
        ? { preservedResponse: input.preservedResponse }
        : {}),
    });
    // Mirror the store's cap so the in-memory array stays bounded.
    mutate(
      () =>
        withAssistant.length > MAX_TURNS_PER_THREAD
          ? dropOrphanHead(withAssistant.slice(-MAX_TURNS_PER_THREAD), withAssistant)
          : withAssistant,
      'debounce',
    );
    state.inflightId = assistantId;
    state.inflightVariantId = `${assistantId}:v1`;
    state.requestId = requestId;
    noteOwnedRequest(requestId);
    armStall(requestId, safeImg !== undefined);
    state.lastDispatch = input;
    state.parser = createMemoizedJsonParser();
    try {
      await sendTranslateStart(
        buildStartArgs(userTurn, {
          requestId,
          reuse: dispatch,
          tone: input.tone,
          context: input.context,
          thread: state.turns,
        }),
      );
    } catch (e) {
      failDispatch(assistantId, requestId, e);
    }
    return assistantId;
  }

  /** A reply the panel moved away from. It streams into a private copy of its turn, and the
   *  copy is saved to its own thread when the reply ends. */
  interface BackgroundReply {
    origin: string;
    turn: Turn;
    variantId: string;
    parser: ReturnType<typeof createMemoizedJsonParser>;
    stallMs: number;
    timer: ReturnType<typeof setTimeout> | null;
  }
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by chunk routing, never rendered.
  const background = new Map<string, BackgroundReply>();
  /** Not this panel's writer, so the panel adopts the saved answer when it shows that thread again. */
  const backgroundWriter = uuid();

  /** Frees the inflight slot for the next thread without stopping the reply. */
  function moveToBackground(): void {
    const requestId = state.requestId;
    const variantId = state.inflightVariantId;
    const live = state.turns.find((t) => t.id === state.inflightId);
    if (requestId === null || variantId === null || live === undefined) {
      cancel();
      return;
    }
    clearStall();
    background.set(requestId, {
      origin: state.activeId,
      turn: $state.snapshot(live) as Turn,
      variantId,
      parser: state.parser,
      stallMs,
      timer: null,
    });
    rearmBackgroundStall(requestId);
    state.inflightId = null;
    state.inflightVariantId = null;
    state.requestId = null;
  }

  function rearmBackgroundStall(requestId: string): void {
    const reply = background.get(requestId);
    if (reply === undefined) return;
    if (reply.timer !== null) clearTimeout(reply.timer);
    reply.timer = setTimeout(() => {
      reply.timer = null;
      sendTranslateCancel(requestId);
      applyBackgroundChunk(requestId, reply, {
        type: 'error',
        requestId,
        code: 'TIMEOUT',
        message: STALL_MESSAGE,
      });
    }, reply.stallMs);
  }

  function applyBackgroundChunk(
    requestId: string,
    reply: BackgroundReply,
    c: TranslationChunk,
  ): void {
    applyChunkPure([reply.turn], reply.turn.id, c, reply.parser, reply.variantId);
    if (c.type === 'delta') {
      rearmBackgroundStall(requestId);
      return;
    }
    if (reply.timer !== null) clearTimeout(reply.timer);
    background.delete(requestId);
    if (c.type === 'done') delete reply.turn.retries;
    settleStoredTurn(reply.origin, reply.turn, backgroundWriter)
      .then((r) => noticeBackgroundSave(reply.origin, r))
      .catch((e: unknown) => {
        debugCatch(e, 'conversation.backgroundReply');
        toastStore.push({
          message: `The answer for ${siteLabel(reply.origin)} could not be saved.`,
          variant: 'danger',
        });
      });
  }

  /** What a background reply's save removed, named by site: the thread on screen is another one. */
  function noticeBackgroundSave(origin: string, r: SaveThreadResult | undefined): void {
    const site = siteLabel(origin);
    const notes = [
      r?.evicted !== undefined ? evictedMessage(r.evicted) : null,
      r?.shedImages === true
        ? `Storage is nearly full. Images were removed from the conversation for ${site} to keep the text.`
        : null,
      r?.droppedTurns !== undefined
        ? `${r.droppedTurns} older message${r.droppedTurns === 1 ? ' was' : 's were'} removed from the conversation for ${site} to save space.`
        : null,
    ];
    for (const message of notes) {
      if (message !== null) toastStore.push({ message, variant: 'warning' });
    }
  }

  /** A reply still finishing for the loaded thread takes the free slot back: its Stop, its live text
   *  and the variant guards that stop a second dispatch on the same turn. */
  function reattachBackground(origin: string): void {
    const own = [...background].filter(([, reply]) => reply.origin === origin);
    const shown = (turnId: string): boolean => state.turns.some((t) => t.id === turnId);
    // Another window removed the turn meanwhile: the answer has nowhere to land.
    stopBackgroundFor(own.filter(([, reply]) => !shown(reply.turn.id)).map(([, r]) => r.turn.id));
    const entry = own.find(([, reply]) => shown(reply.turn.id));
    if (entry === undefined || state.inflightId !== null) return;
    const [requestId, reply] = entry;
    if (reply.timer !== null) clearTimeout(reply.timer);
    background.delete(requestId);
    // The copy holds every delta since the switch; storage holds the text as it was at the switch.
    mutate((turns) => turns.map((t) => (t.id === reply.turn.id ? reply.turn : t)), 'none');
    state.inflightId = reply.turn.id;
    state.inflightVariantId = reply.variantId;
    state.requestId = requestId;
    state.parser = reply.parser;
    stallMs = reply.stallMs;
    rearmStall(requestId);
  }

  function ownedByBackground(turnId: string): boolean {
    return [...background.values()].some((reply) => reply.turn.id === turnId);
  }

  /** A removed turn needs no answer: stop the request instead of letting it bill and land nowhere. */
  function stopBackgroundFor(turnIds: readonly string[]): void {
    for (const [requestId, reply] of background) {
      if (!turnIds.includes(reply.turn.id)) continue;
      if (reply.timer !== null) clearTimeout(reply.timer);
      sendTranslateCancel(requestId);
      background.delete(requestId);
    }
  }

  /** The panel is closing: nothing is left to save a reply still running for another thread. */
  function stopBackground(): void {
    for (const [requestId, reply] of background) {
      if (reply.timer !== null) clearTimeout(reply.timer);
      sendTranslateCancel(requestId);
    }
    background.clear();
  }

  function applyChunk(c: TranslationChunk): void {
    const held = heldChunks.get(c.requestId);
    if (held !== undefined) {
      held.push(c);
      return;
    }
    const reply = c.requestId ? background.get(c.requestId) : undefined;
    if (reply !== undefined) {
      applyBackgroundChunk(c.requestId, reply, c);
      return;
    }
    if (c.requestId && state.requestId && c.requestId !== state.requestId) {
      // Late chunk from a prior dispatch: a stale delta would pollute the new turn, a stale terminal would close it.
      return;
    }
    const id = state.inflightId;
    if (id === null) return;
    if (c.type === 'delta' && state.requestId !== null) rearmStall(state.requestId);
    const variantId = state.inflightVariantId ?? undefined;
    const terminal = c.type === 'done' || c.type === 'error';
    if (terminal) {
      clearStall();
      // Clear inflight before the turn settles, so no subscriber sees a terminal turn still marked inflight.
      state.inflightId = null;
      state.inflightVariantId = null;
      state.requestId = null;
    }
    // In place: a new array per delta would re-render every turn.
    mutate(
      (turns) => {
        applyChunkPure(turns, id, c, state.parser, variantId);
        if (c.type === 'done') {
          const settledTurn = turns.find((t) => t.id === id);
          if (settledTurn?.retries !== undefined) delete settledTurn.retries;
        }
        return turns;
      },
      terminal ? 'now' : 'none',
    );
  }

  function cancel(): void {
    if (!state.inflightId) return;
    clearStall();
    if (state.requestId) sendTranslateCancel(state.requestId);
    const inflightId = state.inflightId;
    const variantId = state.inflightVariantId ?? undefined;
    state.inflightId = null;
    state.inflightVariantId = null;
    state.requestId = null;
    mutate((turns) => [...cancelPure(turns, inflightId, variantId)], 'now');
  }

  async function retry(assistantId: string): Promise<void> {
    if (state.inflightId !== null || ownedByBackground(assistantId)) {
      // Retrying mid-stream would clobber inflightId/requestId and strand both turns.
      toastStore.push({
        message: 'Wait for the current reply to finish, then retry.',
        variant: 'warning',
      });
      return;
    }
    const settled = state.turns.find((t) => t.id === assistantId);
    // The `r` key reaches this function without the gates the Retry button applies.
    if (settled?.role === 'assistant' && settled.status === 'error' && settled.error) {
      const raw = settled.error.code;
      const known = (ALL_ERR_CODES as readonly string[]).includes(raw) ? (raw as ErrCode) : null;
      // A cancel is neutral: retrying it is what the user meant, as on the tooltip.
      if (known !== null && !isCancelledError(raw) && !isRetryable(known)) {
        toastStore.push({
          message:
            optionsTabForMessage(settled.error.message, known) !== undefined
              ? `${errCodeLabel(known)} — fix it in Settings, then send the message again.`
              : `${errCodeLabel(known)} — this reply cannot be retried. Send the message again.`,
          variant: 'warning',
        });
        return;
      }
      const until = settled.error.retryUntil;
      if (until !== undefined && until > Date.now()) {
        const waitMs = until - Date.now();
        toastStore.push({
          message: `Wait ${Math.ceil(waitMs / 1000)}s before retrying.`,
          variant: 'warning',
          countdownMs: waitMs,
          // Each press refreshes one toast; its countdown still ends at the same retryUntil.
          key: 'retry-wait',
        });
        return;
      }
    }
    // A settled answer and its refinements are the user's; re-answer beside them, never over them.
    if (settled?.role === 'assistant' && settled.status === 'done') {
      await regenerateVariant(assistantId);
      return;
    }
    // A failed sibling retries with its own modifiers beside the answers that survived, never over them.
    if (settled?.role === 'assistant' && settled.variants && settled.variants.length > 1) {
      await retryVariant(settled);
      return;
    }
    const source = findRetryTarget(state.turns, assistantId);
    if (!source) return;
    const reuse = replayDispatch(source);
    if (reuse === null) return;
    const tone = source.tone ?? state.lastDispatch?.tone;
    const context = state.turns.find((t) => t.id === assistantId)?.contextSent;
    // Retry means redo THIS assistant: re-attach to the same user turn, never append one.
    const userId = source.id;
    const nextAssistantId = uuid();
    const requestId = uuid();
    // Only a failure counts: the done branch above is Regenerate, not a retry.
    const retries = settled?.status === 'error' ? (settled.retries ?? 0) + 1 : 0;
    // A replace is a delete plus an insert: without the tombstone another window writes the dead turn back.
    noteRemoved([assistantId]);
    mutate(
      (turns) =>
        replaceAssistantTurn(turns, assistantId, {
          id: nextAssistantId,
          kind: source.kind,
          attachedToTurnId: userId,
          ...(source.taskId !== undefined ? { taskId: source.taskId } : {}),
          ...(retries > 0 ? { retries } : {}),
          ...(context !== undefined ? { contextSent: context } : {}),
          // The tooltip's explanation came with the seed, not the stream, so the retry keeps it.
          ...(settled?.explain !== undefined ? { explain: settled.explain } : {}),
        }),
      'debounce',
    );
    state.inflightId = nextAssistantId;
    state.inflightVariantId = `${nextAssistantId}:v1`;
    state.requestId = requestId;
    noteOwnedRequest(requestId);
    armStall(requestId, source.imageDataUrl !== undefined);
    state.parser = createMemoizedJsonParser();
    try {
      await sendTranslateStart(
        buildStartArgs(source, { requestId, reuse, tone, context, thread: state.turns }),
      );
    } catch (e) {
      failDispatch(nextAssistantId, requestId, e);
    }
  }

  async function retryVariant(turn: Turn): Promise<void> {
    const failed = activeVariant(turn);
    if (failed === undefined) return;
    const retried = (turn.retries ?? 0) + 1;
    mutate(
      (turns) =>
        dropVariantPure(turns, turn.id, failed.id).map((t) =>
          t.id === turn.id && t.role === 'assistant' ? { ...t, retries: retried } : t,
        ),
      'none',
    );
    const seed = seedOf(failed);
    // A failed re-roll asks what a finished sibling already answered, and the cache would hand that answer back.
    const answered = (turn.variants ?? []).some(
      (v) => v.id !== failed.id && v.status === 'done' && sameRequest(seedOf(v), seed),
    );
    await dispatchVariant(turn.id, seed, answered);
  }

  /** The label only names a refine in the UI; every other seed field reaches the request. */
  function sameRequest(a: VariantSeed, b: VariantSeed): boolean {
    const wire = ({ refinementLabel: _label, ...rest }: VariantSeed): string =>
      JSON.stringify(rest);
    return wire(a) === wire(b);
  }

  /** The modifiers a variant ran with, so a re-run of it asks the same question. */
  function seedOf(v: Variant | undefined): VariantSeed {
    if (v === undefined) return {};
    const { refinementBody, refinementLabel, targetLang, sourceLang, task } = v;
    return {
      ...(refinementBody !== undefined ? { refinementBody } : {}),
      ...(refinementLabel !== undefined ? { refinementLabel } : {}),
      ...(targetLang !== undefined ? { targetLang } : {}),
      ...(sourceLang !== undefined ? { sourceLang } : {}),
      ...(task !== undefined ? { task } : {}),
    };
  }

  /** The user turn a variant of `turnId` replays, plus the dispatch it reuses. Null = nothing to replay. */
  function resolveVariantTarget(
    turnId: string,
  ): { assistant: Turn; userTurn: Turn; reuse: TurnDispatch } | null {
    const assistant = state.turns.find((t) => t.id === turnId);
    if (assistant?.role !== 'assistant' || !assistant.attachedToTurnId) return null;
    const userTurn = state.turns.find((t) => t.id === assistant.attachedToTurnId);
    if (userTurn?.role !== 'user') return null;
    const reuse = replayDispatch(userTurn);
    if (reuse === null) return null;
    return { assistant, userTurn, reuse };
  }

  /** The turn's own dispatch, else the panel-wide one: a restored thread has no lastDispatch, but its turns carry their own. */
  function replayDispatch(userTurn: Turn): TurnDispatch | null {
    // An image turn whose image is gone would send the placeholder as text, whatever dispatch it borrows.
    if (userTurn.content === IMAGE_TURN_PLACEHOLDER && userTurn.imageDataUrl === undefined) {
      return null;
    }
    return userTurn.dispatch ?? state.lastDispatch;
  }

  /** Appends a pending sibling variant carrying `seed` and replays the user turn with it. `freshAnswer` skips the router's cached answer. */
  async function dispatchVariant(
    turnId: string,
    seed: VariantSeed,
    freshAnswer = false,
  ): Promise<boolean> {
    if (state.inflightId !== null || ownedByBackground(turnId)) return false;
    const target = resolveVariantTarget(turnId);
    if (target === null) return false;
    const { assistant, userTurn, reuse } = target;
    const context = assistant.contextSent;
    const variantId = uuid();
    const requestId = uuid();
    mutate((turns) => addVariantPure(turns, turnId, { id: variantId, ...seed }), 'debounce');
    state.inflightId = turnId;
    state.inflightVariantId = variantId;
    // A variant targets an existing mid-history turn, so inflightId is that turn's id, not a new last turn.
    state.requestId = requestId;
    noteOwnedRequest(requestId);
    armStall(requestId, userTurn.imageDataUrl !== undefined);
    state.parser = createMemoizedJsonParser();
    // The user turn's captured tone wins, so a later picker change does not apply backwards.
    const tone = userTurn.tone ?? state.lastDispatch?.tone;
    try {
      // Deliberate: a variant re-answers this one exchange, with no earlier turns.
      await sendTranslateStart(
        buildStartArgs(userTurn, {
          requestId,
          reuse,
          seed,
          tone,
          context,
          thread: 'none',
          freshAnswer,
        }),
      );
    } catch (e) {
      failDispatch(turnId, requestId, e, variantId);
    }
    return true;
  }

  async function refine(args: {
    turnId: string;
    refinementBody: string;
    refinementLabel?: string;
  }): Promise<boolean> {
    const { turnId, refinementBody, refinementLabel } = args;
    // A refine re-runs the version on screen: its task and languages, with this refinement in place of its own.
    const shown = state.turns.find((t) => t.id === turnId);
    const {
      refinementBody: _body,
      refinementLabel: _label,
      ...base
    } = seedOf(shown ? activeVariant(shown) : undefined);
    return dispatchVariant(turnId, {
      ...base,
      refinementBody,
      ...(refinementLabel !== undefined ? { refinementLabel } : {}),
    });
  }

  /** The source a swap replays: the dispatch's own, or the language the model reported for an 'auto' send. */
  function swapSource(target: {
    assistant: Turn;
    userTurn: Turn;
    reuse: TurnDispatch;
  }): LangSelection | null {
    // An image has no source text to read, so a swap would re-run the vision pass into its own language.
    if (target.userTurn.imageDataUrl !== undefined) return null;
    if (target.reuse.sourceLang !== 'auto') return target.reuse.sourceLang;
    // A swap variant was told its source, and the model's string reaches the wire: read a plain reply that named a known code.
    const detected =
      target.assistant.variants?.find(
        (v) =>
          v.sourceLang === undefined && v.detectedLang !== undefined && isIsoCode(v.detectedLang),
      )?.detectedLang ?? target.assistant.detectedLang;
    return detected !== undefined && isIsoCode(detected) ? asLangSelection(detected) : null;
  }

  /** The swap item reads this, so an enabled item always has a swap to run, and its label names that run. */
  function swapPair(turnId: string): SwapPair | null {
    if (state.inflightId !== null || ownedByBackground(turnId)) return null;
    const target = resolveVariantTarget(turnId);
    const source = target === null ? null : swapSource(target);
    if (target === null || source === null) return null;
    const pair: SwapPair = { sourceLang: target.reuse.targetLang, targetLang: source };
    if (pair.sourceLang === pair.targetLang) return { ...pair, blocked: 'same-language' };
    // Any plain swap with a reply counts, not just the shown one; an empty "No reply came back" answered nothing.
    const answered = (target.assistant.variants ?? []).some(
      (v) =>
        v.status === 'done' &&
        (v.content.trim() !== '' || Boolean(v.explain)) &&
        v.refinementBody === undefined &&
        v.task === undefined &&
        v.sourceLang === pair.sourceLang &&
        v.targetLang === pair.targetLang,
    );
    return answered ? { ...pair, blocked: 'answered' } : pair;
  }

  async function swapVariant(turnId: string): Promise<boolean> {
    const pair = swapPair(turnId);
    if (pair === null || pair.blocked !== undefined) return false;
    return dispatchVariant(turnId, { sourceLang: pair.sourceLang, targetLang: pair.targetLang });
  }

  async function taskVariant(turnId: string, task: TaskId): Promise<boolean> {
    // Another task for the version on screen keeps the languages it was answered in.
    const shown = state.turns.find((t) => t.id === turnId);
    const { targetLang, sourceLang } = seedOf(shown ? activeVariant(shown) : undefined);
    return dispatchVariant(turnId, {
      ...(targetLang !== undefined ? { targetLang } : {}),
      ...(sourceLang !== undefined ? { sourceLang } : {}),
      task,
    });
  }

  /** Request id of the language-change variant in flight, so a second pick replaces it instead of bailing. */
  let langChangeRequestId: string | null = null;
  /** A thread at the cap drops a turn on every save, so the notice fires once per loaded thread. */
  let trimNoticed = false;
  let shedNoticed = false;
  let refusedNoticed = false;
  /** Bumped whenever the thread in memory stops being the one a DeletedSlice was cut from. */
  let threadGen = 0;
  /** Set between the old thread's flush and the new one landing, so no save writes a half-switched
   *  state, and a write to the thread being loaded is still heard. */
  let loadingOrigin: string | null = null;
  /** Origins already reported as unreadable, so a tab switch does not repeat the warning. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read inside async load, never rendered.
  const unreadableWarned = new Set<string>();

  async function langVariant(assistantId: string, targetLang: LangSelection): Promise<boolean> {
    if (!state.turns.some((t) => t.id === assistantId && t.role === 'assistant')) return false;
    if (state.inflightId !== null) {
      if (state.requestId !== langChangeRequestId || state.inflightId !== assistantId) {
        // Same words the Refine menu uses, so both re-run paths explain the block identically.
        toastStore.push({ message: 'Wait for the current reply to finish.', variant: 'warning' });
        return false;
      }
      // The user changed their mind mid-stream: the half answer in the old language is noise, not a variant.
      const abandoned = state.inflightVariantId;
      cancel();
      if (abandoned !== null) {
        mutate((turns) => dropVariantPure(turns, assistantId, abandoned), 'none');
      }
    }
    const target = resolveVariantTarget(assistantId);
    if (target === null) return false;
    const original = target.reuse.targetLang;
    const active = activeVariant(target.assistant);
    // A language pick re-answers the variant the reader is looking at, refinement and task included.
    const carried = {
      ...(active?.refinementBody !== undefined ? { refinementBody: active.refinementBody } : {}),
      ...(active?.refinementLabel !== undefined ? { refinementLabel: active.refinementLabel } : {}),
      ...(active?.task !== undefined ? { task: active.task } : {}),
    };
    if (active?.status === 'done' && (active.targetLang ?? original) === targetLang) return false;
    const existing = variantIdxForTarget(target.assistant, original, targetLang, carried);
    if (existing >= 0) {
      selectVariant(assistantId, existing);
      return true;
    }
    const ok = await dispatchVariant(assistantId, { targetLang, ...carried });
    if (ok) langChangeRequestId = state.requestId;
    return ok;
  }

  function selectVariant(turnId: string, idx: number): void {
    mutate((turns) => selectVariantPure(turns, turnId, idx), 'now');
  }

  function lastUserTurn(): {
    id: string;
    content: string;
    kind: TurnKind;
    hasImage: boolean;
  } | null {
    const t = findEditableLastUserTurn(state.turns);
    return t ? { id: t.id, content: t.content, kind: t.kind, hasImage: isImageTurn(t) } : null;
  }

  function dropLastUserExchange(): void {
    mutate(dropLastUserExchangePure, 'now');
  }

  function deleteTurn(turnId: string): DeletedSlice | null {
    // Collect the ids to remove before state.turns is replaced.
    const target = state.turns.find((t) => t.id === turnId);
    if (!target) return null;
    const willRemove: string[] = [turnId];
    if (target.role === 'user') {
      for (const t of state.turns) {
        if (t.attachedToTurnId === turnId) willRemove.push(t.id);
      }
    } else if (target.attachedToTurnId) {
      willRemove.push(target.attachedToTurnId);
    }
    if (state.inflightId !== null && willRemove.includes(state.inflightId)) cancel();
    stopBackgroundFor(willRemove);
    const before = state.turns;
    const index = before.findIndex((t) => willRemove.includes(t.id));
    const removed = ($state.snapshot(before) as Turn[]).filter((t) => willRemove.includes(t.id));
    mutate((turns) => deleteTurnPair(turns, turnId), 'now');
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain snapshot of stamps, never rendered.
    const stamps = new Map<string, number>();
    for (const id of willRemove) {
      const at = deletedAt.get(id);
      if (at !== undefined) stamps.set(id, at);
    }
    return {
      removed,
      index: index < 0 ? state.turns.length : index,
      origin: state.activeId,
      gen: threadGen,
      deletedAt: stamps,
    };
  }

  /** Puts a deleted slice back where it was; the ids leave the tombstone list with it. */
  function restoreTurns(slice: DeletedSlice): boolean {
    if (slice.removed.length === 0 || slice.origin !== state.activeId) return false;
    if (slice.gen !== threadGen) return false;
    noteRevived(slice.removed, slice.deletedAt);
    const at = Math.min(Math.max(slice.index, 0), state.turns.length);
    noteKnownTurns(slice.removed);
    mutate((turns) => [...turns.slice(0, at), ...slice.removed, ...turns.slice(at)], 'now');
    return true;
  }

  function toggleBookmark(turnId: string): void {
    mutate((turns) => toggleBookmarkPure(turns, turnId), 'now');
  }

  async function regenerateVariant(turnId: string): Promise<boolean> {
    // A stored turn the byte cap shrank gets its v1 back at load (conversation-store), so no rebuild here.
    const turn = state.turns.find((t) => t.id === turnId);
    // Re-rolls the answer on screen: a swap, a language change, a task or a refine runs as itself again.
    // The same request has a cached answer (the one on screen), so without freshAnswer the router hands it back unchanged.
    return dispatchVariant(turnId, seedOf(turn ? activeVariant(turn) : undefined), true);
  }

  function editFrom(userTurnId: string): string | null {
    const userTurn = state.turns.find((t) => t.id === userTurnId);
    if (userTurn?.role !== 'user') return null;
    // Cancel if the inflight turn is at or after the truncation point.
    if (state.inflightId !== null) {
      const inflightIdx = state.turns.findIndex((t) => t.id === state.inflightId);
      const truncateIdx = state.turns.findIndex((t) => t.id === userTurnId);
      if (inflightIdx >= truncateIdx) cancel();
    }
    const text = userTurn.content;
    const at = state.turns.findIndex((t) => t.id === userTurnId);
    stopBackgroundFor(state.turns.slice(at).map((t) => t.id));
    mutate((turns) => truncateFrom(turns, userTurnId), 'now');
    return text;
  }

  function seedExternalImageTurn(
    requestId: string,
    imageUrl: string,
    dispatch?: TurnDispatch,
    task: ImageTask = 'translate',
  ): void {
    // The worker both broadcasts and queues a seed, so a panel mounting mid-stream hears it twice.
    if (ownedRequests.has(requestId)) return;
    // Taking the inflight slot without closing a running stream would leave that turn streaming forever.
    cancel();
    const userId = uuid();
    const assistantId = uuid();
    const safeImg = safeImageSrc(imageUrl);
    // Explain-with-image carries the image under kind 'explain'; only the OCR arm is 'image-translate'.
    const kind: TurnKind = task === 'explain' ? 'explain' : 'image-translate';
    const userTurns = addUserTurnPure(state.turns, {
      id: userId,
      kind,
      content: IMAGE_TURN_PLACEHOLDER,
      ...(safeImg ? { imageDataUrl: safeImg } : {}),
      // No safe image means nothing to replay, so a Retry would send the bare "[image]" marker.
      ...(safeImg && dispatch ? { dispatch } : {}),
    });
    mutate(
      () =>
        addAssistantTurn(userTurns, {
          id: assistantId,
          kind,
          attachedToTurnId: userId,
        }),
      'debounce',
    );
    state.inflightId = assistantId;
    state.inflightVariantId = `${assistantId}:v1`;
    state.requestId = requestId;
    noteOwnedRequest(requestId);
    armStall(requestId, true);
    state.parser = createMemoizedJsonParser();
    // The turn's own dispatch record is what lets Retry re-run the OCR; lastDispatch stays null
    // because it is panel-wide and would make an unrelated text turn look retryable.
    state.lastDispatch = null;
    const held = heldChunks.get(requestId) ?? [];
    heldChunks.delete(requestId);
    for (const c of held) applyChunk(c);
  }

  function seedDeliveredTurn(input: {
    kind: TurnKind;
    sourceText: string;
    response: string;
    imageDataUrl?: string;
    imageDropped?: boolean;
    sourceLang: LangSelection;
    targetLang: LangSelection;
    stream: boolean;
    tone?: Tone;
    taskId?: TaskId;
    trimmedTo?: number;
  }): void {
    // A delivered pair is terminal and takes no slot, so a stream already running keeps streaming.
    const userId = uuid();
    const assistantId = uuid();
    const safeImg = safeImageSrc(input.imageDataUrl);
    // An image the panel refused or never got cannot be re-read, so the turn records no dispatch and Retry stays hidden.
    const replayable =
      input.imageDropped !== true && (input.imageDataUrl === undefined || safeImg !== undefined);
    const userTurns = addUserTurnPure(state.turns, {
      id: userId,
      kind: input.kind,
      content: input.sourceText,
      ...(replayable
        ? {
            dispatch: {
              sourceLang: input.sourceLang,
              targetLang: input.targetLang,
              stream: input.stream,
            },
          }
        : {}),
      ...(safeImg ? { imageDataUrl: safeImg } : {}),
      ...(input.tone ? { tone: input.tone } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.trimmedTo !== undefined ? { trimmedTo: input.trimmedTo } : {}),
    });
    // A delivered pair had no dispatch of our own, so nothing panel-wide should claim to replay it.
    state.lastDispatch =
      input.imageDataUrl || input.imageDropped
        ? null
        : {
            content: input.sourceText,
            kind: input.kind,
            sourceLang: input.sourceLang,
            targetLang: input.targetLang,
            stream: input.stream,
            ...(input.tone ? { tone: input.tone } : {}),
          };
    // Saved at once: the pair is already final, and nothing follows to mark the thread dirty.
    mutate(
      () =>
        addDeliveredAssistantTurn(userTurns, {
          id: assistantId,
          kind: input.kind,
          attachedToTurnId: userId,
          content: input.response,
          ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
        }),
      'now',
    );
  }

  const PERSIST_DEBOUNCE_MS = 400;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function snapshotTurns(): Turn[] {
    return $state.snapshot(state.turns) as Turn[];
  }

  function cancelPendingPersist(): void {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
  }

  /** Ids removed here since this thread loaded, stamped with when. The store keeps them as
   *  tombstones, so a second window holding the same turn cannot write it back. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const deletedAt = new Map<string, number>();
  /** Undone deletes, each stamped with the burial it answers. Only the tombstone carrying
   *  that stamp goes, so one Undo cannot clear another window's delete. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const revivedAt = new Map<string, number>();

  function capSet(s: {
    size: number;
    delete: (k: string) => boolean;
    keys: () => Iterable<string>;
  }): void {
    if (s.size <= DELETED_ID_CAP) return;
    const oldest = [...s.keys()][0];
    if (oldest !== undefined) s.delete(oldest);
  }

  /** Records this window's own removals, so another window cannot write the turns back. */
  function noteRemoved(ids: readonly string[]): void {
    for (const id of ids) {
      revivedAt.delete(id);
      deletedAt.set(id, Date.now());
      capSet(deletedAt);
    }
  }

  function noteDeleted(before: readonly Turn[], after: readonly Turn[]): void {
    if (after.length >= before.length) return;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const kept = new Set(after.map((t) => t.id));
    noteRemoved(before.filter((t) => !kept.has(t.id)).map((t) => t.id));
  }

  type Persist = 'now' | 'debounce' | 'none';

  /** The one way this window's own actions change `state.turns`: every shrink records its
   *  tombstones, and the save is named at the site, not remembered. */
  function mutate(next: (turns: Turn[]) => Turn[], persist: Persist): void {
    const before = state.turns;
    const after = next(before);
    state.turns = after;
    noteDeleted(before, after);
    if (persist === 'now') saveNow();
    else if (persist === 'debounce') markDirty();
  }

  function noteRevived(turns: readonly Turn[], stamps: ReadonlyMap<string, number>): void {
    for (const t of turns) {
      deletedAt.delete(t.id);
      const at = stamps.get(t.id);
      if (at === undefined) continue;
      revivedAt.set(t.id, at);
      capSet(revivedAt);
    }
  }

  async function persist(target: string): Promise<void> {
    if (loadingOrigin !== null) return;
    const snap = snapshotTurns();
    // An empty thread with no tombstones has nothing to record, and writing it re-creates the row a purge just removed.
    if (snap.length === 0 && deletedAt.size === 0) {
      state.saveFailed = false;
      return;
    }
    noteKnownTurns(snap);
    // Copies: a load that clears the live sets while this write waits for the lock must not empty its tombstones.
    /* eslint-disable svelte/prefer-svelte-reactivity -- plain snapshots handed to storage, never rendered. */
    const { evicted, droppedTurns, shedImages, refusedIds } = await saveThread(target, snap, {
      knownIds: new Set(knownIds),
      deletedAt: new Map(deletedAt),
      revivedAt: new Map(revivedAt),
      writer,
      ...(seenClearedAt !== undefined ? { seenClearedAt } : {}),
    });
    /* eslint-enable svelte/prefer-svelte-reactivity */
    state.saveFailed = false;
    // Storage holds the text-only thread now; the panel must show the same, or the next save sheds again.
    if (shedImages === true && target === state.activeId) {
      mutate((turns) => turns.map((t) => stripImage(t, IMAGE_SHED_NOTE)), 'none');
      if (!shedNoticed) {
        shedNoticed = true;
        toastStore.push({
          message:
            'Storage is nearly full. Images were removed from this conversation to keep the text.',
          variant: 'warning',
        });
      }
    }
    if (refusedIds !== undefined && target === state.activeId) {
      // Buried by another window. Dropping the ids from knownIds lets that window bring them back.
      state.turns = state.turns.filter((t) => !refusedIds.includes(t.id));
      for (const id of refusedIds) knownIds.delete(id);
      if (state.inflightId !== null && refusedIds.includes(state.inflightId)) cancel();
      if (!refusedNoticed) {
        refusedNoticed = true;
        toastStore.push({
          message: `Another window changed this conversation. ${
            refusedIds.length === 1 ? 'One message was' : `${refusedIds.length} messages were`
          } removed here to match.`,
          variant: 'warning',
        });
      }
    }
    if (evicted !== undefined)
      toastStore.push({ message: evictedMessage(evicted), variant: 'warning' });
    if (droppedTurns !== undefined && !trimNoticed) {
      trimNoticed = true;
      toastStore.push({
        message: `${droppedTurns} older message${droppedTurns === 1 ? ' was' : 's were'} removed to save space.`,
        variant: 'warning',
      });
    }
  }

  function reportSaveFailure(e: unknown, where: string): void {
    noteSaveFailed(e);
    debugCatch(e, where);
  }

  /** Warns on the first failure only — a save retries every few keystrokes. */
  /** The panel's save-failed banner is the one notice for this (spec §7); a toast beside it said it twice. */
  function noteSaveFailed(e: unknown): void {
    state.saveFailedQuota = isQuotaError(e);
    state.saveFailed = true;
  }

  function markDirty(): void {
    cancelPendingPersist();
    const target = state.activeId;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      // The thread switched while this timer waited, so `state.turns` is another site's now.
      if (target !== state.activeId) return;
      void persist(target).catch((e: unknown) => reportSaveFailure(e, 'conversation.markDirty'));
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Bookmark, delete and variant pick skip the debounce — the pagehide flush is too slow to be the fallback. */
  function saveNow(): void {
    cancelPendingPersist();
    const target = state.activeId;
    void persist(target).catch((e: unknown) => reportSaveFailure(e, 'conversation.saveNow'));
  }

  async function flush(): Promise<void> {
    cancelPendingPersist();
    try {
      await persist(state.activeId);
    } catch (e) {
      noteSaveFailed(e);
      throw e;
    }
  }

  /** True once a thread has loaded, so a follower event for the same site never reloads over an empty new conversation. */
  let loadedOnce = false;

  async function followSite(site: string): Promise<boolean> {
    state.tabSite = site;
    return switchLock(async () => {
      if (loadedOnce && siteOf(state.activeId) === site) return false;
      let id: string | null = null;
      try {
        id = currentConversation((await readIndex()).threads, site, pendingDeleteIds());
      } catch (e) {
        debugCatch(e, 'conversation.followSite');
      }
      // The tab moved on while the index was read; the newer event decides.
      if (state.tabSite !== site) return false;
      // Before the first load the thread in memory is already this site's draft, and a send may be running in it.
      const fresh =
        !loadedOnce && siteOf(state.activeId) === site ? state.activeId : newConversationId(site);
      return switchTo(id ?? fresh);
    });
  }

  async function openConversation(id: string): Promise<boolean> {
    // Opened from the list, it would become the next save's target and lose what a newer build stored.
    const opened = await switchLock(() => switchTo(id, { refuseUnreadable: true }));
    if (opened) {
      markConversationOpened(id).catch((e: unknown) => debugCatch(e, 'conversation.opened'));
    }
    return opened;
  }

  async function startNewConversation(): Promise<string> {
    const previous = state.activeId;
    await switchLock(() => switchTo(newConversationId(state.tabSite)));
    return previous;
  }

  async function deleteConversation(
    id: string,
    onFail?: () => void,
  ): Promise<{ undo: () => void }> {
    const handle = scheduleConversationDelete([id], onFail ? { onFail } : {});
    if (id === state.activeId) await startNewConversation();
    return handle;
  }

  /** Saves the thread being left; a failed save must not strand the panel, saveFailed carries it. */
  async function flushForSwitch(): Promise<void> {
    try {
      await flush(); // persist the OLD origin, cancellation included
    } catch (e) {
      debugCatch(e, 'conversation.switchTo');
    }
  }

  /** False only with `refuseUnreadable`, when the thread could not be read: nothing on screen changed. */
  async function switchTo(
    origin: string,
    opts: { refuseUnreadable?: boolean } = {},
  ): Promise<boolean> {
    {
      // The tab follower re-fires the same origin; reloading would clobber turns not yet flushed.
      if (origin === state.activeId && state.turns.length > 0) return true;
      // Snapshot ids before any await: a seed message can append turns while flush or loadThreadResult run.
      const preLoadIds = state.turns.map((t) => t.id);
      let read: LoadThreadResult | undefined;
      if (opts.refuseUnreadable === true) {
        // Read before anything moves, so a refused thread leaves the reply that is still arriving on screen.
        await flushForSwitch();
        // A save inside the read would race the load, as it would inside loadThreadInto.
        loadingOrigin = origin;
        read = await loadThreadResult(origin).finally(() => {
          loadingOrigin = null;
        });
        if (read.unreadable) return false;
        // A seed that came during the read owns the slot now, and the load carries it over.
        if (state.inflightId !== null && preLoadIds.includes(state.inflightId)) moveToBackground();
      } else {
        // The running reply belongs to the thread it was sent from, so it finishes there.
        if (state.inflightId !== null) moveToBackground();
        await flushForSwitch();
      }
      if (state.activeId !== origin) {
        // A successful flush clears saveFailed, so this only fires when the turns really were dropped.
        if (state.saveFailed && state.turns.length > 0) {
          toastStore.push({
            message: `Not saved — the messages for ${siteLabel(state.activeId)} were not kept.`,
            variant: 'warning',
          });
        }
      }
      cancelPendingPersist();
      loadingOrigin = origin;
      return await loadThreadInto(origin, preLoadIds, read).finally(() => {
        loadingOrigin = null;
      });
    }
  }

  /** Stamps every reply saved mid-stream, except the ones still finishing in the background. */
  function interruptUnowned(turns: readonly Turn[], origin: string): Turn[] {
    /* eslint-disable svelte/prefer-svelte-reactivity -- plain arguments, never rendered. */
    const finishing = new Set(
      [...background.values()].filter((r) => r.origin === origin).map((r) => r.variantId),
    );
    if (finishing.size === 0) return interruptPendingTurns(turns);
    const stale = new Set(turns.flatMap(openVariantIds).filter((id) => !finishing.has(id)));
    /* eslint-enable svelte/prefer-svelte-reactivity */
    return interruptPendingTurns(turns, { variantIds: stale });
  }

  /** Loads the origin's thread over the one in memory, keeping a turn seeded during the load. */
  async function loadThreadInto(
    origin: string,
    preLoadIds: readonly string[],
    read?: LoadThreadResult,
  ): Promise<boolean> {
    {
      const { turns: raw, unreadable, clearedAt } = read ?? (await loadThreadResult(origin));
      seenClearedAt = clearedAt;
      if (unreadable && !unreadableWarned.has(origin)) {
        unreadableWarned.add(origin);
        toastStore.push({
          message:
            'The saved conversation for this site could not be read. Sending a new message replaces it.',
          variant: 'danger',
        });
      }
      // Keep only turns appended during the await that the loaded thread does not already hold.
      const loadedIds = raw.map((t) => t.id);
      const seededDuringLoad = state.turns.filter(
        (t) => !preLoadIds.includes(t.id) && !loadedIds.includes(t.id),
      );
      // Mirror the store's cap; interruptPendingTurns turns mid-stream turns into retryable errors,
      // except a reply this panel still finishes in the background.
      const trimmed =
        raw.length > MAX_TURNS_PER_THREAD
          ? dropOrphanHead(raw.slice(-MAX_TURNS_PER_THREAD), raw)
          : raw;
      // One step: a save landing between these two lines writes this thread's turns under the other origin's key.
      const originChanged = state.activeId !== origin;
      state.activeId = origin;
      loadedOnce = true;
      cancelPendingPersist();
      // A seed appended mid-load is in memory only, so the load itself schedules its save.
      mutate(
        () => [...interruptUnowned(trimmed, origin), ...seededDuringLoad],
        seededDuringLoad.length > 0 ? 'debounce' : 'none',
      );
      // A same-site reload keeps the thread a DeletedSlice came from, so its Undo still applies.
      if (originChanged) threadGen++;
      trimNoticed = false;
      refusedNoticed = false;
      knownIds.clear();
      noteKnownTurns(state.turns);
      // Tombstones belong to the thread that recorded them.
      deletedAt.clear();
      revivedAt.clear();
      // A seed appended mid-load owns inflightId/requestId — keep them so its chunks still route.
      if (seededDuringLoad.length === 0) {
        clearStall();
        state.inflightId = null;
        state.inflightVariantId = null;
        state.requestId = null;
      } else {
        // A seed survived the merge — leave inflightId/requestId pointing at it.
      }
      // A delivered seed takes no slot, so the reply can come back beside it.
      reattachBackground(origin);
      state.lastDispatch = null;
      watchAdoptedAnswers();
      return true;
    }
  }

  /** Another window's thread, applied whole. Nothing here is this window's delete intent, so no
   *  tombstone is recorded; only cancelling a buried in-flight turn saves, through cancel(). */
  function adoptStoredThread(stored: StoredThreadView): void {
    const { turns, buriedIds } = mergeStoredThread(state.turns, stored, {
      inflightId: state.inflightId,
      knownIds,
      deletedAt,
      revivedAt,
      ...(seenClearedAt !== undefined ? { seenClearedAt } : {}),
    });
    state.turns = turns;
    seenClearedAt = stored.clearedAt;
    // Their removal, so their Undo must be able to bring the turn back through the foreign path.
    for (const id of buriedIds) knownIds.delete(id);
    const inflightBuried = state.inflightId !== null && buriedIds.includes(state.inflightId);
    noteKnownTurns(state.turns);
    if (inflightBuried) cancel();
    watchAdoptedAnswers();
  }

  /** Variants another window is answering, to the moment this window stops waiting for them. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by a timer, never rendered.
  let adoptedOpen = new Map<string, number>();
  let adoptedTimer: ReturnType<typeof setTimeout> | null = null;

  /** The router ends a request within two reply budgets (one waiting on a duplicate's leader, one
   *  of its own), so an answer still open past that lost its window. */
  function watchAdoptedAnswers(): void {
    const now = Date.now();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by a timer, never rendered.
    const next = new Map<string, number>();
    const withImage = imageBackedTurnIds(state.turns);
    for (const t of state.turns) {
      for (const id of openVariantIds(t)) {
        if (id === state.inflightVariantId) continue;
        next.set(id, adoptedOpen.get(id) ?? now + 2 * budgetMs(withImage.has(t.id)));
      }
    }
    adoptedOpen = next;
    if (adoptedTimer !== null) clearTimeout(adoptedTimer);
    adoptedTimer = null;
    if (next.size === 0) return;
    const first = Math.min(...next.values());
    adoptedTimer = setTimeout(expireAdoptedAnswers, Math.max(0, first - now));
  }

  function expireAdoptedAnswers(): void {
    adoptedTimer = null;
    const now = Date.now();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain argument, never rendered.
    const expired = new Set(
      [...adoptedOpen]
        .filter(([id, at]) => at <= now && id !== state.inflightVariantId)
        .map(([id]) => id),
    );
    if (expired.size > 0) {
      mutate(
        (turns) =>
          interruptPendingTurns(turns, { variantIds: expired, message: ADOPTED_STALL_MESSAGE }),
        'none',
      );
    }
    watchAdoptedAnswers();
  }

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>): void {
    // Mid-load the read may predate this write, so the write is applied once the load lands.
    const origin = loadingOrigin ?? state.activeId;
    const change = changes[threadKey(origin)];
    if (change === undefined) return;
    const stored = parseThreadChange(change.newValue, writer);
    if (stored === null) return;
    // Behind the switch lock: a load in progress replaces the whole thread, and this merge must not land under it.
    void switchLock(() => {
      if (state.activeId !== origin) return Promise.resolve();
      adoptStoredThread(stored);
      return Promise.resolve();
    });
  }

  /** No save is scheduled here on purpose: storage must stay empty. */
  function resetAfterPurge(): void {
    threadGen++;
    stopBackground();
    cancelPendingPersist();
    clearStall();
    if (state.requestId) sendTranslateCancel(state.requestId);
    mutate(() => [], 'none');
    state.inflightId = null;
    state.inflightVariantId = null;
    state.requestId = null;
    state.lastDispatch = null;
    state.saveFailed = false;
    knownIds.clear();
    deletedAt.clear();
    revivedAt.clear();
    watchAdoptedAnswers();
  }

  return {
    get turns() {
      return state.turns;
    },
    get inflightId() {
      return state.inflightId;
    },
    get saveFailed() {
      return state.saveFailed;
    },
    get saveFailedQuota() {
      return state.saveFailedQuota;
    },
    get activeId() {
      return state.activeId;
    },
    get activeSite() {
      return siteOf(state.activeId);
    },
    get tabSite() {
      return state.tabSite;
    },
    ownsRequest: (requestId) =>
      requestId !== undefined && (ownedRequests.has(requestId) || heldChunks.has(requestId)),
    holdRequest: (requestId) => {
      if (!ownedRequests.has(requestId) && !heldChunks.has(requestId))
        heldChunks.set(requestId, []);
    },
    send,
    applyChunk,
    cancel,
    retry,
    refine,
    swapPair,
    swapVariant,
    taskVariant,
    langVariant,
    selectVariant,
    lastUserTurn,
    dropLastUserExchange,
    deleteTurn,
    restoreTurns,
    toggleBookmark,
    regenerateVariant,
    editFrom,
    seedExternalImageTurn,
    seedDeliveredTurn,
    followSite,
    openConversation,
    startNewConversation,
    deleteConversation,
    flush,
    resetAfterPurge,
    onStorageChanged,
    stopBackground,
  };
}
