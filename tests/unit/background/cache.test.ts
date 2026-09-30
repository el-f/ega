import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MAX_ENTRIES, TranslationCache, cacheKey } from '@/background/cache';

describe('cacheKey', () => {
  it('is stable and hash-based', async () => {
    const a = await cacheKey({
      text: 'hi',
      langId: 'arabizi',
      targetLang: 'en',
    });
    const b = await cacheKey({
      text: 'hi',
      langId: 'arabizi',
      targetLang: 'en',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('a request carrying page context never shares the no-context slot', async () => {
    const a = await cacheKey({
      text: 'hi',
      langId: 'arabizi',
      targetLang: 'en',
    });
    const c = await cacheKey({
      text: 'hi',
      langId: 'arabizi',
      targetLang: 'en',
      contextDigest: 'ctx-a',
    });
    expect(a).not.toBe(c);
  });

  it('contextDigest is bytes, not presence: two different contexts get two slots', async () => {
    const base = { text: 'hi', langId: 'arabizi', targetLang: 'en' } as const;
    const a = await cacheKey({ ...base, contextDigest: 'ctx-a' });
    const b = await cacheKey({ ...base, contextDigest: 'ctx-b' });
    const aAgain = await cacheKey({ ...base, contextDigest: 'ctx-a' });
    expect(a).not.toBe(b);
    expect(a).toBe(aAgain);
  });

  it('refinement splits the slot: a refined request never hits the plain slot', async () => {
    const plain = await cacheKey({
      text: 'hi',
      langId: 'arabizi',
      targetLang: 'en',
    });
    const refined = await cacheKey({
      text: 'hi',
      langId: 'arabizi',
      targetLang: 'en',
      refinement: 'use pig latin',
    });
    expect(refined).not.toBe(plain);
  });

  it('distinct refinements get distinct slots; identical refinements share one', async () => {
    const base = { text: 'hi', langId: 'arabizi', targetLang: 'en' } as const;
    const pig = await cacheKey({ ...base, refinement: 'use pig latin' });
    const shorter = await cacheKey({ ...base, refinement: 'make it shorter' });
    const pigAgain = await cacheKey({ ...base, refinement: 'use pig latin' });
    expect(pig).not.toBe(shorter);
    expect(pig).toBe(pigAgain);
  });

  it('absent refinement equals empty refinement (back-compat with plain requests)', async () => {
    const base = { text: 'hi', langId: 'arabizi', targetLang: 'en' } as const;
    const absent = await cacheKey(base);
    const empty = await cacheKey({ ...base, refinement: '' });
    expect(absent).toBe(empty);
  });

  it('task splits the slot: translate vs summarize of the same text never collide', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;
    const translate = await cacheKey({ ...base, task: 'translate' });
    const summarize = await cacheKey({ ...base, task: 'summarize' });
    expect(translate).not.toBe(summarize);
  });

  it('tone splits the slot: formal vs casual reword of the same text never collide', async () => {
    const base = {
      text: 'hi',
      langId: 'auto',
      targetLang: 'en',
      task: 'reword',
    } as const;
    const formal = await cacheKey({ ...base, tone: 'formal' });
    const casual = await cacheKey({ ...base, tone: 'casual' });
    expect(formal).not.toBe(casual);
  });

  it('surface is intentionally NOT a key axis — cross-surface reuse (tooltip → sidepanel) must hit', async () => {
    // The cache overhaul deliberately dropped surface so a sidepanel
    // translate reuses a tooltip's cached result for the same text.
    const a = await cacheKey({ text: 'hi', langId: 'auto', targetLang: 'en' });
    const b = await cacheKey({
      text: 'hi',
      langId: 'auto',
      targetLang: 'en',
      // @ts-expect-error surface is not a CacheKeyArgs field — guards against re-adding it.
      surface: 'sidepanel',
    });
    expect(a).toBe(b);
  });

  it('glossaryDigest splits the slot: different glossary sets produce different keys', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;
    const noGlossary = await cacheKey(base);
    const glossaryA = await cacheKey({ ...base, glossaryDigest: 'aaaa' });
    const glossaryB = await cacheKey({ ...base, glossaryDigest: 'bbbb' });
    expect(glossaryA).not.toBe(noGlossary);
    expect(glossaryA).not.toBe(glossaryB);
  });

  it('same glossary digest → same cache key (hit)', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;
    const a = await cacheKey({ ...base, glossaryDigest: 'digest123' });
    const b = await cacheKey({ ...base, glossaryDigest: 'digest123' });
    expect(a).toBe(b);
  });

  it('absent glossaryDigest equals empty string (back-compat)', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;
    const absent = await cacheKey(base);
    const empty = await cacheKey({ ...base, glossaryDigest: '' });
    expect(absent).toBe(empty);
  });

  it('an absent optional axis equals its empty string, for every axis', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;
    const absent = await cacheKey(base);

    for (const axis of ['contextDigest', 'task', 'tone', 'historyDigest', 'rulesDigest'] as const) {
      expect(await cacheKey({ ...base, [axis]: '' })).toBe(absent);
    }
    expect(await cacheKey({ ...base, explain: false })).toBe(absent);
  });

  it('historyDigest splits the slot: a different prefix is a different prompt', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;

    expect(await cacheKey({ ...base, historyDigest: 'h1' })).not.toBe(
      await cacheKey({ ...base, historyDigest: 'h2' }),
    );
    expect(await cacheKey({ ...base, historyDigest: 'h1' })).not.toBe(await cacheKey(base));
  });

  it('explain splits the slot: an explain answer never serves a plain translate', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;

    expect(await cacheKey({ ...base, explain: true })).not.toBe(
      await cacheKey({ ...base, explain: false }),
    );
  });

  it('rulesDigest splits the slot: a site-scoped rule cannot leak to another host', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;
    const noRules = await cacheKey(base);
    const ruled = await cacheKey({ ...base, rulesDigest: 'aaaa' });
    const otherRules = await cacheKey({ ...base, rulesDigest: 'bbbb' });
    expect(ruled).not.toBe(noRules);
    expect(ruled).not.toBe(otherRules);
    expect(await cacheKey({ ...base, rulesDigest: '' })).toBe(noRules);
  });

  it('task is an independent axis from tone (one changing does not mask the other)', async () => {
    const base = { text: 'hi', langId: 'auto', targetLang: 'en' } as const;
    const a = await cacheKey({ ...base, task: 'reword', tone: 'formal' });
    const b = await cacheKey({ ...base, task: 'translate', tone: 'formal' });
    const c = await cacheKey({ ...base, task: 'reword', tone: 'casual' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('TranslationCache', () => {
  beforeEach(() => vi.useFakeTimers());

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
