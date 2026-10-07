// One thread per origin under its own key, so a streaming delta's save rewrites just that thread.
import { withConversationLock } from '@/shared/conversation-lock';
import {
  CONV_STORE_VERSION,
  EMPTY_THREAD_BYTES,
  GENERAL_ORIGIN,
  entryFacts,
  INDEX_KEY,
  THREAD_KEY_PREFIX,
  parseIndex,
  readIndex,
  storedKeys,
  threadKey,
  type IndexEntry,
} from '@/shared/saved-conversations';
import { omitUndef } from '@/shared/utils/omitUndef';
import { IMAGE_DATA_URL_MAX_CHARS } from '@/shared/constants';
import { INSTRUCTIONS_KEPT_REPLIES } from '@/shared/reply-instructions';
import type { ResultMeta } from '@/shared/types';
import {
  ALL_TURN_KINDS,
  dropOrphanHead,
  type AssistantTurnData,
  type Turn,
  type UserTurnData,
  type Variant,
} from './conversation';

export { GENERAL_ORIGIN, INDEX_KEY, threadKey };
/** Max distinct origin threads kept. Oldest-by-updatedAt evicted past this. */
export const MAX_THREADS = 50;
/** Max turns kept per thread. Oldest trimmed past this. */
export const MAX_TURNS_PER_THREAD = 300;

// A second Chrome window runs its own sidepanel realm that writes the same index.
const writeLock = withConversationLock;

/** http(s) keeps its own origin; every other scheme shares the general bucket. */
export function deriveOrigin(url: string | undefined): string {
  if (!url) return GENERAL_ORIGIN;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : GENERAL_ORIGIN;
  } catch {
    return GENERAL_ORIGIN;
  }
}

// ── Storage shapes ───────────────────────────────────────────────────────────

/** Id of a turn deleted in some window. `at` is the newest delete, `ats` every delete still
 *  unanswered — one Undo answers one of them, and the rest keep the turn buried. */
interface Tombstone {
  id: string;
  at: number;
  ats?: number[];
}

/** A clear of a full thread records one per turn; a smaller cap lets the other window write the tail back. */
const MAX_TOMBSTONES = MAX_TURNS_PER_THREAD;

/** Deletes of one turn that can still be undone: one per window, so a handful is generous. */
const MAX_DELETE_STAMPS = 8;

interface StoredThread {
  version: number;
  origin: string;
  turns: Turn[];
  updatedAt: number;
  /** Turns deleted here, so another window's next save cannot write them back. */
  tombstones?: Tombstone[];
  /** The panel that wrote this, so its own `onChanged` echo is not re-read as another window's write. */
  writer?: string;
  /** Settings deleted this thread then: a turn created earlier that storage does not hold never comes back. */
  clearedAt?: number;
}

// ── Guards ───────────────────────────────────────────────────────────────────

const VALID_ROLES = new Set(['user', 'assistant']);
const VALID_STATUSES = new Set(['idle', 'pending', 'streaming', 'done', 'error']);
const VALID_KINDS: ReadonlySet<string> = new Set(ALL_TURN_KINDS);

/** An unknown status becomes 'error' plus an error object, which the banner needs. */
function validateStoredTurn(t: unknown): Turn | null {
  if (t === null || typeof t !== 'object') return null;
  const e = t as Record<string, unknown>;
  if (typeof e['id'] !== 'string' || !e['id']) return null;
  if (!VALID_ROLES.has(e['role'] as string)) return null;
  if (!VALID_KINDS.has(e['kind'] as string)) return null;
  if (typeof e['content'] !== 'string') return null;
  if (typeof e['createdAt'] !== 'number') return null;
  if (e['role'] === 'user') {
    const user = { ...(e as unknown as UserTurnData), status: 'idle' as const };
    // Rendered as a count, so anything but a positive integer is dropped rather than shown.
    if (!(Number.isInteger(user.trimmedTo) && (user.trimmedTo ?? 0) > 0)) delete user.trimmedTo;
    return user;
  }
  const answer = e as unknown as AssistantTurnData;
  const rawStatus = e['status'] as string;
  if (VALID_STATUSES.has(rawStatus)) {
    return remirrorInstructions(
      withSeedVariant({ ...answer, status: rawStatus as AssistantTurnData['status'] }),
    );
  }
  return remirrorInstructions(
    withSeedVariant({
      ...answer,
      status: 'error',
      error: { code: 'interrupted', message: 'The panel reloaded before this finished.' },
    }),
  );
}

