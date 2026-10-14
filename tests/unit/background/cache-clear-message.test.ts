import { describe, it, expect } from 'vitest';
import { hasKnownKind } from '@/shared/messages';
import { MAX_ENTRIES, TranslationCache } from '@/background/cache';

describe('cache:clear message', () => {
  it('is recognized by hasKnownKind', () => {
    expect(hasKnownKind({ kind: 'cache:clear' })).toBe(true);
  });

  it('TranslationCache.clear() empties the cache', async () => {
    const cache = new TranslationCache();
    await cache.set('k1', { translation: 'hello', confidence: 1 });
    await cache.set('k2', { translation: 'world', confidence: 1 });
    expect(await cache.get('k1')).not.toBeUndefined();

    await cache.clear();

    expect(await cache.get('k1')).toBeUndefined();
    expect(await cache.get('k2')).toBeUndefined();
  });
});

describe('TranslationCache — set/get round-trip and key isolation', () => {
  it('set A, set B, get A === A, get B === B (keys are isolated)', async () => {
    const cache = new TranslationCache();
    const entryA = { translation: 'alpha', confidence: 0.9 };
    const entryB = { translation: 'beta', confidence: 0.7 };

    await cache.set('key-a', entryA);
    await cache.set('key-b', entryB);

    const gotA = await cache.get('key-a');
    const gotB = await cache.get('key-b');

    expect(gotA?.translation).toBe('alpha');
    expect(gotA?.confidence).toBe(0.9);
    expect(gotB?.translation).toBe('beta');
    expect(gotB?.confidence).toBe(0.7);
  });

  it('get returns undefined for a key that was never set', async () => {
    const cache = new TranslationCache();
    expect(await cache.get('no-such-key')).toBeUndefined();
  });

  it('clear makes both keys undefined: set A, set B, clear, get A=undefined, get B=undefined', async () => {
    const cache = new TranslationCache();
    await cache.set('key-a', { translation: 'alpha', confidence: 1 });
    await cache.set('key-b', { translation: 'beta', confidence: 1 });

    await cache.clear();

    expect(await cache.get('key-a')).toBeUndefined();
    expect(await cache.get('key-b')).toBeUndefined();
  });

  it('set after clear writes correctly (cache is usable again post-clear)', async () => {
    const cache = new TranslationCache();
    await cache.set('k', { translation: 'before', confidence: 0.5 });
    await cache.clear();
    await cache.set('k', { translation: 'after', confidence: 0.8 });

    const got = await cache.get('k');
    expect(got?.translation).toBe('after');
    expect(got?.confidence).toBe(0.8);
  });

  it('overwriting an existing key replaces the value', async () => {
    const cache = new TranslationCache();
    await cache.set('k', { translation: 'first', confidence: 0.3 });
    await cache.set('k', { translation: 'second', confidence: 0.9 });

    const got = await cache.get('k');
    expect(got?.translation).toBe('second');
    expect(got?.confidence).toBe(0.9);
  });

  it('set with optional detectedLang round-trips correctly', async () => {
    const cache = new TranslationCache();
    await cache.set('k', { translation: 'hola', confidence: 0.95, detectedLang: 'es' });

    const got = await cache.get('k');
    expect(got?.detectedLang).toBe('es');
  });

  it('holds a whole page-translate run without evicting the first block', async () => {
    const cache = new TranslationCache();
    for (let i = 0; i < MAX_ENTRIES; i++) {
      await cache.set(`k${i}`, { translation: `t${i}`, confidence: 1 });
    }
    expect((await cache.get('k0'))?.translation).toBe('t0');
  });

  it('multiple independent caches do not share state', async () => {
    const cacheA = new TranslationCache();
    const cacheB = new TranslationCache();

    await cacheA.set('shared-key', { translation: 'from-A', confidence: 1 });
    expect(await cacheB.get('shared-key')).toBeUndefined();

    await cacheA.clear();
    await cacheB.set('shared-key', { translation: 'from-B', confidence: 1 });
    expect(await cacheA.get('shared-key')).toBeUndefined();
    const fromB = await cacheB.get('shared-key');
    expect(fromB?.translation).toBe('from-B');
  });
});
