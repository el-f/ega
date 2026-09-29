import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterGlossaryForRequest } from '@/shared/glossary';
import type { GlossaryEntry } from '@/shared/glossary';
import { arbGlossaryEntry, arbLangOrAuto } from './setup';
import { asLangIdUnsafe } from '@/shared/brands';

const arbLangCode = arbLangOrAuto;

function langStr(code: string): string {
  return code;
}

const arbMatchCtx = fc.record({
  text: fc.string({ minLength: 0, maxLength: 300 }),
  sourceLang: arbLangOrAuto.map(langStr),
  targetLang: arbLangOrAuto.map(langStr),
});

describe('filterGlossaryForRequest', () => {
  it('result is a subset of input entries', () => {
    fc.assert(
      fc.property(fc.array(arbGlossaryEntry, { maxLength: 20 }), arbMatchCtx, (glossary, ctx) => {
        const result = filterGlossaryForRequest(glossary, ctx);
        const inputTerms = new Set(glossary.map((e) => `${e.term}|${e.translation}`));
        for (const e of result) {
          expect(inputTerms.has(`${e.term}|${e.translation}`)).toBe(true);
        }
      }),
    );
  });

  it('same input twice → identical output (deterministic)', () => {
    fc.assert(
      fc.property(fc.array(arbGlossaryEntry, { maxLength: 20 }), arbMatchCtx, (glossary, ctx) => {
        const r1 = filterGlossaryForRequest(glossary, ctx);
        const r2 = filterGlossaryForRequest(glossary, ctx);
        expect(r1.map((e) => e.term)).toEqual(r2.map((e) => e.term));
      }),
    );
  });

  it('lang-mismatch entry never appears', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        (term, translation) => {
          const entry: GlossaryEntry = {
            term,
            translation,
            sourceLang: asLangIdUnsafe('en'),
            targetLang: asLangIdUnsafe('fr'),
            caseSensitive: false,
          };
          // Text that contains the term so lang is the only blocker
          const result = filterGlossaryForRequest([entry], {
            text: term,
            sourceLang: 'ar',
            targetLang: 'fr',
          });
          expect(result).toHaveLength(0);
        },
      ),
    );
  });

  it('entry without lang scoping passes when term appears', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        arbLangCode.map(langStr),
        arbLangCode.map(langStr),
        (term, translation, src, tgt) => {
          const entry: GlossaryEntry = {
            term,
            translation,
            sourceLang: undefined,
            targetLang: undefined,
            caseSensitive: false,
          };
          const text = `prefix ${term} suffix`;
          const result = filterGlossaryForRequest([entry], {
            text,
            sourceLang: src,
            targetLang: tgt,
          });
          expect(result).toHaveLength(1);
        },
      ),
    );
  });

  it('result length never exceeds input length', () => {
    fc.assert(
      fc.property(fc.array(arbGlossaryEntry, { maxLength: 20 }), arbMatchCtx, (glossary, ctx) => {
        const result = filterGlossaryForRequest(glossary, ctx);
        expect(result.length).toBeLessThanOrEqual(glossary.length);
      }),
    );
  });
});