type InstructionFields = Pick<ResultMeta, 'instructions' | 'instructionsLength'>;

function withoutInstructions<M extends ResultMeta | undefined>(meta: M): M {
  if (
    meta === undefined ||
    (meta.instructions === undefined && meta.instructionsLength === undefined)
  ) {
    return meta;
  }
  const { instructions: _i, instructionsLength: _l, ...rest } = meta;
  void _i;
  void _l;
  return rest as M;
}

/** A stored instruction text that is not a string is dropped, never rendered. */
function cleanInstructions(meta: ResultMeta | undefined): ResultMeta | undefined {
  if (meta === undefined) return meta;
  const ok = typeof meta.instructions === 'string';
  if (ok && (meta.instructionsLength === undefined || Number.isFinite(meta.instructionsLength))) {
    return meta;
  }
  if (!ok) return withoutInstructions(meta);
  const { instructionsLength: _l, ...rest } = meta;
  void _l;
  return rest;
}

/** The store keeps one copy per reply, on the variant; the turn's top-level meta mirrors the active one again on load. */
function remirrorInstructions(t: AssistantTurnData): AssistantTurnData {
  const variants = t.variants?.map((v) =>
    v.meta === undefined ? v : { ...v, meta: cleanInstructions(v.meta) as ResultMeta },
  );
  const active = variants?.[t.activeVariantIdx ?? 0];
  let meta = cleanInstructions(t.meta);
  const fields: InstructionFields | undefined = active?.meta;
  if (meta !== undefined && fields?.instructions !== undefined) {
    meta = {
      ...meta,
      instructions: fields.instructions,
      ...(fields.instructionsLength !== undefined
        ? { instructionsLength: fields.instructionsLength }
        : {}),
    };
  }
  return {
    ...t,
    ...(variants !== undefined ? { variants } : {}),
    ...(meta !== undefined ? { meta } : {}),
  };
}

/** Keeps the sent instructions on the `keep` newest replies only, and one copy per reply: a turn with variants keeps
 *  them on its variants, not on its mirrored top-level meta. Every other field is untouched. */
export function leanInstructions(
  turns: readonly Turn[],
  keep: number = INSTRUCTIONS_KEPT_REPLIES,
): Turn[] {
  let kept = 0;
  const out = [...turns];
  for (let i = out.length - 1; i >= 0; i--) {
    const t = out[i];
    if (t?.role !== 'assistant') continue;
    const keepOne = (meta: ResultMeta | undefined): ResultMeta | undefined => {
      if (meta?.instructions === undefined) return withoutInstructions(meta);
      if (kept < keep) {
        kept++;
        return meta;
      }
      return withoutInstructions(meta);
    };
    if (t.variants === undefined) {
      const meta = keepOne(t.meta);
      if (meta !== t.meta) out[i] = { ...t, ...(meta !== undefined ? { meta } : {}) } as Turn;
      continue;
    }
    const variants = [...t.variants];
    for (let j = variants.length - 1; j >= 0; j--) {
      const v = variants[j];
      if (v === undefined) continue;
      const meta = keepOne(v.meta);
      if (meta !== v.meta) variants[j] = { ...v, ...(meta !== undefined ? { meta } : {}) };
    }
    const top = withoutInstructions(t.meta);
    out[i] = { ...t, variants, ...(top !== undefined ? { meta: top } : {}) } as Turn;
  }
  return out;
}

/** `shrinkTurn` drops `variants` past the byte cap; every live assistant turn has a v1, so rebuild it here and nothing downstream has to special-case its absence. */
function withSeedVariant(t: AssistantTurnData): AssistantTurnData {
  if (t.variants !== undefined) return t;
  const seed: Variant = {
    id: `${t.id}:v1`,
    status: t.status,
    content: t.content,
    rawAcc: '',
    ...omitUndef({
      detectedLang: t.detectedLang,
      detectedDetail: t.detectedDetail,
      detectedLangs: t.detectedLangs,
      confidence: t.confidence,
      meta: t.meta,
      explain: t.explain,
      error: t.error,
    }),
  };
  return { ...t, variants: [seed], activeVariantIdx: 0 };
}

