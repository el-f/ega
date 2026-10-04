import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { cacheKey, type RequestFingerprint } from '@/background/cache';

const arbTurn = fc.record({
  role: fc.constantFrom('user' as const, 'assistant' as const),
  content: fc.string({ maxLength: 40 }),
});

const arbFingerprint: fc.Arbitrary<RequestFingerprint> = fc.record({
  system: fc.string({ maxLength: 120 }),
  user: fc.string({ maxLength: 120 }),
  task: fc.string({ minLength: 1, maxLength: 20 }),
  history: fc.array(arbTurn, { maxLength: 3 }),
});

const same = (a: RequestFingerprint, b: RequestFingerprint): boolean =>
  JSON.stringify([a.system, a.user, a.task, a.history ?? []]) ===
  JSON.stringify([b.system, b.user, b.task, b.history ?? []]);

describe('cacheKey collision boundary', () => {
  it('any 2 distinct fingerprints produce distinct keys', async () => {
    await fc.assert(
      fc.asyncProperty(arbFingerprint, arbFingerprint, async (a, b) => {
        if (same(a, b)) return;
        expect(await cacheKey(a)).not.toBe(await cacheKey(b));
      }),
    );
  });

  it('the same fingerprint always produces the same key', async () => {
    await fc.assert(
      fc.asyncProperty(arbFingerprint, async (f) => {
        expect(await cacheKey(f)).toBe(await cacheKey({ ...f }));
      }),
    );
  });
});
