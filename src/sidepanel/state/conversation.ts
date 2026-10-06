// Every helper returns a new turn list except `applyChunkPure`, which mutates to keep the per-delta render cost down.

import {
  extractDetectedFields,
  parseJsonResponse,
  streamingTranslation,
} from '@/shared/backends/base';
import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
import { ALL_TASKS, TASK_LABELS, type Tone } from '@/shared/task-prompts';
import { taskLabel, type TaskId, type TaskView } from '@/shared/task-view';
import {
  type DetectedVariety,
  type LangSelection,
  type PageContext,
  type ResultMeta,
  type TranslationChunk,
} from '@/shared/types';
import {
  assemblePromptHistory,
  CHAT_HISTORY_TOKEN_BUDGET,
  type ChatTurn,
} from '@/shared/chat-history';
import type { sendTranslateStart } from '@/shared/translate-ui';

/** The array is the declaration; `TurnKind` derives from it, so a new kind is a
 *  compile error at every exhaustive site instead of a silently dropped turn. */
export const ALL_TURN_KINDS = [
  'translate',
  'ask',
  'reword',
  'explain',
  'summarize',
  'grammar',
  'suggest-replies',
  'image-translate',
] as const;
export type TurnKind = (typeof ALL_TURN_KINDS)[number];

/** Turn badge and export heading. Derived from TASK_LABELS so a turn never names a task differently to the picker. */
export const TURN_KIND_LABEL: Record<TurnKind, string> = {
  ...TASK_LABELS,
  'image-translate': 'Translate image',
};

// User turns are always `idle`; a user cancel lands as `error` with code 'cancelled'.
type TurnStatus = 'idle' | 'pending' | 'streaming' | 'done' | 'error';

interface TurnError {
  /** A TranslationChunk code, or synthetic 'cancelled' / 'unknown' off-chunk. */
  code: string;
  message: string;
  /** Epoch ms until which Retry honors the server's Retry-After window. */
  retryUntil?: number;
  /** The backend that failed last, so the card can say which key or model to fix. */
  backendId?: string;
}

/** One response under an assistant Turn; refines append siblings. The active
 *  variant projects onto the Turn's top-level fields, which stay authoritative for reads. */
export interface Variant {
  id: string;
  status: TurnStatus;
  content: string;
  rawAcc?: string;
  detectedLang?: string;
  detectedDetail?: string;
  detectedLangs?: DetectedVariety[];
  confidence?: number;
  meta?: ResultMeta;
  explain?: string;
  error?: TurnError;
  /** Free-form refinement description for this variant (chip body or
   *  custom describe-your-change). Drives the "Refined: <body>" chip. */
  refinementBody?: string;
  /** The chip the user clicked, when a chip started this variant. A typed refinement has none. */
  refinementLabel?: string;
  /** Language this variant answers in when it differs from the user turn's
   *  dispatch — language-change and swap variants. Drives the "→ <lang>" chip. */
  targetLang?: LangSelection;
  /** Source the variant read from when it differs from the dispatch — swap variants. */
  sourceLang?: LangSelection;
  /** Task the variant ran when it differs from the turn's task — task variants. */
  task?: TaskId;
}

/** Language pair + streaming preference of a user turn; its page context lives
 *  on the paired assistant turn's `contextSent`. */
export interface TurnDispatch {
  sourceLang: LangSelection;
  targetLang: LangSelection;
  stream: boolean;
}

interface TurnBase {
  id: string;
  kind: TurnKind;
  /** User turn: user-authored input. Assistant turn: model output. */
  content: string;
  /** The task that ran, when it is not the kind: a custom task runs under kind `translate`. */
  taskId?: TaskId;
  /** User-flagged turn; drives the ★-only filter. */
  bookmarked?: boolean;
  /** Unix ms timestamp set at turn creation. */
  createdAt: number;
}

