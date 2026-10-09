// Thread key names and the index, shared so the options page can list and delete side panel threads.
import { withConversationLock } from './conversation-lock';
import { IMAGE_TURN_PLACEHOLDER } from './constants';
import { sendMsg } from './messages';

export const CONV_STORE_VERSION = 1;
/** Every page that is not http(s) shares this one thread. */
export const GENERAL_ORIGIN = 'general';
export const THREAD_KEY_PREFIX = 'ega:conv:t:';
/** Removed only when every thread goes, so its disappearance is how a surface learns the threads are gone. */
export const INDEX_KEY = 'ega:conv:index';
/** What an emptied thread's turn list serializes to: `[]`. */
export const EMPTY_THREAD_BYTES = 2;

/** The storage key a `chrome.storage.onChanged` payload carries for this origin's thread. */
export function threadKey(origin: string): string {
  return `${THREAD_KEY_PREFIX}${origin}`;
}

export interface IndexEntry {
  /** Conversation id = the thread key suffix. A thread saved before a site could hold several has its site origin as id. */
  origin: string;
  updatedAt: number;
  /** Serialized size of the thread; feeds the total-bytes eviction budget. */
  bytes: number;
  /** First user message, first line, trimmed, at most 80 characters. Absent: no user message yet, or not backfilled. */
  title?: string;
  /** The first user message is an image with no text: the list shows "Image". */
  imageFirst?: true;
  /** Turns stored, user and assistant. */
  messages?: number;
  /** createdAt of the first stored turn. */
  createdAt?: number;
  /** Last time the user opened this conversation from the list. */
  openedAt?: number;
}

interface StoredIndex {
  version: number;
  threads: IndexEntry[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object';
}

/** Tolerant reader: a fact of the wrong type is dropped, the row stays. */
function cleanEntry(t: Record<string, unknown>): IndexEntry {
  const e = { ...t } as unknown as IndexEntry & Record<string, unknown>;
  if (typeof e['title'] !== 'string') delete e.title;
  if (e['imageFirst'] !== true) delete e.imageFirst;
  for (const k of ['messages', 'createdAt', 'openedAt'] as const) {
    if (!Number.isFinite(e[k])) delete e[k];
  }
  return e;
}

/** null = an index this build cannot read. Callers must not treat that as "no threads exist". */
export function parseIndex(raw: unknown): StoredIndex | null {
  if (!isRecord(raw)) return null;
  if (raw['version'] !== CONV_STORE_VERSION || !Array.isArray(raw['threads'])) return null;
  // An entry without bytes can't count against the eviction budget — drop it; the orphan sweep reclaims its blob.
  const threads = (raw['threads'] as unknown[])
    .filter(
      (t): t is Record<string, unknown> =>
        isRecord(t) && typeof t['bytes'] === 'number' && typeof t['origin'] === 'string',
    )
    .map(cleanEntry);
  return { version: CONV_STORE_VERSION, threads };
}

/** The site a conversation belongs to. An origin never holds `#`, so this is exact for every id. */
export function siteOf(id: string): string {
  return id.split('#')[0] ?? id;
}

/** A fresh conversation for `site`: time plus four random base-36 characters. */
export function newConversationId(
  site: string,
  now: number = Date.now(),
  rand: () => number = Math.random,
): string {
  const tail = Array.from({ length: 4 }, () => Math.floor(rand() * 36).toString(36)).join('');
  return `${site}#${now.toString(36)}${tail}`;
}

/** The conversation the panel opens on `site`: its non-empty one touched last. No pointer is stored, so none can dangle. */
export function currentConversation(
  entries: readonly IndexEntry[],
  site: string,
  excluded: ReadonlySet<string> = new Set(),
): string | null {
  let best: IndexEntry | null = null;
  for (const e of entries) {
    if (siteOf(e.origin) !== site || e.bytes <= EMPTY_THREAD_BYTES || excluded.has(e.origin)) {
      continue;
    }
    const touched = Math.max(e.updatedAt, e.openedAt ?? 0);
    if (best === null || touched > Math.max(best.updatedAt, best.openedAt ?? 0)) best = e;
  }
  return best?.origin ?? null;
}

/** The Conversations list: this site first, then the others, each newest first. */
export function groupConversations(
  entries: readonly IndexEntry[],
  site: string,
): { thisSite: IndexEntry[]; otherSites: IndexEntry[] } {
  const live = entries
    .filter((e) => e.bytes > EMPTY_THREAD_BYTES)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    thisSite: live.filter((e) => siteOf(e.origin) === site),
    otherSites: live.filter((e) => siteOf(e.origin) !== site),
  };
}