/** `hasThreadShape` casts the blob, so the tombstone list is still untrusted. */
function parseTombstones(raw: unknown): Tombstone[] {
  if (!Array.isArray(raw)) return [];
  const out: Tombstone[] = [];
  for (const t of raw as unknown[]) {
    if (t === null || typeof t !== 'object') continue;
    const e = t as Record<string, unknown>;
    const id = e['id'];
    const at = e['at'];
    if (typeof id !== 'string' || typeof at !== 'number') continue;
    const ats = e['ats'];
    // A malformed stamp list falls back to `at`: dropping the record would unbury the turn.
    const usable =
      Array.isArray(ats) &&
      ats.length > 0 &&
      ats.length <= MAX_DELETE_STAMPS &&
      ats.every((a) => typeof a === 'number');
    out.push(usable ? { id, at, ats: ats as number[] } : { id, at });
  }
  return out;
}

function hasThreadShape(x: unknown): x is StoredThread {
  if (x === null || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e['version'] === 'number' &&
    typeof e['origin'] === 'string' &&
    typeof e['updatedAt'] === 'number' &&
    Array.isArray(e['turns'])
  );
}

/** A version this build cannot read is a fact about the blob, not permission to drop it. */
function isReadableVersion(x: unknown): boolean {
  return (
    x !== null &&
    typeof x === 'object' &&
    (x as Record<string, unknown>)['version'] === CONV_STORE_VERSION
  );
}

// ── Public IO ────────────────────────────────────────────────────────────────

let orphansReclaimed = false;

/** An unlisted blob is most likely real turns whose index write failed, so re-list it and let the byte budget evict it; delete only non-threads; a version this build cannot read is left alone, not re-listed. */
async function reclaimOrphanThreads(): Promise<void> {
  if (orphansReclaimed) return;
  orphansReclaimed = true;
  try {
    const stored = await chrome.storage.local.get(INDEX_KEY);
    // No index at all means nothing to compare a blob against.
    if (stored[INDEX_KEY] === undefined) return;
    // An index this build cannot read says nothing about which blobs are live.
    if (parseIndex(stored[INDEX_KEY]) === null) return;
    await writeLock(async () => {
      const index = await readIndex();
      const listed = new Set(index.threads.map((t) => threadKey(t.origin)));
      const unlisted = (await storedKeys()).filter(
        (k) => k.startsWith(THREAD_KEY_PREFIX) && !listed.has(k),
      );
      if (unlisted.length === 0) return;
      const values = await chrome.storage.local.get(unlisted);
      const dead: string[] = [];
      const relist: IndexEntry[] = [];
      for (const k of unlisted) {
        const v = values[k];
        if (!hasThreadShape(v)) {
          dead.push(k);
          continue;
        }
        if (!isReadableVersion(v)) continue;
        relist.push({
          origin: v.origin,
          updatedAt: v.updatedAt,
          bytes: estimateBytes(v.turns),
          ...entryFacts(v.turns),
        });
      }
      if (dead.length > 0) await chrome.storage.local.remove(dead);
      if (relist.length > 0) await commitIndex(relist);
    });
  } catch {
    // A failed sweep leaves the orphans for the next open.
  }
}

interface ReadThread {
  turns: Turn[];
  tombstones: Tombstone[];
  unreadable: boolean;
  clearedAt?: number;
}

function emptyRead(unreadable: boolean): ReadThread {
  return { turns: [], tombstones: [], unreadable };
}

/** A missing value is an empty thread; a value that is present and unusable is not. */
function parseStoredThread(raw: unknown): ReadThread {
  if (!hasThreadShape(raw)) return emptyRead(raw !== undefined);
  if (!isReadableVersion(raw)) return emptyRead(true);
  const validated: Turn[] = [];
  for (const t of raw.turns) {
    const valid = validateStoredTurn(t);
    if (valid !== null) validated.push(valid);
  }
  const clearedAt = Number.isFinite(raw.clearedAt) ? raw.clearedAt : undefined;
  return {
    turns: validated,
    tombstones: parseTombstones(raw.tombstones),
    unreadable: false,
    ...(clearedAt !== undefined ? { clearedAt } : {}),
  };
}

/** A turn created before Settings deleted the thread, which the stored thread does not hold. */
function clearedBefore(
  t: Turn,
  clearedAt: number | undefined,
  stored: ReadonlySet<string>,
): boolean {
  return clearedAt !== undefined && t.createdAt <= clearedAt && !stored.has(t.id);
}