/** What the user sent. It never streams, so it carries none of an answer's fields. */
export interface UserTurnData extends TurnBase {
  role: 'user';
  /** User turns never stream. */
  status: 'idle';
  /** Image data URL — present on image-translate user turns. */
  imageDataUrl?: string;
  /** The turn was sent with an image that was later dropped to save space; its text may be a caption. */
  imageShed?: true;
  /** Tone at send time (reword only) — a later picker change must not retro-apply. */
  tone?: Tone;
  /** Params this user turn was dispatched with. Retry / regenerate on a
   *  mid-history turn replay these instead of the newest send's. */
  dispatch?: TurnDispatch;
  /** The text was cut to this many characters before it reached the panel. */
  trimmedTo?: number;
  rawAcc?: never;
  detectedLang?: never;
  detectedDetail?: never;
  detectedLangs?: never;
  confidence?: never;
  meta?: never;
  explain?: never;
  attachedToTurnId?: never;
  error?: never;
  retries?: never;
  contextSent?: never;
  variants?: never;
  activeVariantIdx?: never;
}

/** A model answer to the user turn it is attached to; its top-level fields mirror the active variant. */
export interface AssistantTurnData extends TurnBase {
  role: 'assistant';
  status: TurnStatus;
  /** Streaming accumulator — `streamingTranslation` re-derives `content` from it on every delta. */
  rawAcc?: string;
  /** Detected language id (preset id or 'other'). */
  detectedLang?: string;
  /** Free-form sub-variety label complement. */
  detectedDetail?: string;
  /** Multi-variety detection list. */
  detectedLangs?: DetectedVariety[];
  /** 0..1; null/undefined when not yet known. */
  confidence?: number;
  /** Inspector / perf metadata when capture is on. */
  meta?: ResultMeta;
  /** Optional Explain blurb returned alongside translation. */
  explain?: string;
  /** The user turn this answers. */
  attachedToTurnId?: string;
  /** Error payload — present iff `status === 'error'`. */
  error?: TurnError;
  /** Failed dispatches already made on this slot. Survives `replaceAssistantTurn`, so a repeat failure offers more than Retry. */
  retries?: number;
  /** null = context off or collection failed; undefined = the send recorded no context. */
  contextSent?: PageContext | null;
  /** Response history, seeded with v1; absent on turns the byte cap shrank (applyChunk skips those). */
  variants?: Variant[];
  /** Index into `variants` selecting which variant projects onto the
   *  Turn top-level body fields. Absent when `variants` is absent. */
  activeVariantIdx?: number;
  imageDataUrl?: never;
  imageShed?: never;
  tone?: never;
  dispatch?: never;
  trimmedTo?: never;
}

/** A turn in a thread, by role: a user turn cannot carry an answer's fields, nor an answer a user turn's. */
export type Turn = UserTurnData | AssistantTurnData;

/** Inflight tracker — empty list of turns means nothing in flight. */
export interface ConversationSnapshot {
  turns: Turn[];
  /** ID of the assistant turn currently streaming. null when idle. */
  inflightId: string | null;
}

export function emptyConversation(): ConversationSnapshot {
  return { turns: [], inflightId: null };
}

interface AddUserTurnInput {
  id: string;
  kind: TurnKind;
  content: string;
  imageDataUrl?: string;
  tone?: Tone;
  dispatch?: TurnDispatch;
  taskId?: TaskId;
  trimmedTo?: number;
}

/** Append a user turn. Returns the new turn list — caller assigns. */
export function addUserTurn(turns: readonly Turn[], input: AddUserTurnInput): Turn[] {
  const turn: Turn = {
    id: input.id,
    role: 'user',
    kind: input.kind,
    status: 'idle',
    content: input.content,
    createdAt: Date.now(),
    ...(input.imageDataUrl !== undefined ? { imageDataUrl: input.imageDataUrl } : {}),
    ...(input.tone !== undefined ? { tone: input.tone } : {}),
    ...(input.dispatch !== undefined ? { dispatch: input.dispatch } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.trimmedTo !== undefined ? { trimmedTo: input.trimmedTo } : {}),
  };
  return [...turns, turn];
}

interface AddAssistantTurnInput {
  id: string;
  kind: TurnKind;
  attachedToTurnId: string;
  /** Carried across a replace so the count is not reset by the retry it is counting. */
  retries?: number;
  contextSent?: PageContext | null;
  /** Seed variant id. When absent, defaults to `${input.id}:v1`. */
  variantId?: string;
  /** Explanation already produced elsewhere (tooltip Pin). Kept on the turn
   *  so a re-dispatch that returns no explain of its own does not lose it. */
  explain?: string;
  /** Answer this turn replaces (edit-last). Kept as a done variant so the
   *  variant rail can flip back to it. */
  preservedResponse?: string;
  taskId?: TaskId;
}

