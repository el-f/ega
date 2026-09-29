import { describe, it, expect } from 'vitest';
import { cacheKey } from '@/background/cache';

describe('cacheKey — historyDigest', () => {
  it('different conversation history → different cache key for same text', async () => {
    const base = { text: 'q', langId: 'auto', targetLang: 'en', withContext: false };
    const k0 = await cacheKey({ ...base });
    const k1 = await cacheKey({ ...base, historyDigest: 'abc' });
    const k2 = await cacheKey({ ...base, historyDigest: 'def' });
    expect(k1).not.toBe(k0);
    expect(k1).not.toBe(k2);
  });

  it('same history digest → same key (stable)', async () => {
    const base = {
      text: 'q',
      langId: 'auto',
      targetLang: 'en',
      withContext: false,
      historyDigest: 'abc',
    };
    expect(await cacheKey({ ...base })).toBe(await cacheKey({ ...base }));
  });
});
