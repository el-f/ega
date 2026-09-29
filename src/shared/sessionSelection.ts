import { debugCatch } from '@/shared/logger';

import { DEFAULT_SESSION_SELECTION_TTL_MS, MAX_SELECTION_CHARS } from './constants';

const KEY = 'ega.lastSelection';
const TTL_MS = DEFAULT_SESSION_SELECTION_TTL_MS;

interface StoredSelection {
  text: string;
  ts: number;
  origin: string;
  tabId: number | null;
}

/** Empty text is ignored: a selectionchange on focus loss must not clobber the cache. */
export async function putSelection(
  text: string,
  origin: string,
  tabId: number | null,
): Promise<void> {
  if (!text || text.length === 0) return;
  // Trust boundary for the popup prefill — a page can fire selectionchange with multi-MB text.
  const capped = text.length > MAX_SELECTION_CHARS ? text.slice(0, MAX_SELECTION_CHARS) : text;
  try {
    /* eslint-disable @typescript-eslint/no-unnecessary-condition -- jsdom has no chrome global */
    const session = globalThis.chrome?.storage?.session;
    if (!session) return;
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
    const payload: StoredSelection = { text: capped, ts: Date.now(), origin, tabId };
    await session.set({ [KEY]: payload });
  } catch (e) {
    debugCatch(e, 'shared.sessionSelection.1');
  }
}

/** Returns null on every failure mode: no cache, another origin's entry, stale entry, thrown error. */
export async function getFreshSelection(
  expectedOrigin: string | null,
  ttlMs: number = TTL_MS,
): Promise<string | null> {
  // A caller that cannot name the tab's origin gets nothing, or it prefills whatever the last tab selected.
  if (expectedOrigin === null) return null;
  try {
    /* eslint-disable @typescript-eslint/no-unnecessary-condition */
    const session = globalThis.chrome?.storage?.session;
    if (!session) return null;
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
    const out = (await session.get(KEY)) as Record<string, unknown>;
    const s = out[KEY] as StoredSelection | undefined;
    if (!s) return null;
    if (typeof s.text !== 'string' || s.text.length === 0) return null;
    if (s.origin !== expectedOrigin) return null;
    if (typeof s.ts !== 'number' || Date.now() - s.ts > ttlMs) return null;
    return s.text;
  } catch {
    return null;
  }
}