const TITLE_MAX = 80;

/** What the list shows of a thread, read structurally so shared code needs no side panel types. */
export function entryFacts(
  rawTurns: readonly unknown[],
): Pick<IndexEntry, 'title' | 'imageFirst' | 'messages' | 'createdAt'> {
  const turns = rawTurns.filter(isRecord);
  const first = turns.find((t) => t['role'] === 'user');
  const out: Pick<IndexEntry, 'title' | 'imageFirst' | 'messages' | 'createdAt'> = {
    messages: turns.length,
  };
  const created = turns[0]?.['createdAt'];
  if (typeof created === 'number' && Number.isFinite(created)) out.createdAt = created;
  if (first === undefined) return out;
  const content = typeof first['content'] === 'string' ? first['content'] : '';
  const hasImage = typeof first['imageDataUrl'] === 'string' || first['imageShed'] === true;
  const line = (content.split('\n').find((l) => l.trim() !== '') ?? '').trim();
  if (
    hasImage &&
    (line === '' || line === IMAGE_TURN_PLACEHOLDER || line.startsWith('[image removed'))
  ) {
    out.imageFirst = true;
    return out;
  }
  if (line !== '') out.title = Array.from(line).slice(0, TITLE_MAX).join('');
  return out;
}

export async function readIndex(): Promise<StoredIndex> {
  const r = await chrome.storage.local.get(INDEX_KEY);
  return parseIndex(r[INDEX_KEY]) ?? { version: CONV_STORE_VERSION, threads: [] };
}

/** `getKeys` lists key names only; the `get(null)` fallback copies settings, the audit log
 *  and every thread into this page just to learn the same names. */
export async function storedKeys(): Promise<string[]> {
  const area = chrome.storage.local as typeof chrome.storage.local & {
    getKeys?: () => Promise<string[]>;
  };
  if (typeof area.getKeys === 'function') return await area.getKeys();
  return Object.keys(await chrome.storage.local.get(null));
}

