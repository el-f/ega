import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  drainPendingImageSeeds,
  enqueuePendingImageSeed,
  MAX_IMAGE_SEED_AGE_MS,
} from '@/shared/pending-image-seed';

describe('pending-image-seed', () => {
  beforeEach(async () => {
    await chrome.storage.session.remove(STORAGE_KEYS.pendingImageSeed);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('drain returns [] when nothing queued', async () => {
    const seeds = await drainPendingImageSeeds();
    expect(seeds).toEqual([]);
  });

  it('enqueue stores keyed by requestId; drain returns + clears', async () => {
    await enqueuePendingImageSeed({ requestId: 'r1', imageUrl: 'a' });
    const seeds = await drainPendingImageSeeds();
    expect(seeds).toEqual([expect.objectContaining({ requestId: 'r1', imageUrl: 'a' })]);
    const drainedAgain = await drainPendingImageSeeds();
    expect(drainedAgain).toEqual([]);
  });

  it('two enqueues in same tick both land — no single-slot overwrite', async () => {
    const a = enqueuePendingImageSeed({ requestId: 'r1', imageUrl: 'a' });
    const b = enqueuePendingImageSeed({ requestId: 'r2', imageUrl: 'b' });
    await Promise.all([a, b]);
    const seeds = await drainPendingImageSeeds();
    const byId = Object.fromEntries(seeds.map((s) => [s.requestId, s.imageUrl]));
    expect(byId).toEqual({ r1: 'a', r2: 'b' });
  });

  it('decodes legacy single-slot {requestId, imageUrl} shape', async () => {
    // Pre-upgrade SW state — bare seed, not keyed. Drain promotes it.
    await chrome.storage.session.set({
      [STORAGE_KEYS.pendingImageSeed]: { requestId: 'legacy', imageUrl: 'x' },
    });
    const seeds = await drainPendingImageSeeds();
    expect(seeds).toEqual([{ requestId: 'legacy', imageUrl: 'x' }]);
  });

  it('drain clears slot only when something was drained', async () => {
    await drainPendingImageSeeds();
    const stored = await chrome.storage.session.get(STORAGE_KEYS.pendingImageSeed);
    expect(stored[STORAGE_KEYS.pendingImageSeed]).toBeUndefined();
  });

  it('drain drops a seed older than the TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    await enqueuePendingImageSeed({ requestId: 'stale', imageUrl: 'a' });
    // Advance past the TTL — the panel opens much later than the dispatch.
    vi.setSystemTime(MAX_IMAGE_SEED_AGE_MS + 1);
    const seeds = await drainPendingImageSeeds();
    expect(seeds).toEqual([]);
    // Slot cleared even though every seed was stale — no storage leak.
    const stored = await chrome.storage.session.get(STORAGE_KEYS.pendingImageSeed);
    expect(stored[STORAGE_KEYS.pendingImageSeed]).toBeUndefined();
  });

  it('drain keeps a seed within the TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    await enqueuePendingImageSeed({ requestId: 'fresh', imageUrl: 'a' });
    vi.setSystemTime(MAX_IMAGE_SEED_AGE_MS - 1);
    const seeds = await drainPendingImageSeeds();
    expect(seeds.map((s) => s.requestId)).toEqual(['fresh']);
  });

  it('decodes legacy seed with no ts as fresh', async () => {
    // v0 bare shape, no timestamp — must not be dropped by the age gate.
    await chrome.storage.session.set({
      [STORAGE_KEYS.pendingImageSeed]: { requestId: 'legacy', imageUrl: 'x' },
    });
    const seeds = await drainPendingImageSeeds();
    expect(seeds).toEqual([{ requestId: 'legacy', imageUrl: 'x' }]);
  });
});

describe('window scoping', () => {
  it("a panel drains only its own window's seeds and leaves the other window's in the slot", async () => {
    await enqueuePendingImageSeed({ requestId: 'w1', imageUrl: 'a', windowId: 1 });
    await enqueuePendingImageSeed({ requestId: 'w2', imageUrl: 'b', windowId: 2 });
    await enqueuePendingImageSeed({ requestId: 'any', imageUrl: 'c' });
    const first = await drainPendingImageSeeds(1);
    expect(first.map((s) => s.requestId).sort()).toEqual(['any', 'w1']);
    const second = await drainPendingImageSeeds(2);
    expect(second.map((s) => s.requestId)).toEqual(['w2']);
    expect(await drainPendingImageSeeds(2)).toEqual([]);
  });

  it('a panel that does not know its window drains everything (fail open)', async () => {
    await enqueuePendingImageSeed({ requestId: 'w1', imageUrl: 'a', windowId: 1 });
    expect((await drainPendingImageSeeds()).map((s) => s.requestId)).toEqual(['w1']);
  });
});
