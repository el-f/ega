import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { cacheKey } from '@/background/cache';

interface CacheKeyTuple {
  text: string;
  langId: string;
  targetLang: string;
  contextDigest?: string;
  task?: string;
  tone?: string;
  refinement?: string;
  glossaryDigest?: string;
}

const arbCacheKeyArgs: fc.Arbitrary<CacheKeyTuple> = fc
  .record({
    text: fc.string({ maxLength: 200 }),
    langId: fc.string({ minLength: 1, maxLength: 20 }),
    targetLang: fc.string({ minLength: 1, maxLength: 20 }),
    hasContextDigest: fc.boolean(),
    contextDigest: fc.string({ maxLength: 64 }),
    hasTask: fc.boolean(),
    task: fc.string({ maxLength: 30 }),
    hasTone: fc.boolean(),
    tone: fc.string({ maxLength: 30 }),
    hasRefinement: fc.boolean(),
    refinement: fc.string({ maxLength: 200 }),
    hasGlossaryDigest: fc.boolean(),
    glossaryDigest: fc.string({ maxLength: 64 }),
  })
  .map(
    ({
      text,
      langId,
      targetLang,
      hasContextDigest,
      contextDigest,
      hasTask,
      task,
      hasTone,
      tone,
      hasRefinement,
      refinement,
      hasGlossaryDigest,
      glossaryDigest,
    }) => {
      const r: CacheKeyTuple = { text, langId, targetLang };
      if (hasContextDigest) r.contextDigest = contextDigest;
      if (hasTask) r.task = task;
      if (hasTone) r.tone = tone;
      if (hasRefinement) r.refinement = refinement;
      if (hasGlossaryDigest) r.glossaryDigest = glossaryDigest;
      return r;
    },
  );

describe('cacheKey collision boundary', () => {
  it('any 2 distinct tuples produce distinct keys', async () => {
    await fc.assert(
      fc.asyncProperty(arbCacheKeyArgs, arbCacheKeyArgs, async (a, b) => {
        // Only assert if the tuples differ in any field
        const same =
          a.text === b.text &&
          a.langId === b.langId &&
          a.targetLang === b.targetLang &&
          (a.contextDigest ?? '') === (b.contextDigest ?? '') &&
          (a.task ?? '') === (b.task ?? '') &&
          (a.tone ?? '') === (b.tone ?? '') &&
          (a.refinement ?? '') === (b.refinement ?? '') &&
          (a.glossaryDigest ?? '') === (b.glossaryDigest ?? '');
        if (same) return;
        const keyA = await cacheKey(a);
        const keyB = await cacheKey(b);
        expect(keyA).not.toBe(keyB);
      }),
    );
  });

  it('resists delimiter injection across adjacent fields', async () => {
    // These collide under a naive '|' join; an injective key keeps them apart, or one request reads another's cache.
    const a = { text: 'a', langId: 'b|c', targetLang: 'en' };
    const b = { text: 'a|b', langId: 'c', targetLang: 'en' };
    expect(await cacheKey(a)).not.toBe(await cacheKey(b));

    // Same idea one field over: refinement absorbs a trailing pipe from tone.
    const c = {
      text: 'x',
      langId: 'ar',
      targetLang: 'en',
      tone: 'p',
      refinement: '|q',
    };
    const d = {
      text: 'x',
      langId: 'ar',
      targetLang: 'en',
      tone: 'p|',
      refinement: 'q',
    };
    expect(await cacheKey(c)).not.toBe(await cacheKey(d));
  });

  it('same tuple always produces the same key (deterministic)', async () => {
    await fc.assert(
      fc.asyncProperty(arbCacheKeyArgs, async (args) => {
        const k1 = await cacheKey(args);
        const k2 = await cacheKey(args);
        expect(k1).toBe(k2);
      }),
    );
  });

  it('key differs when only contextDigest changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        async (text, lang, digestA, digestB) => {
          if (digestA === digestB) return;
          const base = { text, langId: lang, targetLang: 'en' };
          const k1 = await cacheKey(base);
          const k2 = await cacheKey({ ...base, contextDigest: digestA });
          const k3 = await cacheKey({ ...base, contextDigest: digestB });
          expect(k1).not.toBe(k2);
          expect(k2).not.toBe(k3);
        },
      ),
    );
  });

  it('key differs when only task changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 100 }),
        fc.constantFrom('translate', 'explain', 'summarize', 'reword'),
        fc.constantFrom('grammar', 'suggest-replies'),
        async (text, taskA, taskB) => {
          const a = { text, langId: 'ar', targetLang: 'en', task: taskA };
          const b = { ...a, task: taskB };
          const k1 = await cacheKey(a);
          const k2 = await cacheKey(b);
          expect(k1).not.toBe(k2);
        },
      ),
    );
  });

  it('key differs when only glossaryDigest changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        async (text, digestA, digestB) => {
          if (digestA === digestB) return;
          const a = {
            text,
            langId: 'en',
            targetLang: 'fr',
            glossaryDigest: digestA,
          };
          const b = { ...a, glossaryDigest: digestB };
          const k1 = await cacheKey(a);
          const k2 = await cacheKey(b);
          expect(k1).not.toBe(k2);
        },
      ),
    );
  });
});