function pendingAssistantTurn(input: AddAssistantTurnInput): Turn {
  const prior: Variant[] =
    input.preservedResponse !== undefined
      ? [
          {
            id: `${input.id}:v0`,
            status: 'done',
            content: input.preservedResponse,
          },
        ]
      : [];
  const seed: Variant = {
    id: input.variantId ?? `${input.id}:v1`,
    status: 'pending',
    content: '',
    rawAcc: '',
    // The mirror deletes turn.explain whenever the variant has none, so a pinned explanation must ride along.
    ...(input.explain !== undefined ? { explain: input.explain } : {}),
  };
  return {
    id: input.id,
    role: 'assistant',
    kind: input.kind,
    status: 'pending',
    content: '',
    rawAcc: '',
    attachedToTurnId: input.attachedToTurnId,
    variants: [...prior, seed],
    activeVariantIdx: prior.length,
    createdAt: Date.now(),
    ...(input.contextSent !== undefined ? { contextSent: input.contextSent } : {}),
    ...(input.retries !== undefined ? { retries: input.retries } : {}),
    ...(input.explain !== undefined ? { explain: input.explain } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
  };
}

/** Append a pending assistant turn linked to a prior user turn. */
export function addAssistantTurn(turns: readonly Turn[], input: AddAssistantTurnInput): Turn[] {
  return [...turns, pendingAssistantTurn(input)];
}

/** Swap a fresh pending turn into the slot `oldId` holds, so a retry answers in place. */
export function replaceAssistantTurn(
  turns: readonly Turn[],
  oldId: string,
  input: AddAssistantTurnInput,
): Turn[] {
  const idx = turns.findIndex((t) => t.id === oldId);
  if (idx < 0) return addAssistantTurn(turns, input);
  const out = [...turns];
  out[idx] = pendingAssistantTurn(input);
  return out;
}

interface AddDeliveredAssistantTurnInput {
  id: string;
  kind: TurnKind;
  taskId?: TaskId;
  attachedToTurnId: string;
  /** Already-produced body (tooltip explanation / OCR result). */
  content: string;
}

/** Appends a done assistant turn whose body is already known. */
export function addDeliveredAssistantTurn(
  turns: readonly Turn[],
  input: AddDeliveredAssistantTurnInput,
): Turn[] {
  const variantId = `${input.id}:v1`;
  const seed: Variant = {
    id: variantId,
    status: 'done',
    content: input.content,
  };
  const turn: Turn = {
    id: input.id,
    role: 'assistant',
    kind: input.kind,
    status: 'done',
    content: input.content,
    attachedToTurnId: input.attachedToTurnId,
    variants: [seed],
    activeVariantIdx: 0,
    createdAt: Date.now(),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
  };
  return [...turns, turn];
}

interface AddVariantInput {
  /** Stable variant id — caller controls so chunk routing can match. */
  id: string;
  /** Refinement chip body or custom describe-your-change body. */
  refinementBody?: string;
  /** Chip name to show instead of the body — the user clicked "Shorter", not the instruction. */
  refinementLabel?: string;
  /** Language the variant answers in, when it is not the user turn's dispatch target. */
  targetLang?: LangSelection;
  sourceLang?: LangSelection;
  task?: TaskId;
}

/** Appends a sibling variant and makes it active; no-op on a non-assistant turn or one without variants. */
export function addVariant(turns: readonly Turn[], turnId: string, input: AddVariantInput): Turn[] {
  const idx = turns.findIndex((t) => t.id === turnId);
  if (idx < 0) return [...turns];
  const turn = turns[idx];
  if (turn?.role !== 'assistant' || !turn.variants) return [...turns];
  const variant: Variant = {
    id: input.id,
    status: 'pending',
    content: '',
    rawAcc: '',
    ...(input.refinementBody !== undefined ? { refinementBody: input.refinementBody } : {}),
    ...(input.refinementLabel !== undefined ? { refinementLabel: input.refinementLabel } : {}),
    ...(input.targetLang !== undefined ? { targetLang: input.targetLang } : {}),
    ...(input.sourceLang !== undefined ? { sourceLang: input.sourceLang } : {}),
    ...(input.task !== undefined ? { task: input.task } : {}),
  };
  const nextVariants = [...turn.variants, variant];
  const nextTurn: Turn = projectVariant({
    ...turn,
    variants: nextVariants,
    activeVariantIdx: nextVariants.length - 1,
  });
  const out = [...turns];
  out[idx] = nextTurn;
  return out;
}

/** Dropping the active variant activates the one before it; no-op when only one variant is left or the id is unknown. */
export function dropVariant(turns: readonly Turn[], turnId: string, variantId: string): Turn[] {
  const tidx = turns.findIndex((t) => t.id === turnId);
  const turn = turns[tidx];
  if (!turn?.variants || turn.variants.length < 2) return [...turns];
  const vidx = turn.variants.findIndex((v) => v.id === variantId);
  if (vidx < 0) return [...turns];
  const active = turn.activeVariantIdx ?? 0;
  const nextActive = active === vidx ? Math.max(0, vidx - 1) : active > vidx ? active - 1 : active;
  const out = [...turns];
  out[tidx] = projectVariant({
    ...turn,
    variants: turn.variants.filter((v) => v.id !== variantId),
    activeVariantIdx: nextActive,
  });
  return out;
}

/** Newest done variant answering in target (no targetLang = originalTarget), or -1. */
export function variantIdxForTarget(
  turn: Turn,
  originalTarget: LangSelection,
  target: LangSelection,
  modifiers: { refinementBody?: string; task?: TaskId } = {},
): number {
  const variants = turn.variants ?? [];
  for (let i = variants.length - 1; i >= 0; i--) {
    const v = variants[i];
    if (v?.status !== 'done') continue;
    if ((v.targetLang ?? originalTarget) !== target) continue;
    if (v.refinementBody !== modifiers.refinementBody) continue;
    if (v.task !== modifiers.task) continue;
    return i;
  }
  return -1;
}

/** Activates variant idx and projects it onto the turn; out-of-range idx is a no-op. */
export function selectVariant(turns: readonly Turn[], turnId: string, idx: number): Turn[] {
  const tidx = turns.findIndex((t) => t.id === turnId);
  if (tidx < 0) return [...turns];
  const turn = turns[tidx];
  if (!turn?.variants) return [...turns];
  if (idx < 0 || idx >= turn.variants.length) return [...turns];
  const nextTurn = projectVariant({ ...turn, activeVariantIdx: idx });
  const out = [...turns];
  out[tidx] = nextTurn;
  return out;
}

/** The variant `activeVariantIdx` selects. The one place that resolves it — the
 *  renderer, the export and the projection all read through this. */
export function activeVariant(turn: Turn): Variant | undefined {
  const idx = turn.activeVariantIdx;
  if (idx === undefined) return undefined;
  return turn.variants?.[idx];
}

/** A turn's name: its custom task's, else its kind's. "Deleted task" once the task is gone. */
export function turnLabel(turn: Turn, views: readonly TaskView[]): string {
  return turn.taskId !== undefined ? taskLabel(views, turn.taskId) : TURN_KIND_LABEL[turn.kind];
}

/** The task a turn is running: the active variant's override, else the turn's task id, else the kind. `image-translate` runs as translate. */
export function turnTaskValue(turn: Turn): TaskId {
  const v = activeVariant(turn);
  if (v?.task !== undefined) return v.task;
  if (turn.taskId !== undefined) return turn.taskId;
  return (ALL_TASKS as readonly string[]).includes(turn.kind) ? turn.kind : 'translate';
}

export type StartArgs = Parameters<typeof sendTranslateStart>[0];

/** Why a swap would add nothing: the pair is one language, or a reply already answered it. */
export type SwapBlock = 'same-language' | 'answered';

/** The pair a language swap re-runs with: the old target becomes the source. `blocked` says why it cannot run. */
export interface SwapPair extends Pick<TurnDispatch, 'sourceLang' | 'targetLang'> {
  blocked?: SwapBlock;
}

/** A variant's own modifiers. An absent field falls back to the user turn's dispatch. */
export interface VariantSeed {
  refinementBody?: string;
  refinementLabel?: string;
  targetLang?: LangSelection;
  sourceLang?: LangSelection;
  task?: TaskId;
}

export interface StartOverlay {
  requestId: string;
  /** The dispatch being replayed: the user turn's own, or the panel-wide last one. */
  reuse: TurnDispatch;
  seed?: VariantSeed;
  tone?: Tone | undefined;
  context?: PageContext | null | undefined;
  /** The thread the user turn sits in; the prompt gets the turns before it. 'none' sends no history. */
  thread: readonly Turn[] | 'none';
}

/** The turns before the user turn. Neither vision arm forwards history (router.ts), so an image gets none. */
function historyFor(userTurn: Turn, thread: readonly Turn[] | 'none'): ChatTurn[] {
  if (thread === 'none' || userTurn.imageDataUrl !== undefined) return [];
  const at = thread.findIndex((t) => t.id === userTurn.id);
  if (at < 0) return [];
  return assemblePromptHistory(thread.slice(0, at), { budgetTokens: CHAT_HISTORY_TOKEN_BUDGET });
}

/** The one place that decides what a request carries; send, retry and every variant build theirs here. */
export function buildStartArgs(userTurn: Turn, overlay: StartOverlay): StartArgs {
  const { seed = {}, reuse } = overlay;
  const task = seed.task ?? turnTaskValue(userTurn);
  const image = userTurn.imageDataUrl;
  const history = historyFor(userTurn, overlay.thread);
  return {
    requestId: overlay.requestId,
    text: userTurn.content,
    sourceLang: seed.sourceLang ?? reuse.sourceLang,
    targetLang: seed.targetLang ?? reuse.targetLang,
    explain: task === 'explain',
    stream: reuse.stream,
    ...(task === 'translate' ? {} : { task }),
    ...(overlay.tone ? { tone: overlay.tone } : {}),
    ...(overlay.context ? { context: overlay.context } : {}),
    ...(seed.refinementBody !== undefined ? { refinement: seed.refinementBody } : {}),
    ...(history.length > 0 ? { conversationHistory: history } : {}),
    ...(image !== undefined ? { imageUrl: image } : {}),
  };
}

/** Copies the turn with the active variant's fields, so a pending variant cannot show the previous body. */
function projectVariant(turn: Turn): Turn {
  const v = activeVariant(turn);
  if (!v) return turn;
  const next: Turn = { ...turn };
  mirrorVariantToTurn(next, v);
  return next;
}

function findTurnById(turns: readonly Turn[], id: string): Turn | null {
  const idx = turns.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const turn = turns[idx];
  return turn ?? null;
}

/** Per-stream parser, so the container can pass a memoized one. */
type ParseFn = (body: string) => ReturnType<typeof parseJsonResponse>;

/** Applies a chunk to variantId (default: the active variant); only the active variant projects onto the turn. Terminal variants never change. */
export function applyChunk(
  turns: Turn[],
  targetId: string,
  c: TranslationChunk,
  parse: ParseFn = parseJsonResponse,
  variantId?: string,
): Turn[] {
  const turn = findTurnById(turns, targetId);
  if (!turn?.variants) return turns;
  const variant =
    variantId !== undefined ? turn.variants.find((v) => v.id === variantId) : activeVariant(turn);
  if (!variant) return turns;
  if (variant.status === 'done' || variant.status === 'error') return turns;
  applyChunkToVariant(variant, c, parse);
  if (variant === activeVariant(turn)) mirrorVariantToTurn(turn, variant);
  return turns;
}

/** The one chunk reducer: FSM transitions + field assignments on a Variant, in place. */
function applyChunkToVariant(variant: Variant, c: TranslationChunk, parse: ParseFn): void {
  if (c.type === 'delta') {
    variant.rawAcc = (variant.rawAcc ?? '') + c.text;
    const parsed = parse(variant.rawAcc);
    variant.content = streamingTranslation(variant.rawAcc, parsed);
    variant.status = 'streaming';
  } else if (c.type === 'done') {
    const raw = variant.rawAcc ?? '';
    const parsed = parse(raw);
    variant.content = streamingTranslation(raw, parsed);
    variant.status = 'done';
    if (c.confidence !== undefined) variant.confidence = c.confidence;
    const det = extractDetectedFields(parsed, c);
    if (det.detectedLang !== undefined) variant.detectedLang = det.detectedLang;
    if (det.detectedDetail !== undefined) variant.detectedDetail = det.detectedDetail;
    if (det.detectedLangs !== undefined) variant.detectedLangs = det.detectedLangs;
    if (det.explain !== undefined) variant.explain = det.explain;
    if (c.meta) variant.meta = c.meta;
    delete variant.rawAcc;
  } else {
    variant.status = 'error';
    variant.error = {
      code: c.code,
      message: c.message,
      ...retryWindow(c),
      ...(c.backendId !== undefined ? { backendId: c.backendId } : {}),
    };
    delete variant.rawAcc;
  }
}

// Same 60s cap as the tooltip, so a bogus Retry-After cannot park the button forever.
function retryWindow(
  c: Extract<TranslationChunk, { type: 'error' }>,
): { retryUntil: number } | Record<string, never> {
  return c.retryAfterMs !== undefined && c.retryAfterMs > 0
    ? { retryUntil: Date.now() + Math.min(c.retryAfterMs, 60_000) }
    : {};
}

export { errorTurnParts } from '@/shared/error-parts';

/** Mirror a variant onto the Turn, clearing fields it does not carry. */
function mirrorVariantToTurn(turn: Turn, v: Variant): void {
  turn.status = v.status;
  turn.content = v.content;
  if (v.rawAcc !== undefined) turn.rawAcc = v.rawAcc;
  else delete turn.rawAcc;
  if (v.confidence !== undefined) turn.confidence = v.confidence;
  else delete turn.confidence;
  if (v.detectedLang !== undefined) turn.detectedLang = v.detectedLang;
  else delete turn.detectedLang;
  if (v.detectedDetail !== undefined) turn.detectedDetail = v.detectedDetail;
  else delete turn.detectedDetail;
  if (v.detectedLangs !== undefined) turn.detectedLangs = v.detectedLangs;
  else delete turn.detectedLangs;
  if (v.meta !== undefined) turn.meta = v.meta;
  else delete turn.meta;
  if (v.explain !== undefined) turn.explain = v.explain;
  else delete turn.explain;
  if (v.error !== undefined) turn.error = v.error;
  else delete turn.error;
}

/** A user cancel writes 'cancelled'; the router's abort arrives as 'ABORTED'. Both read as Canceled. */
export function isCancelledError(code: string | undefined): boolean {
  return code === 'cancelled' || code === 'ABORTED';
}

/** The start message never reached the background: no billed attempt, so the code stays
 *  outside the policy table and the turn keeps Retry. */
export function failDispatch(turns: Turn[], targetId: string, variantId?: string): Turn[] {
  const turn = findTurnById(turns, targetId);
  if (!turn?.variants) return turns;
  const variant =
    variantId !== undefined ? turn.variants.find((v) => v.id === variantId) : activeVariant(turn);
  if (!variant || variant.status === 'done' || variant.status === 'error') return turns;
  variant.status = 'error';
  variant.error = {
    code: 'dispatch-failed',
    message: 'Ega could not send this. Try again, or reload the extension.',
  };
  if (variant === activeVariant(turn)) mirrorVariantToTurn(turn, variant);
  return turns;
}

/** Cancel the streaming turn. `inflightVariantId` is required because a dispatched
 *  variant stays `pending` until its first delta, indistinguishable by status alone. */
export function cancel(turns: Turn[], targetId: string, inflightVariantId?: string): Turn[] {
  const turn = findTurnById(turns, targetId);
  if (!turn) return turns;
  const inflight = (v: Variant): boolean =>
    v.status === 'streaming' || (v.id === inflightVariantId && v.status === 'pending');
  const turnSettled = turn.status === 'done' || turn.status === 'error';
  if (turnSettled && !turn.variants?.some(inflight)) return turns;
  const err: TurnError = { code: 'cancelled', message: 'Canceled' };
  // A non-active variant can still be inflight — the user switched view mid-stream.
  if (turn.variants && turn.activeVariantIdx !== undefined) {
    for (let i = 0; i < turn.variants.length; i++) {
      const v = turn.variants[i];
      if (!v) continue;
      if (i === turn.activeVariantIdx) {
        // Active variant: cancel if not already terminal (can be pending or streaming).
        if (v.status !== 'done' && v.status !== 'error') {
          v.status = 'error';
          v.error = err;
        }
      } else if (inflight(v)) {
        v.status = 'error';
        v.error = err;
      }
    }
  }
  if (!turnSettled) {
    turn.status = 'error';
    turn.error = err;
  }
  return turns;
}

/** The user turn behind this answer, or null. */
export function findRetryTarget(turns: readonly Turn[], assistantId: string): Turn | null {
  const a = turns.find((t) => t.id === assistantId);
  if (a?.role !== 'assistant' || !a.attachedToTurnId) return null;
  const u = turns.find((t) => t.id === a.attachedToTurnId);
  return u?.role === 'user' ? u : null;
}

/** A user turn sent with an image, including one whose image was dropped to save space: the composer cannot hold it, so it is never edited as text. */
export function isImageTurn(t: Turn): boolean {
  return (
    t.imageDataUrl !== undefined ||
    t.imageShed === true ||
    t.kind === 'image-translate' ||
    t.content === IMAGE_TURN_PLACEHOLDER
  );
}

/** The newest user turn, or null. */
export function findEditableLastUserTurn(turns: readonly Turn[]): Turn | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t?.role === 'user') return t;
  }
  return null;
}