/** Raw read, no lock — also runs inside `saveThread`, which already holds the write lock. */
async function readStoredThread(origin: string): Promise<ReadThread> {
  try {
    const key = threadKey(origin);
    const r = await chrome.storage.local.get(key);
    return parseStoredThread(r[key] as unknown);
  } catch {
    return emptyRead(true);
  }
}

/** What another window wrote for a thread, from an `onChanged` payload. Null for this
 *  panel's own write, a removed key, or a blob this build cannot read. */
export function parseThreadChange(newValue: unknown, ownWriter: string): StoredThreadView | null {
  if (!hasThreadShape(newValue) || newValue.writer === ownWriter) return null;
  const read = parseStoredThread(newValue);
  if (read.unreadable) return null;
  return {
    turns: read.turns,
    tombstones: new Map(read.tombstones.map((t) => [t.id, { at: t.at, ats: stampsOf(t) }])),
    ...(read.clearedAt !== undefined ? { clearedAt: read.clearedAt } : {}),
  };
}

export interface LoadThreadResult {
  turns: Turn[];
  /** A blob exists that this build cannot read. It stays on disk, so the panel has to say so. */
  unreadable: boolean;
  /** The Settings delete this thread already shows; the panel passes it back on every save. */
  clearedAt?: number;
}

/** Missing, corrupt or unreadable-version data reads as no turns; malformed turns are dropped. */
export async function loadThreadResult(origin: string): Promise<LoadThreadResult> {
  const { turns, unreadable, clearedAt } = await readStoredThread(origin);
  // Not awaited: the sweep walks every stored key, and the first conversation paint waits on this call.
  void reclaimOrphanThreads();
  return { turns, unreadable, ...(clearedAt !== undefined ? { clearedAt } : {}) };
}

/** Compared against `imageDataUrl.length`, so it is a character cap; the popup handoff shares it. */
export const MAX_IMAGE_BYTES = IMAGE_DATA_URL_MAX_CHARS;
/** Serialized ceiling for one turn. Past it the turn keeps its visible text only. */
export const MAX_TURN_BYTES = 300 * 1024;
/** Serialized ceiling for one thread. Oldest turns drop past it. */
export const MAX_THREAD_BYTES = 512 * 1024;
/** Ceiling across every stored thread — settings and the audit log share the same 10 MB. */
export const MAX_TOTAL_THREAD_BYTES = 4 * 1024 * 1024;
const MAX_TURN_CONTENT_CHARS = 20_000;

const encoder = new TextEncoder();

/** The quota counts encoded bytes, so `.length` under-reports every non-Latin script. */
function estimateBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

/** The active variant already projects onto `content`, so the history is the part that can go. */
function shrinkTurn(t: Turn): Turn {
  const lean: Turn = { ...t, content: t.content.slice(0, MAX_TURN_CONTENT_CHARS) };
  delete lean.rawAcc;
  delete lean.variants;
  delete lean.activeVariantIdx;
  return lean;
}

/** A turn with the size it serializes to, so one save stringifies each turn once. */
interface SizedTurn {
  turn: Turn;
  bytes: number;
}

/** Drops the image payload, leaving placeholder text for the renderer. */
export function stripImage(t: Turn, note: string): Turn {
  if (t.imageDataUrl === undefined) return t;
  // The dispatch goes too: a retry with no image would send the bare placeholder as the text.
  const { imageDataUrl: _dropped, dispatch: _replay, ...rest } = t;
  void _dropped;
  void _replay;
  return { ...rest, content: t.content || note, imageShed: true };
}

/** Drops an oversized imageDataUrl and leaves placeholder text for the renderer. */
function capTurnSize(t: Turn): SizedTurn {
  let out = t;
  if (t.imageDataUrl && t.imageDataUrl.length > MAX_IMAGE_BYTES) {
    out = stripImage(t, '[image removed: too large to store]');
  }
  const bytes = estimateBytes(out);
  if (bytes <= MAX_TURN_BYTES) return { turn: out, bytes };
  // The sent instructions are the cheapest thing to lose; the variants go only if that is not enough.
  const lean = leanInstructions([out], 0)[0] ?? out;
  if (lean !== out) {
    const leanBytes = estimateBytes(lean);
    if (leanBytes <= MAX_TURN_BYTES) return { turn: lean, bytes: leanBytes };
    out = lean;
  }
  const shrunk = shrinkTurn(out);
  return { turn: shrunk, bytes: estimateBytes(shrunk) };
}

