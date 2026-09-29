import { STORAGE_KEYS } from './constants';
import { makeCrossContextLock } from './utils/cross-context-lock';

/** Seed the SW deposits when an image translate fires before the side panel has mounted, so the arriving chunks find a matching turn id. */
export interface PendingImageSeed {
  requestId: string;
  imageUrl: string;
  /** Which vision arm ran. Absent on a v0 seed, which decodes as translate. */
  task?: 'translate' | 'explain';
  /** Date.now() at enqueue. Absent on a v0 seed, which decodes as fresh. */
  ts?: number;
  /** Browser window the click came from; a panel in another window leaves it in the slot. */
  windowId?: number;
}

export type PendingImageSeedMap = Record<string, PendingImageSeed>;

/** Older seeds are dropped on drain: a translate dispatched while the panel was closed would otherwise seed a turn that never finishes. */
export const MAX_IMAGE_SEED_AGE_MS = 60_000;

// The SW enqueues while any open panel drains or removes — one shared lock across those realms.
const lock = makeCrossContextLock('ega:image-seed');

function decodeSeed(raw: Record<string, unknown>): PendingImageSeed | null {
  if (typeof raw['requestId'] !== 'string' || typeof raw['imageUrl'] !== 'string') {
    return null;
  }
  const ts = raw['ts'];
  const task = raw['task'];
  const windowId = raw['windowId'];
  return {
    requestId: raw['requestId'],
    imageUrl: raw['imageUrl'],
    ...(task === 'translate' || task === 'explain' ? { task } : {}),
    ...(typeof ts === 'number' ? { ts } : {}),
    ...(typeof windowId === 'number' ? { windowId } : {}),
  };
}

function decodeStored(raw: unknown, now: number): PendingImageSeedMap {
  if (raw === null || typeof raw !== 'object') return {};
  const rec = raw as Record<string, unknown>;
  const fresh = (s: PendingImageSeed): boolean =>
    s.ts === undefined || now - s.ts <= MAX_IMAGE_SEED_AGE_MS;
  // v0 fallback: promote a bare `{requestId, imageUrl}` into the keyed map.
  const bare = decodeSeed(rec);
  if (bare !== null) {
    return fresh(bare) ? { [bare.requestId]: bare } : {};
  }
  const out: PendingImageSeedMap = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v === null || typeof v !== 'object') continue;
    const seed = decodeSeed(v as Record<string, unknown>);
    if (seed !== null && fresh(seed)) out[k] = seed;
  }
  return out;
}

async function readMap(): Promise<PendingImageSeedMap> {
  const out = await chrome.storage.session.get(STORAGE_KEYS.pendingImageSeed);
  return decodeStored((out as Record<string, unknown>)[STORAGE_KEYS.pendingImageSeed], Date.now());
}

/** Append a seed to the keyed map. Stamps `ts` when the caller leaves it unset. */
export function enqueuePendingImageSeed(seed: PendingImageSeed): Promise<void> {
  return lock(async () => {
    const cur = await readMap();
    cur[seed.requestId] = { ...seed, ts: seed.ts ?? Date.now() };
    await chrome.storage.session.set({ [STORAGE_KEYS.pendingImageSeed]: cur });
  });
}

/** An open panel seeded this request from the runtime message, so a later mount must not rebuild it. */
export function removePendingImageSeed(requestId: string): Promise<void> {
  return lock(async () => {
    const rawGet = await chrome.storage.session.get(STORAGE_KEYS.pendingImageSeed);
    const raw = (rawGet as Record<string, unknown>)[STORAGE_KEYS.pendingImageSeed];
    if (raw === undefined) return;
    const cur = decodeStored(raw, Date.now());
    if (cur[requestId] === undefined) return;
    delete cur[requestId];
    if (Object.keys(cur).length === 0) {
      await chrome.storage.session.remove(STORAGE_KEYS.pendingImageSeed);
    } else {
      await chrome.storage.session.set({ [STORAGE_KEYS.pendingImageSeed]: cur });
    }
  });
}

/** Seed belongs to this panel when either side does not know its window (fail open), or the ids match. */
function seedIsForWindow(seed: PendingImageSeed, windowId: number | undefined): boolean {
  return seed.windowId === undefined || windowId === undefined || seed.windowId === windowId;
}

/** Drain this window's fresh seeds atomically and drop stale ones; another window's seeds stay in the slot for its own panel. */
export function drainPendingImageSeeds(windowId?: number): Promise<readonly PendingImageSeed[]> {
  return lock(async () => {
    // Gate the write on the raw slot: a slot holding only stale seeds decodes empty but must still be cleared.
    const rawGet = await chrome.storage.session.get(STORAGE_KEYS.pendingImageSeed);
    const hadRaw = (rawGet as Record<string, unknown>)[STORAGE_KEYS.pendingImageSeed] !== undefined;
    const cur = decodeStored(
      (rawGet as Record<string, unknown>)[STORAGE_KEYS.pendingImageSeed],
      Date.now(),
    );
    const mine: PendingImageSeed[] = [];
    const others: PendingImageSeedMap = {};
    for (const [k, seed] of Object.entries(cur)) {
      if (seedIsForWindow(seed, windowId)) mine.push(seed);
      else others[k] = seed;
    }
    if (Object.keys(others).length > 0) {
      await chrome.storage.session.set({ [STORAGE_KEYS.pendingImageSeed]: others });
    } else if (hadRaw) {
      await chrome.storage.session.remove(STORAGE_KEYS.pendingImageSeed);
    }
    return mine;
  });
}