/** Drops the last user turn and all after it; edit-last re-sends it as a new turn, so the old one must go first. */
export function dropLastUserExchange(turns: readonly Turn[]): Turn[] {
  let lastUserIdx = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return [...turns];
  return turns.slice(0, lastUserIdx);
}

/** Removes a turn and its pair; unknown id returns a copy. */
export function deleteTurnPair(turns: readonly Turn[], turnId: string): Turn[] {
  const target = turns.find((t) => t.id === turnId);
  if (!target) return [...turns];
  const idsToRemove = new Set<string>([turnId]);
  if (target.role === 'user') {
    for (const t of turns) {
      if (t.attachedToTurnId === turnId) idsToRemove.add(t.id);
    }
  } else if (target.attachedToTurnId) {
    idsToRemove.add(target.attachedToTurnId);
  }
  return turns.filter((t) => !idsToRemove.has(t.id));
}

/** After a trim, drops leading answers whose question was cut; an answer with no attachedToTurnId stays, and an untrimmed list is returned as is. */
export function dropOrphanHead(trimmed: readonly Turn[], original: readonly Turn[]): Turn[] {
  if (trimmed.length >= original.length) return [...trimmed];
  const kept = new Set(trimmed.map((t) => t.id));
  let start = 0;
  while (start < trimmed.length) {
    const t = trimmed[start];
    if (t?.role !== 'assistant') break;
    const parent = t.attachedToTurnId;
    if (parent === undefined || kept.has(parent)) break;
    start++;
  }
  return trimmed.slice(start);
}