/** `JSON.stringify` of an array is the parts joined by a comma inside two brackets. */
function serialisedArrayBytes(sized: readonly SizedTurn[]): number {
  if (sized.length === 0) return 2;
  return sized.reduce((sum, s) => sum + s.bytes, 0) + sized.length + 1;
}

/** Keeps the newest turns that fit the thread budget. */
function fitThreadBytes(sized: SizedTurn[]): SizedTurn[] {
  let total = 0;
  for (let i = sized.length - 1; i >= 0; i--) {
    total += (sized[i]?.bytes ?? 0) + 1;
    if (total > MAX_THREAD_BYTES) {
      const kept = sized.slice(i + 1);
      const head = dropOrphanHead(
        kept.map((s) => s.turn),
        sized.map((s) => s.turn),
      );
      // dropOrphanHead only cuts from the front, so the survivors are the same suffix.
      return kept.slice(kept.length - head.length);
    }
  }
  return sized;
}

function totalBytes(entries: IndexEntry[]): number {
  return entries.reduce((sum, e) => sum + e.bytes, 0);
}

/** Eviction order: rows that only hold tombstones go before any real conversation, then oldest first. */
function evictionOrder(a: IndexEntry, b: IndexEntry): number {
  const live = (e: IndexEntry): number => (e.bytes > EMPTY_THREAD_BYTES ? 1 : 0);
  return live(a) - live(b) || a.updatedAt - b.updatedAt;
}

/** A conversation the store removed to make room, named for the toast. */
export interface EvictedConversation {
  id: string;
  title?: string;
}

function evictedOf(e: IndexEntry): EvictedConversation {
  return e.title !== undefined ? { id: e.origin, title: e.title } : { id: e.origin };
}

/** Adds or replaces entries, evicts past the conversation and byte budgets, writes the index. */
async function commitIndex(entries: readonly IndexEntry[]): Promise<EvictedConversation[]> {
  const index = await readIndex();
  const stored = new Map(index.threads.map((t) => [t.origin, t]));
  const incoming = new Set(entries.map((e) => e.origin));
  const evicted: EvictedConversation[] = [];
  const rest = index.threads.filter((t) => !incoming.has(t.origin));
  // A save never knows when the list last opened a conversation, so the stored stamp carries over.
  for (const e of entries) {
    const openedAt = stored.get(e.origin)?.openedAt;
    rest.push(openedAt !== undefined && e.openedAt === undefined ? { ...e, openedAt } : e);
  }
  rest.sort(evictionOrder);
  // `rest.length > entries.length` keeps the threads being written even when they alone pass the total.
  while (
    rest.length > MAX_THREADS ||
    (rest.length > entries.length && totalBytes(rest) > MAX_TOTAL_THREAD_BYTES)
  ) {
    // Never one being written: its blob would be left unlisted.
    const at = rest.findIndex((t) => !incoming.has(t.origin));
    const victim = at < 0 ? undefined : rest.splice(at, 1)[0];
    if (victim === undefined) break;
    await chrome.storage.local.remove(threadKey(victim.origin));
    if (victim.bytes > EMPTY_THREAD_BYTES) evicted.push(evictedOf(victim));
  }
  rest.sort((a, b) => a.updatedAt - b.updatedAt);
  await chrome.storage.local.set({
    [INDEX_KEY]: { version: CONV_STORE_VERSION, threads: rest },
  });
  return evicted;
}

/** This thread without its image payloads — the bytes to give up before taking another origin's thread. */
export const IMAGE_SHED_NOTE = '[image removed: not enough space]';

function shedForQuota(turns: readonly Turn[]): Turn[] | null {
  const lean = turns.map((t) => stripImage(t, IMAGE_SHED_NOTE));
  return lean.some((t, i) => t !== turns[i]) ? lean : null;
}

/** Deletes the first OTHER thread in eviction order and names it.
 *  Never our own: the blob we are about to write would be left unlisted. */
async function evictOldestOtherThread(origin: string): Promise<EvictedConversation | undefined> {
  const index = await readIndex();
  const victim = index.threads.filter((t) => t.origin !== origin).sort(evictionOrder)[0];
  if (!victim) return undefined;
  await chrome.storage.local.remove(threadKey(victim.origin));
  await chrome.storage.local.set({
    [INDEX_KEY]: {
      version: CONV_STORE_VERSION,
      threads: index.threads.filter((t) => t.origin !== victim.origin),
    },
  });
  return evictedOf(victim);
}

