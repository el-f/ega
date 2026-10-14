import type { BackendId } from './types';
import { decodeOrFallback } from './utils/decode-stored';

const STORAGE_KEY_PREFIX = 'ega:discovery:';
const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  models: string[];
  fetchedAt: number;
  keyHash: string;
}

/** djb2, not crypto: the key only has to change when the API key does. */
function hashKey(apiKey: string): string {
  let h = 5381;
  for (let i = 0; i < apiKey.length; i++) h = ((h << 5) + h + apiKey.charCodeAt(i)) | 0;
  return h.toString(36);
}

function storageKey(backendId: BackendId): string {
  return `${STORAGE_KEY_PREFIX}${backendId}`;
}

function isCacheEntry(x: unknown): x is CacheEntry {
  if (x === null || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    Array.isArray(e['models']) &&
    e['models'].every((m) => typeof m === 'string') &&
    typeof e['fetchedAt'] === 'number' &&
    typeof e['keyHash'] === 'string'
  );
}

/** Cached models when fresh and built for this API key, else null; session storage, so entries die with the browser session. */
export async function readDiscoveryCache(
  backendId: BackendId,
  apiKey: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string[] | null> {
  const key = storageKey(backendId);
  const stored = (await chrome.storage.session.get(key)) as Record<string, unknown>;
  const entry = decodeOrFallback(stored[key], isCacheEntry, null);
  if (!entry) return null;
  if (entry.keyHash !== hashKey(apiKey)) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) return null;
  return entry.models;
}

export async function writeDiscoveryCache(
  backendId: BackendId,
  apiKey: string,
  models: string[],
): Promise<void> {
  const entry: CacheEntry = { models, fetchedAt: Date.now(), keyHash: hashKey(apiKey) };
  await chrome.storage.session.set({ [storageKey(backendId)]: entry });
}

export async function invalidateDiscoveryCache(backendId: BackendId): Promise<void> {
  await chrome.storage.session.remove(storageKey(backendId));
}