/** Drops the turn and everything after it; unknown id returns a copy. */
export function truncateFrom(turns: readonly Turn[], turnId: string): Turn[] {
  const idx = turns.findIndex((t) => t.id === turnId);
  if (idx < 0) return [...turns];
  return turns.slice(0, idx);
}

/** Bookmarked exchanges only, both halves kept; off returns the same array. */
export function visibleTurns(turns: readonly Turn[], bookmarkedOnly: boolean): readonly Turn[] {
  if (!bookmarkedOnly) return turns;
  const bookmarked = new Set<string>();
  const bookmarkedParents = new Set<string>();
  for (const t of turns) {
    if (!t.bookmarked) continue;
    bookmarked.add(t.id);
    if (t.role === 'assistant' && t.attachedToTurnId) bookmarkedParents.add(t.attachedToTurnId);
  }
  return turns.filter((t) => {
    if (t.bookmarked) return true;
    if (t.role === 'user') return bookmarkedParents.has(t.id);
    if (t.attachedToTurnId !== undefined) return bookmarked.has(t.attachedToTurnId);
    return false;
  });
}

// Hebrew points and Arabic harakat are optional in real text, so a query typed without them must
// still match. Stripping every \p{M} would also delete Thai and Devanagari vowel signs, which change the word.
const OPTIONAL_MARKS =
  /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;