export function isQuotaError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.message.includes('QUOTA_BYTES') || e.message.toLowerCase().includes('quota');
}

/** Slots each of `foreign` in by createdAt without re-sorting `base`: a restored slice keeps its place. */
function slotByCreatedAt(base: readonly Turn[], foreign: readonly Turn[]): Turn[] {
  const out = [...base];
  for (const f of [...foreign].sort((a, b) => a.createdAt - b.createdAt)) {
    let at = out.length;
    while (at > 0 && (out[at - 1]?.createdAt ?? 0) > f.createdAt) at--;
    out.splice(at, 0, f);
  }
  return out;
}

/** A copy that never finished: another window's `interrupted` stamp, or a stream still open somewhere. */
function isUnfinishedCopy(t: Turn): boolean {
  return (
    t.status === 'pending' ||
    t.status === 'streaming' ||
    (t.status === 'error' && t.error?.code === 'interrupted')
  );
}

/** Incoming wins per turn id, with one exception: an unfinished copy (this window
 *  loaded it mid-stream and stamped it `interrupted`, or holds it pending) never
 *  overwrites a stored turn another window settled. A stored turn this panel
 *  never loaded was written by another window — keep it, ordered back in by createdAt.
 *  A stored turn in `knownIds` but absent from `incoming` was removed on purpose — drop it. */
function mergeTurnsById(
  stored: readonly Turn[],
  incoming: readonly Turn[],
  knownIds: ReadonlySet<string>,
): Turn[] {
  const incomingIds = new Set(incoming.map((t) => t.id));
  const storedById = new Map(stored.map((t) => [t.id, t]));
  const kept = incoming.map((t) => {
    const prior = storedById.get(t.id);
    return prior !== undefined && !isUnfinishedCopy(prior) && isUnfinishedCopy(t) ? prior : t;
  });
  const foreign = stored.filter((t) => !incomingIds.has(t.id) && !knownIds.has(t.id));
  return slotByCreatedAt(kept, foreign);
}

/** A thread as another window wrote it, ready to merge into this window's memory. */
export interface TombstoneView {
  at: number;
  /** Every delete still unanswered: one Undo per window that deleted the turn. */
  ats: readonly number[];
}

export interface StoredThreadView {
  turns: readonly Turn[];
  /** Turn id to the newest burial and how many deletes are still unanswered. */
  tombstones: ReadonlyMap<string, TombstoneView>;
  /** Settings deleted the thread then; older turns it does not hold go too, the ones the size cap dropped included. */
  clearedAt?: number;
}

export interface RereadOptions {
  /** The turn this window is streaming into; storage never replaces it. */
  inflightId: string | null;
  knownIds: ReadonlySet<string>;
  /** Turn id to the moment it was deleted here. */
  deletedAt: ReadonlyMap<string, number>;
  /** Turn id to the stamp of the delete an Undo here answered — not the moment it was clicked. */
  revivedAt: ReadonlyMap<string, number>;
  /** The Settings delete this window already applied; only a newer one drops its turns. */
  seenClearedAt?: number;
}

/** What the re-read did, so the caller can tell another window's removals from its own. */
export interface RereadResult {
  turns: Turn[];
  /** Local ids another window's tombstone removed. Nobody deleted them in this window. */
  buriedIds: string[];
}

/** The other direction of `mergeTurnsById`: storage wins per turn id, with three exceptions.
 *  A tombstone drops the local copy unless this window revived it after that burial. The
 *  turn this window is streaming into, and a settled local copy the stored side still holds
 *  unfinished, stay.
 *  A stored turn this window never loaded is foreign: slotted in by createdAt, unless this
 *  window deleted it. A stored turn in `knownIds` but absent locally was removed on purpose. */
