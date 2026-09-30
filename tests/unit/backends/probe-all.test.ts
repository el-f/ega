import { describe, it, expect, vi } from 'vitest';
import { probeAll } from '@/shared/backends/probe-all';
import type { TranslationBackend, BackendConfig } from '@/shared/backends/base';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkBackend(id: string, isAvailable: () => Promise<boolean>): TranslationBackend {
  return { id: bid(id), manifest: testManifest(id), isAvailable, translate: async () => {} };
}

const cfg: BackendConfig = {} as BackendConfig;

describe('probeAll — parallel availability probe', () => {
  it('returns a map keyed by every registered backend id, even those that probe false', async () => {
    const a = mkBackend('anthropic', async () => true);
    const b = mkBackend('openai', async () => false);
    const c = mkBackend('native', async () => true);
    const map = await probeAll([a, b, c], cfg);
    // Keys: every id must appear, even when isAvailable returns false.
    expect(Object.keys(map).sort()).toEqual(['anthropic', 'native', 'openai']);
    expect(map['anthropic']).toBe(true);
    expect(map['openai']).toBe(false);
    expect(map['native']).toBe(true);
  });

  it('returns empty map for empty backend list', async () => {
    const map = await probeAll([], cfg);
    expect(map).toEqual({});
  });

  it('probes run in parallel, not sequentially', async () => {
    // Peak concurrency, not elapsed time: a wall-clock bound flakes under load.
    let inFlight = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    const makeGated = (id: string): TranslationBackend =>
      mkBackend(id, async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((r) => release.push(r));
        inFlight -= 1;
        return true;
      });

    const done = probeAll([makeGated('a'), makeGated('b'), makeGated('c')], cfg);
    // Let every probe reach its await before any of them is allowed to finish.
    await Promise.resolve();
    await Promise.resolve();
    for (const r of release) r();
    await done;

    expect(peak).toBe(3);
  });

  it('passes the provided config to each isAvailable call', async () => {
    const probeSpy = vi.fn(async () => true);
    const b = mkBackend('anthropic', probeSpy);
    const myConfig = { token: 'xyz' } as unknown as BackendConfig;
    await probeAll([b], myConfig);
    expect(probeSpy).toHaveBeenCalledWith(myConfig);
  });

  it('all-false probes still produce a fully-populated map', async () => {
    const backends = [
      mkBackend('anthropic', async () => false),
      mkBackend('openai', async () => false),
    ];
    const map = await probeAll(backends, cfg);
    expect(map).toEqual({ anthropic: false, openai: false });
  });

  it('keys the map in backend order even when the probes finish out of order', async () => {
    // defaultProbe falls back to walking Object.entries(map), so the seeding loop fixes order, not the awaits.
    const settle: Array<() => void> = [];
    const gated = (id: string): TranslationBackend =>
      mkBackend(id, async () => {
        await new Promise<void>((r) => settle.push(r));
        return true;
      });

    const done = probeAll([gated('first'), gated('second'), gated('third')], cfg);
    await Promise.resolve();
    await Promise.resolve();
    for (const r of settle.reverse()) r();

    expect(Object.keys(await done)).toEqual(['first', 'second', 'third']);
  });

  it('preserves the id the backend reports, not the array index', async () => {
    // Kills any mutation that swaps `b.id` → something derived from
    // the array index.
    const b = mkBackend('my-custom-id', async () => true);
    const map = await probeAll([b], cfg);
    expect(map['my-custom-id']).toBe(true);
    expect(Object.keys(map)).toEqual(['my-custom-id']);
  });
});