const NON_ASCII = /[\u0080-\uFFFF]/;

function foldForSearch(s: string): string {
  if (!NON_ASCII.test(s)) return s.toLowerCase();
  return s.normalize('NFC').replace(OPTIONAL_MARKS, '').toLowerCase();
}

/** Exchanges matching query, both halves kept; an empty query returns the same array. */
export function searchTurns(turns: readonly Turn[], query: string): readonly Turn[] {
  const q = foldForSearch(query.trim());
  if (!q) return turns;
  const matched = new Set<string>();
  const matchedParents = new Set<string>();
  for (const t of turns) {
    if (!foldForSearch(t.content).includes(q)) continue;
    matched.add(t.id);
    if (t.role === 'assistant' && t.attachedToTurnId) matchedParents.add(t.attachedToTurnId);
  }
  return turns.filter((t) => {
    if (matched.has(t.id)) return true;
    if (t.role === 'user') return matchedParents.has(t.id);
    if (t.attachedToTurnId !== undefined) return matched.has(t.attachedToTurnId);
    return false;
  });
}

function isOpen(v: { status: TurnStatus }): boolean {
  return v.status === 'pending' || v.status === 'streaming';
}

/** Ids of the variants still waiting for an answer. */
export function openVariantIds(t: Turn): string[] {
  return (t.variants ?? []).filter(isOpen).map((v) => v.id);
}

