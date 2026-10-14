import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAX_ENTRIES, TranslationCache, cacheKey } from '@/background/cache';

describe('cacheKey — a hash of what the model reads', () => {
  const base = { system: 'SYS', user: 'hello', task: 'translate' } as const;

  it('is stable and hash-based', async () => {
    const a = await cacheKey(base);
    expect(await cacheKey({ ...base })).toBe(a);
    expect(a).toHaveLength(64);
  });

  it('splits on the system prompt, the user prompt, the task and the history', async () => {
    const k = await cacheKey(base);
    expect(await cacheKey({ ...base, system: 'SYS2' })).not.toBe(k);
    expect(await cacheKey({ ...base, user: 'hello!' })).not.toBe(k);
    expect(await cacheKey({ ...base, task: 'c-tweet' })).not.toBe(k);
    expect(await cacheKey({ ...base, history: [{ role: 'user', content: 'hi' }] })).not.toBe(k);
  });

  it('an absent history equals an empty one, so single-turn requests share a slot', async () => {
    expect(await cacheKey({ ...base, history: [] })).toBe(await cacheKey(base));
  });

  it('resists separator injection between fields', async () => {
    // A naive '|' join would collide these, and one request would read another's answer.
    expect(await cacheKey({ ...base, system: 'a|b', user: 'c' })).not.toBe(
      await cacheKey({ ...base, system: 'a', user: 'b|c' }),
    );
    expect(
      await cacheKey({ ...base, history: [{ role: 'user', content: 'x' }], user: 'y' }),
    ).not.toBe(await cacheKey({ ...base, history: [{ role: 'user', content: 'xy' }], user: '' }));
  });
});

describe('TranslationCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores and retrieves', async () => {
    const c = new TranslationCache();
    await c.set('k1', { translation: 'v1', confidence: 0.9 });
    expect((await c.get('k1'))?.translation).toBe('v1');
  });

  it('evicts least-recently-used beyond capacity', async () => {
    const c = new TranslationCache();
    // Fill to cap.
    for (let i = 0; i < MAX_ENTRIES; i++) {
      await c.set(`k${i}`, { translation: `v${i}`, confidence: 1 });
    }
    // Touch k0 so it moves to MRU end.
    await c.get('k0');
    // One more set evicts the now-LRU (k1).
    await c.set('overflow', { translation: 'vN', confidence: 1 });
    expect(await c.get('k1')).toBeUndefined();
    expect((await c.get('k0'))?.translation).toBe('v0');
    expect((await c.get('overflow'))?.translation).toBe('vN');
  });

  it('respects TTL (5 min)', async () => {
    const c = new TranslationCache();
    await c.set('x', { translation: 'X', confidence: 1 });
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(await c.get('x')).toBeUndefined();
  });

  it('still serves an entry exactly at the TTL, and drops it one tick later', async () => {
    const c = new TranslationCache();
    await c.set('x', { translation: 'X', confidence: 1 });

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect((await c.get('x'))?.translation).toBe('X');

    vi.advanceTimersByTime(1);
    expect(await c.get('x')).toBeUndefined();
  });

  it('moves the generation forward on every clear, never back', async () => {
    const c = new TranslationCache();
    const first = c.generation();

    await c.clear();
    const second = c.generation();
    await c.clear();

    expect(second).toBe(first + 1);
    expect(c.generation()).toBe(first + 2);
  });

  it('clear removes everything', async () => {
    const c = new TranslationCache();
    await c.set('k', { translation: 'v', confidence: 1 });
    await c.clear();
    expect(await c.get('k')).toBeUndefined();
  });

  it('drops a write whose generation was taken before a clear', async () => {
    const c = new TranslationCache();
    const gen = c.generation();
    await c.clear();
    await c.set('k', { translation: 'stale', confidence: 1 }, gen);
    expect(await c.get('k')).toBeUndefined();
  });

  it('keeps a write whose generation still matches, and an untagged one', async () => {
    const c = new TranslationCache();
    await c.set('k', { translation: 'fresh', confidence: 1 }, c.generation());
    await c.set('u', { translation: 'untagged', confidence: 1 });
    expect((await c.get('k'))?.translation).toBe('fresh');
    expect((await c.get('u'))?.translation).toBe('untagged');
  });
});
