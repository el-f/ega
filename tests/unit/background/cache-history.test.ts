import { describe, it, expect } from 'vitest';
import { cacheKey } from '@/background/cache';

describe('cacheKey — history', () => {
  const base = { system: 'SYS', user: 'q', task: 'translate' };

  it('a different conversation history is a different slot for the same prompt', async () => {
    const k0 = await cacheKey(base);
    const k1 = await cacheKey({ ...base, history: [{ role: 'user', content: 'abc' }] });
    const k2 = await cacheKey({ ...base, history: [{ role: 'user', content: 'def' }] });
    expect(k1).not.toBe(k0);
    expect(k1).not.toBe(k2);
  });

  it('the same history is the same slot', async () => {
    const history = [
      { role: 'user' as const, content: 'abc' },
      { role: 'assistant' as const, content: 'xyz' },
    ];
    expect(await cacheKey({ ...base, history })).toBe(await cacheKey({ ...base, history }));
  });
});