/** Fails turns saved mid-stream as 'interrupted' on load, or they show an endless cursor with no Retry.
 *  `variantIds` limits it to those variants. */
export function interruptPendingTurns(
  turns: readonly Turn[],
  opts: { message?: string; variantIds?: ReadonlySet<string> } = {},
): Turn[] {
  const err = {
    code: 'interrupted',
    message: opts.message ?? 'The panel reloaded before this finished.',
  };
  const picked = (id: string | undefined): boolean =>
    opts.variantIds === undefined || (id !== undefined && opts.variantIds.has(id));
  return turns.map((t) => {
    if (t.role !== 'assistant') return t;
    const topStuck = isOpen(t) && picked(activeVariant(t)?.id);
    // A variant can be mid-stream while the turn already settled, so repair it regardless.
    let variantsChanged = false;
    const nextVariants = t.variants?.map((v) => {
      if (!isOpen(v) || !picked(v.id)) return v;
      variantsChanged = true;
      return { ...v, status: 'error' as const, error: err };
    });
    // variantsChanged mutates inside the .map closure, which TS cannot see from the outer `let = false`.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!topStuck && !variantsChanged) return t;
    return {
      ...t,
      ...(topStuck ? { status: 'error' as const, error: err } : {}),
      ...(nextVariants ? { variants: nextVariants } : {}),
    };
  });
}