export function mergeStoredThread(
  local: readonly Turn[],
  stored: StoredThreadView,
  opts: RereadOptions,
): RereadResult {
  const storedById = new Map(stored.turns.map((t) => [t.id, t]));
  const storedIds = new Set(storedById.keys());
  const newClear = stored.clearedAt !== opts.seenClearedAt ? stored.clearedAt : undefined;
  const kept: Turn[] = [];
  const buriedIds: string[] = [];
  for (const t of local) {
    if (clearedBefore(t, newClear, storedIds)) {
      buriedIds.push(t.id);
      continue;
    }
    const buried = stored.tombstones.get(t.id);
    // One Undo answers one delete: this window keeps the turn only when its revive is the
    // last unanswered burial, so another window's delete still buries it here.
    const revived = opts.revivedAt.get(t.id);
    const answered =
      buried !== undefined && revived !== undefined && buried.ats.every((a) => a === revived);
    if (buried !== undefined && !answered) {
      buriedIds.push(t.id);
      continue;
    }
    const s = storedById.get(t.id);
    // Ownership, not status: a pending copy adopted from another window must still take its answer.
    if (s === undefined || t.id === opts.inflightId) {
      kept.push(t);
      continue;
    }
    kept.push(isUnfinishedCopy(s) && !isUnfinishedCopy(t) ? t : s);
  }
  const localIds = new Set(local.map((t) => t.id));
  const foreign = stored.turns.filter(
    (t) => !localIds.has(t.id) && !opts.knownIds.has(t.id) && !opts.deletedAt.has(t.id),
  );
  return { turns: slotByCreatedAt(kept, foreign), buriedIds };
}

function stampsOf(t: Tombstone): number[] {
  return t.ats ?? [t.at];
}

/** `Math.max(...xs)` on a list read from storage would spread an untrusted length. */
function newest(xs: readonly number[]): number {
  return xs.reduce((m, a) => (a > m ? a : m), -Infinity);
}

/** One window deletes a turn once, so a stamp it already carries is the same delete saved again. */
function withStamp(prev: Tombstone | undefined, at: number): number[] {
  if (prev === undefined) return [at];
  const prior = stampsOf(prev);
  return prior.includes(at) ? prior : [...prior, at].slice(-MAX_DELETE_STAMPS);
}

/** Newest-first, capped: an old tombstone outlives every window that could resurrect its turn. */
function mergeTombstones(stored: readonly Tombstone[], options: SaveThreadOptions): Tombstone[] {
  const byId = new Map(stored.map((t) => [t.id, t]));
  // A revive answers ONE burial: it must match the newest delete's stamp, and any other
  // window's delete of the same turn still stands.
  for (const [id, at] of options.revivedAt ?? []) {
    const prev = byId.get(id);
    if (prev === undefined) continue;
    const left = stampsOf(prev).filter((a) => a !== at);
    if (left.length === stampsOf(prev).length) continue;
    if (left.length === 0) byId.delete(id);
    else byId.set(id, { id, at: newest(left), ats: left });
  }
  // Every window's delete keeps its own stamp, so one Undo cannot answer another's.
  for (const [id, at] of options.deletedAt ?? []) {
    const prev = byId.get(id);
    const ats = withStamp(prev, at);
    byId.set(id, { id, at: newest(ats), ats });
  }
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_TOMBSTONES);
}

export interface SaveThreadOptions {
  /** Every turn id this panel has loaded or created for `origin`. Omitting it
   *  writes `turns` as the whole thread (single-writer semantics). */
  knownIds?: ReadonlySet<string>;
  /** Turn ids deleted in this panel, stamped at the delete so an Undo that answers one
   *  is ordered by the user's clicks and not by lock contention. */
  deletedAt?: ReadonlyMap<string, number>;
  /** Turn ids whose delete was undone, each stamped with the burial it answers. That
   *  tombstone goes, or the restored turn is filtered straight back out. */
  revivedAt?: ReadonlyMap<string, number>;
  /** Stamped on the blob, so this panel can tell its own `onChanged` echo from another window's write. */
  writer?: string;
  /** The Settings delete this panel has already applied: its later turns are never refused for it, whatever the clock says. */
  seenClearedAt?: number;
}

export interface SaveThreadResult {
  /** Another conversation was deleted to make room, so the caller can say which. */
  evicted?: EvictedConversation;
  /** Oldest turns the 300-turn and 512 KB caps dropped from this write. Absent when nothing was trimmed. */
  droppedTurns?: number;
  /** The write only fit once every image payload was dropped; memory still holds them. */
  shedImages?: boolean;
  /** Turns the caller still shows that a tombstone kept out of the write. Absent when none. */
  refusedIds?: string[];
}

/** On a quota rejection this sheds its own bytes first, and only then evicts another thread. */
export async function saveThread(
  origin: string,
  turns: Turn[],
  options: SaveThreadOptions = {},
): Promise<SaveThreadResult> {
  return await writeLock(() => saveThreadLocked(origin, turns, options));
}

