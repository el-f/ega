import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { glossaryDigest } from '@/shared/glossary-digest';
import type { GlossaryEntry } from '@/shared/glossary';
import { arbGlossaryEntry } from './arbitraries';

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = ((s * 1664525 + 1013904223) | 0) >>> 0;
    const j = s % (i + 1);
    const tmp = a[i];
    a[i] = a[j] as T;
    a[j] = tmp as T;
  }
  return a;
}

describe('glossaryDigest', () => {
  it('order-independent — same entries reshuffled → same digest', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbGlossaryEntry, { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 1, max: 0x7fffffff }),
        async (entries, seed) => {
          const shuffled = shuffle(entries, seed);
          const d1 = await glossaryDigest(entries);
          const d2 = await glossaryDigest(shuffled);
          expect(d1).toBe(d2);
        },
      ),
      { numRuns: 30 },
    );
  }, 15_000);

  it('distinct entry sets produce distinct digests (no collision)', async () => {
    const keyOf = (e: GlossaryEntry): string =>
      [
        e.term,
        e.translation,
        e.sourceLang ?? '',
        e.targetLang ?? '',
        e.caseSensitive ? '1' : '0',
      ].join('|');

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbGlossaryEntry, { minLength: 1, maxLength: 5 }),
        fc.array(arbGlossaryEntry, { minLength: 1, maxLength: 5 }),
        async (setA, setB) => {
          const keysA = new Set(setA.map(keyOf));
          const keysB = new Set(setB.map(keyOf));
          const identical = keysA.size === keysB.size && [...keysA].every((k) => keysB.has(k));
          // fc.pre regenerates until the sets differ, so the property is never vacuous.
          fc.pre(!identical);
          const d1 = await glossaryDigest(setA);
          const d2 = await glossaryDigest(setB);
          expect(d1).not.toBe(d2);
        },
      ),
      { numRuns: 30 },
    );
  }, 15_000);

  it('empty input returns empty string', async () => {
    const result = await glossaryDigest([]);
    expect(result).toBe('');
  });

  it('single entry returns a non-empty hex string', async () => {
    await fc.assert(
      fc.asyncProperty(arbGlossaryEntry, async (entry) => {
        const result = await glossaryDigest([entry]);
        expect(result.length).toBeGreaterThan(0);
        expect(/^[0-9a-f]+$/.test(result)).toBe(true);
      }),
      { numRuns: 30 },
    );
  }, 15_000);

  it('adding a distinct entry changes the digest', async () => {
    const keyOf = (e: GlossaryEntry): string =>
      [
        e.term,
        e.translation,
        e.sourceLang ?? '',
        e.targetLang ?? '',
        e.caseSensitive ? '1' : '0',
      ].join('|');

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbGlossaryEntry, { minLength: 1, maxLength: 5 }),
        arbGlossaryEntry,
        async (entries, extra) => {
          const existingKeys = new Set(entries.map(keyOf));
          // fc.pre regenerates until extra is new, so the assertion always runs.
          fc.pre(!existingKeys.has(keyOf(extra)));
          const d1 = await glossaryDigest(entries);
          const d2 = await glossaryDigest([...entries, extra]);
          expect(d1).not.toBe(d2);
        },
      ),
      { numRuns: 30 },
    );
  }, 15_000);
});
