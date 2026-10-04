// A storage.local listener receives every change in full, side-panel threads and the audit log included.
import { STORAGE_KEYS } from './constants';
import { isFromOwnBackground } from './messages';

type Changes = Record<string, chrome.storage.StorageChange>;

/** The keys a content script mirrors; the worker names the ones that changed in `content:storage-changed`. */
export const CONTENT_MIRRORED_KEYS: readonly string[] = [
  STORAGE_KEYS.settings,
  STORAGE_KEYS.customLanguages,
  STORAGE_KEYS.customTasks,
];

let viaWorker = false;

/** A content script calls this before anything subscribes, so no page renderer gets each thread save. */
export function takeStoredChangesFromWorker(): void {
  viaWorker = true;
}

/** storage.local changes; in a content script, the worker's note of which mirrored keys changed (no values). */
export function onStoredChange(handler: (changes: Changes) => void): () => void {
  if (!viaWorker) {
    chrome.storage.local.onChanged.addListener(handler);
    return () => chrome.storage.local.onChanged.removeListener(handler);
  }
  const listener = (msg: unknown, sender: chrome.runtime.MessageSender): false => {
    const m = msg as { kind?: unknown; keys?: unknown } | null;
    if (!isFromOwnBackground(sender) || m?.kind !== 'content:storage-changed') return false;
    if (!Array.isArray(m.keys)) return false;
    const keys = m.keys.filter((k): k is string => CONTENT_MIRRORED_KEYS.includes(k as string));
    if (keys.length > 0) handler(Object.fromEntries(keys.map((k) => [k, {}])));
    return false;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
