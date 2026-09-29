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
  findRetryTarget,
  dropLastUserExchange as dropLastUserExchangePure,
  interruptPendingTurns,
  isCancelledError,
  replaceAssistantTurn,
  selectVariant as selectVariantPure,
  toggleBookmark as toggleBookmarkPure,
  truncateFrom,
  variantIdxForTarget,
  type Turn,
  type TurnDispatch,
  type TurnKind,
  type VariantSeed,
} from './conversation';
import { assemblePromptHistory, CHAT_HISTORY_TOKEN_BUDGET } from '@/shared/chat-history';
import {
  loadThreadResult,
  mergeStoredThread,
  parseThreadChange,
  saveThread,
  stripImage,
  threadKey,
  GENERAL_ORIGIN,
  IMAGE_SHED_NOTE,
  MAX_TURNS_PER_THREAD,
  isQuotaError,
  type StoredThreadView,
} from './conversation-store';
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
import type { Task, Tone } from '@/shared/task-prompts';

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
  /** True when this sidepanel dispatched `requestId`. False for undefined or foreign ids. */
  ownsRequest: (requestId: string | undefined) => boolean;
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
  /** True when `swapVariant(turnId)` would dispatch. Drives the ↔ button's enabled state. */
  canSwap: (turnId: string) => boolean;
  /** Re-dispatch with source and target langs swapped. False whenever `canSwap` is false. */
  swapVariant: (turnId: string) => Promise<boolean>;
  /** Re-dispatch the turn with a different task. False when inflight or unresolvable. */
  taskVariant: (turnId: string, task: Task) => Promise<boolean>;
  /** Answer the last exchange in `targetLang`: flips to a done variant already in that language,
   *  else dispatches one. A second pick replaces its own still-streaming variant. False when nothing changed. */
  langVariant: (targetLang: LangSelection) => Promise<boolean>;
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
  /** Switch the persisted thread to `origin`: save current, load new. */
  setActiveOrigin: (origin: string) => Promise<void>;
  /** Force-flush any pending debounced persistence. */
  flush: () => Promise<void>;
  /** True while the last save failed, so the panel can warn that turns are no longer kept. */
  readonly saveFailed: boolean;
  /** True when the last failure was a storage-quota rejection, so the panel can name the lever. */
  readonly saveFailedQuota: boolean;
  /** Origin of the thread currently loaded — names the export file. */
  readonly activeOrigin: string;
  /** New-conversation: empty the thread in memory and on disk, tombstones included. */
  clearActiveThread: () => Promise<void>;
  /** Storage was wiped elsewhere: drop the thread from memory without writing it back. */
  resetAfterPurge: () => void;
  /** Another window wrote the active thread: merge its turns in. Own writes and other origins are ignored. */
  onStorageChanged: (changes: Record<string, chrome.storage.StorageChange>) => void;
  /** Seed a turn pair for a context-menu image translate: unseeded, its chunks match no turn id and are dropped. */
  seedExternalImageTurn: (
    requestId: string,
    imageUrl: string,
    dispatch?: TurnDispatch,
    task?: 'translate' | 'explain',
  ) => void;
  /** Land a tooltip payload as a completed exchange — no dispatch. */
  seedDeliveredTurn: (input: {
    kind: TurnKind;
    sourceText: string;
    response: string;
    imageDataUrl?: string;
    sourceLang: LangSelection;
    targetLang: LangSelection;
    stream: boolean;
    tone?: Tone;
  }) => void;
}

