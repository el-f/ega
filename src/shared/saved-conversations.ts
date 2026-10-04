// Thread key names and the index, shared so the options page can list and delete side panel threads.
import { withConversationLock } from './conversation-lock';

export const CONV_STORE_VERSION = 1;
/** Every page that is not http(s) shares this one thread. */
export const GENERAL_ORIGIN = 'general';
export const THREAD_KEY_PREFIX = 'ega:conv:t:';
/** Removed only when every thread goes, so its disappearance is how a surface learns the threads are gone. */
export const INDEX_KEY = 'ega:conv:index';
/** What an emptied thread's turn list serializes to: `[]`. */
const EMPTY_THREAD_BYTES = 2;

/** The storage key a `chrome.storage.onChanged` payload carries for this origin's thread. */
export function threadKey(origin: string): string {
  return `${THREAD_KEY_PREFIX}${origin}`;
}

export interface IndexEntry {
  origin: string;
  updatedAt: number;
  /** Serialized size of the thread; feeds the total-bytes eviction budget. */
  bytes: number;
}

interface StoredIndex {
  version: number;
  threads: IndexEntry[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object';
}

/** null = an index this build cannot read. Callers must not treat that as "no threads exist". */
export function parseIndex(raw: unknown): StoredIndex | null {
  if (!isRecord(raw)) return null;
  if (raw['version'] !== CONV_STORE_VERSION || !Array.isArray(raw['threads'])) return null;
  // An entry without bytes can't count against the eviction budget — drop it; the orphan sweep reclaims its blob.
  const threads = (raw['threads'] as unknown[]).filter(
    (t): t is IndexEntry =>
      isRecord(t) && typeof t['bytes'] === 'number' && typeof t['origin'] === 'string',
  );
  return { version: CONV_STORE_VERSION, threads };
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

/** The site without `https://`; http keeps its scheme so the two never read as one row. */
export function conversationLabel(origin: string): string {
  return origin === GENERAL_ORIGIN ? 'Other pages' : origin.replace(/^https:\/\//, '');
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