/** Threads that still hold turns, newest first; an emptied thread keeps its row for its tombstones. */
export async function listSavedConversations(): Promise<IndexEntry[]> {
  const { threads } = await readIndex();
  return threads
    .filter((t) => t.bytes > EMPTY_THREAD_BYTES)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Every listed conversation with its facts. Rows saved before the facts existed are filled once from their blobs; nothing is written when nothing was filled. */
export async function listConversations(): Promise<IndexEntry[]> {
  const { threads } = await readIndex();
  const missing = threads.filter((t) => t.bytes > EMPTY_THREAD_BYTES && t.messages === undefined);
  if (missing.length === 0) return threads;
  try {
    return await withConversationLock(async () => {
      const got = await chrome.storage.local.get([
        INDEX_KEY,
        ...missing.map((t) => threadKey(t.origin)),
      ]);
      const index = parseIndex(got[INDEX_KEY]);
      if (index === null) return threads;
      let filled = 0;
      const next = index.threads.map((t) => {
        if (t.messages !== undefined) return t;
        const blob = got[threadKey(t.origin)];
        if (!isRecord(blob) || !Array.isArray(blob['turns'])) return t;
        filled++;
        return { ...t, ...entryFacts(blob['turns'] as unknown[]) };
      });
      if (filled > 0) {
        await chrome.storage.local.set({
          [INDEX_KEY]: { version: CONV_STORE_VERSION, threads: next },
        });
      }
      return next;
    });
  } catch {
    // The list still shows; rows without titles read "New conversation" and the next list retries.
    return threads;
  }
}

/** The user opened `id` from the list, so it becomes its site's current conversation. A draft with no row is left alone. */
export function markConversationOpened(id: string, now: number = Date.now()): Promise<void> {
  return withConversationLock(async () => {
    const r = await chrome.storage.local.get(INDEX_KEY);
    const index = parseIndex(r[INDEX_KEY]);
    if (!index?.threads.some((t) => t.origin === id)) return;
    const threads = index.threads.map((t) => (t.origin === id ? { ...t, openedAt: now } : t));
    await chrome.storage.local.set({ [INDEX_KEY]: { version: CONV_STORE_VERSION, threads } });
  });
}

/** The site without `https://`; http keeps its scheme so the two never read as one row. */
export function conversationLabel(id: string): string {
  const site = siteOf(id);
  return site === GENERAL_ORIGIN ? 'Other pages' : site.replace(/^https:\/\//, '');
}

/** Buries every stored turn and stamps the moment, so an open panel drops every older turn, the ones the size cap left only in its memory included, and cannot save them back. */
export function deleteSavedConversation(origin: string): Promise<void> {
  return withConversationLock(async () => {
    const key = threadKey(origin);
    const got = await chrome.storage.local.get([key, INDEX_KEY]);
    const blob = got[key];
    const now = Date.now();
    const buried =
      isRecord(blob) && blob['version'] === CONV_STORE_VERSION && Array.isArray(blob['turns']);
    if (buried) {
      const ids = (blob['turns'] as unknown[]).flatMap((t) =>
        isRecord(t) && typeof t['id'] === 'string' ? [t['id']] : [],
      );
      const fresh = new Set(ids);
      const older = Array.isArray(blob['tombstones'])
        ? (blob['tombstones'] as unknown[]).filter(
            (t) => !(isRecord(t) && fresh.has(t['id'] as string)),
          )
        : [];
      // No writer stamp: every open panel, the one that saved last included, must read this as another window's write.
      const { writer: _writer, ...rest } = blob;
      void _writer;
      await chrome.storage.local.set({
        [key]: {
          ...rest,
          turns: [],
          updatedAt: now,
          clearedAt: now,
          tombstones: [...ids.map((id) => ({ id, at: now })), ...older],
        },
      });
    } else {
      // The user asked for this row gone, and a blob no panel can read has no turns to bury.
      await chrome.storage.local.remove(key);
    }
    const index = parseIndex(got[INDEX_KEY]);
    // An index this build cannot read is left as it is.
    if (index === null) return;
    const others = index.threads.filter((t) => t.origin !== origin);
    const threads = buried
      ? [...others, { origin, updatedAt: now, bytes: EMPTY_THREAD_BYTES }]
      : others;
    await chrome.storage.local.set({ [INDEX_KEY]: { version: CONV_STORE_VERSION, threads } });
  });
}

/** A missing index is how an open side panel learns every thread is gone, as after Delete all data. */
export function clearSavedConversations(): Promise<void> {
  return withConversationLock(async () => {
    const keys = (await storedKeys()).filter((k) => k.startsWith(THREAD_KEY_PREFIX));
    await chrome.storage.local.remove([...keys, INDEX_KEY]);
  });
}

interface PendingDelete {
  ids: readonly string[] | 'all';
  timer: ReturnType<typeof setTimeout> | null;
  onFail: (() => void) | undefined;
  onDone: (() => void) | undefined;
}

/** Deletes waiting out their Undo window in this page. */
const pending = new Set<PendingDelete>();

/** The worker finishes the delete, so closing the page right after cannot bring the conversation back. */
function commitDelete(p: PendingDelete): void {
  if (p.timer !== null) clearTimeout(p.timer);
  if (!pending.delete(p)) return;
  sendMsg({ kind: 'conversations:delete', ids: p.ids === 'all' ? 'all' : [...p.ids] })
    .then((r) => {
      if (r?.ok !== true) throw new Error('conversations:delete refused');
      p.onDone?.();
    })
    .catch(() => p.onFail?.());
}

/** Deletes after `ms` unless undone; `onFail` runs when the worker could not delete, and the conversation is kept. */
export function scheduleConversationDelete(
  ids: readonly string[] | 'all',
  opts: { ms?: number | null; onFail?: () => void; onDone?: () => void } = {},
): { undo: () => void; commit: () => void } {
  const p: PendingDelete = {
    ids,
    onFail: opts.onFail,
    onDone: opts.onDone,
    // A pausable Undo toast owns its deadline; page close still flushes the pending record.
    timer: opts.ms === null ? null : setTimeout(() => commitDelete(p), opts.ms ?? 8000),
  };
  pending.add(p);
  return {
    undo: () => {
      if (p.timer !== null) clearTimeout(p.timer);
      pending.delete(p);
    },
    commit: () => commitDelete(p),
  };
}

/** Ids a list or the "current" pick must already treat as gone. */
export function pendingDeleteIds(): ReadonlySet<string> {
  const out = new Set<string>();
  for (const p of pending) if (p.ids !== 'all') for (const id of p.ids) out.add(id);
  return out;
}

/** The page is closing or storage is being wiped: send every waiting delete now. */
export function flushPendingDeletes(): void {
  for (const p of [...pending]) commitDelete(p);
}

/** Drops waiting deletes without sending them, after "Delete all data" already removed everything. */
export function forgetPendingDeletes(): void {
  for (const p of pending) if (p.timer !== null) clearTimeout(p.timer);
  pending.clear();
}