/** Puts one settled turn back in its place in the stored thread. A turn no longer stored was
 *  deleted meanwhile, so nothing is written. */
export async function settleStoredTurn(
  origin: string,
  turn: Turn,
  writer: string,
): Promise<SaveThreadResult | undefined> {
  return writeLock(async () => {
    const stored = await readStoredThread(origin);
    if (stored.unreadable || !stored.turns.some((t) => t.id === turn.id)) return undefined;
    const next = stored.turns.map((t) => (t.id === turn.id ? turn : t));
    return saveThreadLocked(origin, next, { knownIds: new Set(next.map((t) => t.id)), writer });
  });
}

async function saveThreadLocked(
  origin: string,
  turns: Turn[],
  options: SaveThreadOptions,
): Promise<SaveThreadResult> {
  const { knownIds } = options;
  const now = Date.now();
  const stored = await readStoredThread(origin);
  const tombstones = mergeTombstones(stored.tombstones, options);
  const storedIds = new Set(stored.turns.map((t) => t.id));
  const buried = new Set([
    ...tombstones.map((t) => t.id),
    ...turns
      .filter((t) =>
        clearedBefore(
          t,
          stored.clearedAt !== options.seenClearedAt ? stored.clearedAt : undefined,
          storedIds,
        ),
      )
      .map((t) => t.id),
  ]);
  const live = turns.filter((t) => !buried.has(t.id));
  const refused = turns.filter((t) => buried.has(t.id)).map((t) => t.id);
  const base =
    knownIds !== undefined
      ? mergeTurnsById(
          stored.turns.filter((t) => !buried.has(t.id)),
          live,
          knownIds,
        )
      : live;
  const trimmed =
    base.length > MAX_TURNS_PER_THREAD
      ? dropOrphanHead(base.slice(-MAX_TURNS_PER_THREAD), base)
      : base;
  const sized = fitThreadBytes(leanInstructions(trimmed).map(capTurnSize));
  const capped = sized.map((s) => s.turn);
  // `base` is already post-tombstone and post-merge, so a deliberate delete never counts here.
  const droppedTurns = base.length - capped.length;

  const writeThread = async (ts: Turn[]): Promise<void> => {
    const thread: StoredThread = {
      version: CONV_STORE_VERSION,
      origin,
      turns: ts,
      updatedAt: now,
      ...(tombstones.length > 0 ? { tombstones } : {}),
      ...(options.writer !== undefined ? { writer: options.writer } : {}),
      ...(stored.clearedAt !== undefined ? { clearedAt: stored.clearedAt } : {}),
    };
    await chrome.storage.local.set({ [threadKey(origin)]: thread });
  };

  // Index first: an entry with no blob loads as [], while a blob with no entry is invisible dead bytes.
  let indexError: unknown = null;
  let indexEvicted: EvictedConversation[] = [];
  try {
    indexEvicted = await commitIndex([
      { origin, updatedAt: now, bytes: serialisedArrayBytes(sized), ...entryFacts(capped) },
    ]);
  } catch (e) {
    // The blob below still loads by key, but nothing lists it — the caller has to hear about it.
    indexError = e;
  }

  let evictedQuota: EvictedConversation | undefined;
  let shedImages = false;
  try {
    await writeThread(capped);
  } catch (e) {
    if (!isQuotaError(e)) throw e;
    // Our own image payloads go before another origin's whole thread; the text stays either way.
    const lean = shedForQuota(capped);
    if (lean !== null) {
      try {
        await writeThread(lean);
        shedImages = true;
      } catch (retryError) {
        if (!isQuotaError(retryError)) throw retryError;
      }
    }
    if (!shedImages) {
      evictedQuota = await evictOldestOtherThread(origin);
      await writeThread(capped);
    }
  }

  if (indexError !== null) throw indexError;
  // The routine LRU eviction is as much a deletion as the quota-retry one, so both reach the toast.
  const evicted = evictedQuota ?? indexEvicted[0];
  return {
    ...(evicted !== undefined ? { evicted } : {}),
    ...(droppedTurns > 0 ? { droppedTurns } : {}),
    ...(shedImages ? { shedImages } : {}),
    ...(refused.length > 0 ? { refusedIds: refused } : {}),
  };
}
