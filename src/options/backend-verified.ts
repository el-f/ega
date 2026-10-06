import { lookupModelId } from '@/shared/settings-schema';
import { backendNeedsKey } from '@/shared/backends/key-presence';
import { apiKeyField } from '@/shared/provider-ids';
import type { BackendId, Settings } from '@/shared/types';

/**
 * The last passed key test per backend: machine state, so it lives outside the settings row (never synced,
 * never exported) and Delete all data clears it. A row belongs to the key, model and address it ran with:
 * any change gives a new fingerprint, and the old row reads as not verified with no write.
 */
export const BACKEND_VERIFIED_KEY = 'ega.backendVerified';

interface Row {
  at: number;
  fp: string;
}
type Store = Partial<Record<string, Row>>;

function inputs(id: BackendId, s: Settings): string {
  const key = backendNeedsKey(id) ? (s[apiKeyField(id)] ?? '') : '';
  const url =
    id === 'ollama' ? (s.ollamaUrl ?? '') : id === 'localserver' ? (s.localServerUrl ?? '') : '';
  return [id, lookupModelId(s.model, id), key, url].join('|');
}

/** First 16 hex characters of SHA-256: no key text is stored. */
export async function verifiedFingerprint(id: BackendId, s: Settings): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inputs(id, s)));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function readStore(): Promise<Store> {
  const raw = (await chrome.storage.local.get(BACKEND_VERIFIED_KEY))[BACKEND_VERIFIED_KEY];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Store = {};
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    const r = row as Partial<Row> | null;
    if (r && typeof r.at === 'number' && typeof r.fp === 'string') out[id] = { at: r.at, fp: r.fp };
  }
  return out;
}

/** When the backend last passed a test with the current key, model and address; null when it has not. */
export async function readVerified(id: BackendId, s: Settings): Promise<number | null> {
  const row = (await readStore())[id];
  if (!row) return null;
  return row.fp === (await verifiedFingerprint(id, s)) ? row.at : null;
}

/** Records a passed test, and drops rows whose inputs have changed since. */
export async function markVerified(id: BackendId, s: Settings, at = Date.now()): Promise<void> {
  const store = await readStore();
  store[id] = { at, fp: await verifiedFingerprint(id, s) };
  const kept: Store = {};
  for (const [rowId, row] of Object.entries(store)) {
    if (row?.fp === (await verifiedFingerprint(rowId as BackendId, s))) kept[rowId] = row;
  }
  await chrome.storage.local.set({ [BACKEND_VERIFIED_KEY]: kept });
}

/** A failed test takes the mark away. */
export async function clearVerified(id: BackendId): Promise<void> {
  const store = await readStore();
  if (!(id in store)) return;
  delete store[id];
  await chrome.storage.local.set({ [BACKEND_VERIFIED_KEY]: store });
}