/** Flips bookmarked on one turn; unknown id returns a copy. */
export function toggleBookmark(turns: readonly Turn[], turnId: string): Turn[] {
  const idx = turns.findIndex((t) => t.id === turnId);
  if (idx < 0) return [...turns];
  const out = [...turns];
  const turn = out[idx];
  if (!turn) return out;
  out[idx] = { ...turn, bookmarked: !turn.bookmarked };
  return out;
}

/** Assistant turns whose paired user turn carries an image, whatever kind the send used. */
export function imageBackedTurnIds(turns: readonly Turn[]): ReadonlySet<string> {
  const usersWithImage = new Set<string>();
  for (const t of turns) {
    if (t.role === 'user' && t.imageDataUrl !== undefined) usersWithImage.add(t.id);
  }
  const ok = new Set<string>();
  for (const t of turns) {
    if (t.role === 'assistant' && t.attachedToTurnId !== undefined) {
      if (usersWithImage.has(t.attachedToTurnId)) ok.add(t.id);
    }
  }
  return ok;
}

/** Assistant turns whose paired user turn carries dispatch params, so Retry can replay them. */
export function retryableTurnIds(turns: readonly Turn[]): ReadonlySet<string> {
  const usersWithDispatch = new Set<string>();
  for (const t of turns) {
    if (t.role === 'user' && t.dispatch !== undefined) usersWithDispatch.add(t.id);
  }
  const ok = new Set<string>();
  for (const t of turns) {
    if (t.role === 'assistant' && t.attachedToTurnId !== undefined) {
      if (usersWithDispatch.has(t.attachedToTurnId)) ok.add(t.id);
    }
  }
  return ok;
}

/** The language pair each answer's send asked for, from its user turn's dispatch. */
export function answerLangs(
  turns: readonly Turn[],
): ReadonlyMap<string, Pick<TurnDispatch, 'sourceLang' | 'targetLang'>> {
  const byUser = new Map<string, Pick<TurnDispatch, 'sourceLang' | 'targetLang'>>();
  for (const t of turns) {
    if (t.role === 'user' && t.dispatch !== undefined) {
      byUser.set(t.id, { sourceLang: t.dispatch.sourceLang, targetLang: t.dispatch.targetLang });
    }
  }
  const out = new Map<string, Pick<TurnDispatch, 'sourceLang' | 'targetLang'>>();
  for (const t of turns) {
    const lang = t.attachedToTurnId === undefined ? undefined : byUser.get(t.attachedToTurnId);
    if (t.role === 'assistant' && lang !== undefined) out.set(t.id, lang);
  }
  return out;
}
