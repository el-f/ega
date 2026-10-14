import { makeCrossContextLock } from './utils/cross-context-lock';

/** Window-scoped intent so Settings can open an existing thread in either a new or mounted panel. */
const PREFIX = 'ega.pendingConversationOpen:';
const MAX_AGE_MS = 60_000;
const lock = makeCrossContextLock('ega:conversation-open');

export const conversationOpenKey = (windowId: number): string => `${PREFIX}${windowId}`;

export function queueConversationOpen(id: string, windowId: number): Promise<void> {
  return lock(() =>
    chrome.storage.session.set({
      [conversationOpenKey(windowId)]: { id, ts: Date.now() },
    }),
  );
}

/** Consume once under the same cross-context lock as the writer. Another window's choice stays queued. */
export function takeConversationOpen(windowId: number | undefined): Promise<string | null> {
  if (windowId === undefined) return Promise.resolve(null);
  return lock(async () => {
    const key = conversationOpenKey(windowId);
    const raw: unknown = (await chrome.storage.session.get(key))[key];
    if (raw === undefined) return null;
    await chrome.storage.session.remove(key);
    if (raw === null || typeof raw !== 'object') return null;
    const entry = raw as Record<string, unknown>;
    const age = Date.now() - Number(entry['ts']);
    return typeof entry['id'] === 'string' &&
      entry['id'].length > 0 &&
      entry['id'].length <= 4096 &&
      typeof entry['ts'] === 'number' &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= MAX_AGE_MS
      ? entry['id']
      : null;
  });
}