/** What a toast calls the thread that was dropped. */
function siteLabel(origin: string): string {
  return origin === GENERAL_ORIGIN ? 'other pages' : origin.replace(/^https?:\/\//, '');
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

export function createConversation(opts: ConversationOptions = {}): ConversationContainer {
  const initial = emptyConversation();
  const switchLock = makeAsyncLock();
  /** Stamped on every save, so this panel's own `onChanged` echo is told apart from another window's write. */
  const writer = uuid();
  // Ids this panel loaded or created; saveThread keeps stored turns outside this set (another window wrote them).
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const knownIds = new Set<string>();
  function noteKnownTurns(turns: readonly Turn[]): void {
    for (const t of turns) knownIds.add(t.id);
  }
  // Read only from the toast callback, never in a derivation.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const ownedRequests = new Set<string>();
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
  function armStall(requestId: string, hasImage: boolean): void {
    stallMs =
      opts.stallMs?.(hasImage) ?? (hasImage ? imageStuckTimeoutMs(null) : stuckTimeoutMs(null));
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
    activeOrigin: GENERAL_ORIGIN as string,
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
    const history = assemblePromptHistory(state.turns, { budgetTokens: CHAT_HISTORY_TOKEN_BUDGET });
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
      dispatch,
      ...(safeImg ? { imageDataUrl: safeImg } : {}),
      ...(input.tone ? { tone: input.tone } : {}),
    });
    const userTurn = userTurns[userTurns.length - 1];
    if (userTurn === undefined) throw new Error('addUserTurn returned no turn');
    const withAssistant = addAssistantTurn(userTurns, {
      id: assistantId,
      kind: input.kind,
      attachedToTurnId: userId,
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
          history,
        }),
      );
    } catch (e) {
      failDispatch(assistantId, requestId, e);
    }
    return assistantId;
  }

  function applyChunk(c: TranslationChunk): void {
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
    if (state.inflightId !== null) {
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
        toastStore.push({
          message: `Wait ${Math.ceil((until - Date.now()) / 1000)}s before retrying.`,
          variant: 'warning',
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
    // The turn's own dispatch is enough; a restored thread has no panel-wide lastDispatch.
    const reuse = source.dispatch ?? state.lastDispatch;
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
    // Only the turns before the retried one: what comes after is not context for it.
    const at = state.turns.findIndex((t) => t.id === source.id);
    const history = assemblePromptHistory(at < 0 ? [] : state.turns.slice(0, at), {
      budgetTokens: CHAT_HISTORY_TOKEN_BUDGET,
    });
    try {
      await sendTranslateStart(
        buildStartArgs(source, { requestId, reuse, tone, context, history }),
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
          t.id === turn.id ? { ...t, retries: retried } : t,
        ),
      'none',
    );
    const { refinementBody, refinementLabel, targetLang, sourceLang, task } = failed;
    await dispatchVariant(turn.id, {
      ...(refinementBody !== undefined ? { refinementBody } : {}),
      ...(refinementLabel !== undefined ? { refinementLabel } : {}),
      ...(targetLang !== undefined ? { targetLang } : {}),
      ...(sourceLang !== undefined ? { sourceLang } : {}),
      ...(task !== undefined ? { task } : {}),
    });
  }

  /** The user turn a variant of `turnId` replays, plus the dispatch it reuses. Null = nothing to replay. */
  function resolveVariantTarget(
    turnId: string,
  ): { assistant: Turn; userTurn: Turn; reuse: TurnDispatch } | null {
    const assistant = state.turns.find((t) => t.id === turnId);
    if (assistant?.role !== 'assistant' || !assistant.attachedToTurnId) return null;
    const userTurn = state.turns.find((t) => t.id === assistant.attachedToTurnId);
    if (userTurn?.role !== 'user') return null;
    // Same fallback as retry(): a restored thread has no panel-wide lastDispatch,
    // but its turns carry their own — without this, Regenerate is a dead button.
    const reuse = userTurn.dispatch ?? state.lastDispatch;
    if (reuse === null) return null;
    return { assistant, userTurn, reuse };
  }

  /** Appends a pending sibling variant carrying `seed` and replays the user turn with it. */
  async function dispatchVariant(turnId: string, seed: VariantSeed): Promise<boolean> {
    if (state.inflightId !== null) return false;
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
      await sendTranslateStart(buildStartArgs(userTurn, { requestId, reuse, seed, tone, context }));
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
    return dispatchVariant(turnId, {
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
    const detected = target.assistant.detectedLang;
    // The model's string reaches the wire as targetLang, so only a code this build knows can pass.
    if (detected === undefined || detected === 'other' || detected === 'auto') return null;
    return isIsoCode(detected) ? asLangSelection(detected) : null;
  }

  /** The ↔ button reads this, so an enabled button always has a swap to run. */
  function canSwap(turnId: string): boolean {
    if (state.inflightId !== null) return false;
    const target = resolveVariantTarget(turnId);
    return target !== null && swapSource(target) !== null;
  }

  async function swapVariant(turnId: string): Promise<boolean> {
    if (state.inflightId !== null) return false;
    const target = resolveVariantTarget(turnId);
    if (target === null) return false;
    const source = swapSource(target);
    if (source === null) return false;
    return dispatchVariant(turnId, { targetLang: source, sourceLang: target.reuse.targetLang });
  }

  async function taskVariant(turnId: string, task: Task): Promise<boolean> {
    return dispatchVariant(turnId, { task });
  }

  /** Request id of the language-change variant in flight, so a second pick replaces it instead of bailing. */
  let langChangeRequestId: string | null = null;
  /** A thread at the cap drops a turn on every save, so the notice fires once per loaded thread. */
  let trimNoticed = false;
  let shedNoticed = false;
  let refusedNoticed = false;
  /** Bumped whenever the thread in memory stops being the one a DeletedSlice was cut from. */
  let threadGen = 0;
  /** True between the old thread's flush and the new one landing, so no save writes a half-switched state. */
  let switching = false;
  /** Origins already reported as unreadable, so a tab switch does not repeat the warning. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read inside async load, never rendered.
  const unreadableWarned = new Set<string>();

  async function langVariant(targetLang: LangSelection): Promise<boolean> {
    let assistantId: string | null = null;
    for (let i = state.turns.length - 1; i >= 0 && assistantId === null; i--) {
      const t = state.turns[i];
      if (t?.role === 'assistant') assistantId = t.id;
    }
    if (assistantId === null) return false;
    if (state.inflightId !== null) {
      if (state.requestId !== langChangeRequestId) {
        // Same words the refine chips use, so both re-run paths explain the block identically.
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
    return t
      ? { id: t.id, content: t.content, kind: t.kind, hasImage: t.imageDataUrl !== undefined }
      : null;
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
      origin: state.activeOrigin,
      gen: threadGen,
      deletedAt: stamps,
    };
  }

  /** Puts a deleted slice back where it was; the ids leave the tombstone list with it. */
  function restoreTurns(slice: DeletedSlice): boolean {
    if (slice.removed.length === 0 || slice.origin !== state.activeOrigin) return false;
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
    return dispatchVariant(turnId, {});
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
    mutate((turns) => truncateFrom(turns, userTurnId), 'now');
    return text;
  }

  function seedExternalImageTurn(
    requestId: string,
    imageUrl: string,
    dispatch?: TurnDispatch,
    task: 'translate' | 'explain' = 'translate',
  ): void {
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
  }

  function seedDeliveredTurn(input: {
    kind: TurnKind;
    sourceText: string;
    response: string;
    imageDataUrl?: string;
    sourceLang: LangSelection;
    targetLang: LangSelection;
    stream: boolean;
    tone?: Tone;
  }): void {
    // A delivered pair is terminal and takes no slot, so a stream already running keeps streaming.
    const userId = uuid();
    const assistantId = uuid();
    const safeImg = safeImageSrc(input.imageDataUrl);
    // An image the panel refused to keep cannot be re-read, so the turn records no dispatch and Retry stays hidden.
    const replayable = input.imageDataUrl === undefined || safeImg !== undefined;
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
    });
    // A delivered pair had no dispatch of our own, so nothing panel-wide should claim to replay it.
    state.lastDispatch = input.imageDataUrl
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
        }),
      'now',
    );
  }

  function clear(): void {
    threadGen++;
    clearStall();
    if (state.requestId) sendTranslateCancel(state.requestId);
    state.inflightId = null;
    state.inflightVariantId = null;
    state.requestId = null;
    state.lastDispatch = null;
    mutate(() => [], 'debounce');
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
    if (switching) return;
    const snap = snapshotTurns();
    // An empty thread with no tombstones has nothing to record, and writing it re-creates the row a purge just removed.
    if (snap.length === 0 && deletedAt.size === 0) {
      state.saveFailed = false;
      return;
    }
    noteKnownTurns(snap);
    // Copies: a load that clears the live sets while this write waits for the lock must not empty its tombstones.
    /* eslint-disable svelte/prefer-svelte-reactivity -- plain snapshots handed to storage, never rendered. */
    const { evictedOrigin, droppedTurns, shedImages, refusedIds } = await saveThread(target, snap, {
      knownIds: new Set(knownIds),
      deletedAt: new Map(deletedAt),
      revivedAt: new Map(revivedAt),
      writer,
    });
    /* eslint-enable svelte/prefer-svelte-reactivity */
    state.saveFailed = false;
    // Storage holds the text-only thread now; the panel must show the same, or the next save sheds again.
    if (shedImages === true && target === state.activeOrigin) {
      mutate((turns) => turns.map((t) => stripImage(t, IMAGE_SHED_NOTE)), 'none');
      if (!shedNoticed) {
        shedNoticed = true;
        toastStore.push({
          message:
            'Storage is nearly full. Images were removed from this conversation to keep the text.',
          variant: 'warning',
          duration: 8000,
        });
      }
    }
    if (refusedIds !== undefined && target === state.activeOrigin) {
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
          duration: 8000,
        });
      }
    }
    if (evictedOrigin !== undefined) {
      toastStore.push({
        message: `The saved conversation for ${siteLabel(evictedOrigin)} was removed to make room.`,
        variant: 'warning',
        duration: 8000,
      });
    }
    if (droppedTurns !== undefined && !trimNoticed) {
      trimNoticed = true;
      toastStore.push({
        message: `${droppedTurns} older message${droppedTurns === 1 ? ' was' : 's were'} removed to save space.`,
        variant: 'warning',
        duration: 8000,
      });
    }
  }

  function reportSaveFailure(e: unknown, where: string): void {
    noteSaveFailed(e);
    debugCatch(e, where);
  }

  /** Warns on the first failure only — a save retries every few keystrokes. */
  function noteSaveFailed(e: unknown): void {
    state.saveFailedQuota = isQuotaError(e);
    if (state.saveFailed) return;
    state.saveFailed = true;
    toastStore.push({
      message: isQuotaError(e)
        ? 'Storage is full. This conversation is no longer saved.'
        : 'This conversation could not be saved.',
      variant: 'danger',
      duration: 8000,
    });
  }

  function markDirty(): void {
    cancelPendingPersist();
    const target = state.activeOrigin;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      // The thread switched while this timer waited, so `state.turns` is another site's now.
      if (target !== state.activeOrigin) return;
      void persist(target).catch((e: unknown) => reportSaveFailure(e, 'conversation.markDirty'));
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Bookmark, delete and variant pick skip the debounce — the pagehide flush is too slow to be the fallback. */
  function saveNow(): void {
    cancelPendingPersist();
    const target = state.activeOrigin;
    void persist(target).catch((e: unknown) => reportSaveFailure(e, 'conversation.saveNow'));
  }

  async function flush(): Promise<void> {
    cancelPendingPersist();
    try {
      await persist(state.activeOrigin);
    } catch (e) {
      noteSaveFailed(e);
      throw e;
    }
  }

  async function setActiveOrigin(origin: string): Promise<void> {
    await switchLock(async () => {
      // The tab follower re-fires the same origin; reloading would clobber turns not yet flushed.
      if (origin === state.activeOrigin && state.turns.length > 0) return;
      // Snapshot ids before any await: a seed message can append turns while flush or loadThreadResult run.
      const preLoadIds = state.turns.map((t) => t.id);
      // The running stream's chunks reference an inflightId about to be replaced, so cancel it instead of orphaning it.
      if (state.inflightId !== null) cancel();
      // A rejected save must not strand the panel on the previous site's thread; saveFailed carries it.
      // A same-site reload flushes too: a delete still on the debounce would otherwise be read back from storage.
      try {
        await flush(); // persist the OLD origin, cancellation included
      } catch (e) {
        debugCatch(e, 'conversation.setActiveOrigin');
      }
      if (state.activeOrigin !== origin) {
        // A successful flush clears saveFailed, so this only fires when the turns really were dropped.
        if (state.saveFailed && state.turns.length > 0) {
          toastStore.push({
            message: `Not saved — the messages for ${siteLabel(state.activeOrigin)} were not kept.`,
            variant: 'warning',
            duration: 8000,
          });
        }
      }
      cancelPendingPersist();
      switching = true;
      await loadThreadInto(origin, preLoadIds).finally(() => {
        switching = false;
      });
    });
  }

  /** Loads the origin's thread over the one in memory, keeping a turn seeded during the load. */
  async function loadThreadInto(origin: string, preLoadIds: readonly string[]): Promise<void> {
    {
      const { turns: raw, unreadable } = await loadThreadResult(origin);
      if (unreadable && !unreadableWarned.has(origin)) {
        unreadableWarned.add(origin);
        toastStore.push({
          message:
            'The saved conversation for this site could not be read. Sending a new message replaces it.',
          variant: 'danger',
          duration: 8000,
        });
      }
      // Keep only turns appended during the await that the loaded thread does not already hold.
      const loadedIds = raw.map((t) => t.id);
      const seededDuringLoad = state.turns.filter(
        (t) => !preLoadIds.includes(t.id) && !loadedIds.includes(t.id),
      );
      // Mirror the store's cap; interruptPendingTurns turns mid-stream turns into retryable errors.
      const trimmed =
        raw.length > MAX_TURNS_PER_THREAD
          ? dropOrphanHead(raw.slice(-MAX_TURNS_PER_THREAD), raw)
          : raw;
      // One step: a save landing between these two lines writes this thread's turns under the other origin's key.
      const originChanged = state.activeOrigin !== origin;
      state.activeOrigin = origin;
      cancelPendingPersist();
      // A seed appended mid-load is in memory only, so the load itself schedules its save.
      mutate(
        () => [...interruptPendingTurns(trimmed), ...seededDuringLoad],
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
      state.lastDispatch = null;
    }
  }

  /** Another window's thread, applied whole. Nothing here is this window's delete intent, so
   *  no save is scheduled and no tombstone recorded: storage already holds both. */
  function adoptStoredThread(stored: StoredThreadView): void {
    const { turns, buriedIds } = mergeStoredThread(state.turns, stored, {
      inflightId: state.inflightId,
      knownIds,
      deletedAt,
      revivedAt,
    });
    state.turns = turns;
    // Their removal, so their Undo must be able to bring the turn back through the foreign path.
    for (const id of buriedIds) knownIds.delete(id);
    const inflightBuried = state.inflightId !== null && buriedIds.includes(state.inflightId);
    noteKnownTurns(state.turns);
    if (inflightBuried) cancel();
  }

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>): void {
    const origin = state.activeOrigin;
    const change = changes[threadKey(origin)];
    if (change === undefined || switching) return;
    const stored = parseThreadChange(change.newValue, writer);
    if (stored === null) return;
    // Behind the switch lock: a load in progress replaces the whole thread, and this merge must not land under it.
    void switchLock(() => {
      if (state.activeOrigin !== origin) return Promise.resolve();
      adoptStoredThread(stored);
      return Promise.resolve();
    });
  }

  /** No save is scheduled here on purpose: storage must stay empty. */
  function resetAfterPurge(): void {
    threadGen++;
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
  }

  async function clearActiveThread(): Promise<void> {
    await switchLock(async () => {
      const target = state.activeOrigin;
      clear(); // empties memory + schedules a debounced save of []
      cancelPendingPersist(); // the write below carries the tombstones a debounced one would race
      // Removing the key instead would drop the tombstones with it, and a second window's next save would write the thread back.
      await saveThread(target, [], { knownIds, deletedAt, revivedAt, writer });
      knownIds.clear();
      deletedAt.clear();
      revivedAt.clear();
    });
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
    get activeOrigin() {
      return state.activeOrigin;
    },
    ownsRequest: (requestId) => requestId !== undefined && ownedRequests.has(requestId),
    send,
    applyChunk,
    cancel,
    retry,
    refine,
    canSwap,
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
    setActiveOrigin,
    flush,
    clearActiveThread,
    resetAfterPurge,
    onStorageChanged,
  };
}
