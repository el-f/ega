import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { mergeSettingsPatch } from '@/shared/storage';

const arbScalarPatch = fc
  .record({
    theme: fc.option(fc.constantFrom('system', 'light', 'dark')),
    cacheEnabled: fc.option(fc.boolean()),
    streaming: fc.option(fc.boolean()),
    confidencePill: fc.option(fc.boolean()),
    defaultTask: fc.option(
      fc.constantFrom('translate', 'explain', 'summarize', 'reword', 'grammar', 'suggest-replies'),
    ),
  })
  .map((r) => {
    const out: Partial<Settings> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v !== null) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  });

describe('updateSettings merge semantics', () => {
  it('merge(merge(base, b), c) deep-equals merge(merge(base, b), c) — last-write wins is associative for scalar chains', () => {
    // Reversed chains agree only when the two patches share no key; on a shared key the later patch wins.
    fc.assert(
      fc.property(arbScalarPatch, arbScalarPatch, (patchB, patchC) => {
        const base = DEFAULT_SETTINGS;
        const bc = mergeSettingsPatch(mergeSettingsPatch(base, patchB), patchC);
        const cb = mergeSettingsPatch(mergeSettingsPatch(base, patchC), patchB);

        if (patchC.cacheEnabled !== undefined) {
          expect(bc.cacheEnabled).toBe(patchC.cacheEnabled);
        }
        if (patchB.cacheEnabled !== undefined) {
          expect(cb.cacheEnabled).toBe(patchB.cacheEnabled);
        }
        if (patchC.streaming !== undefined) {
          expect(bc.streaming).toBe(patchC.streaming);
        }
        if (patchB.streaming !== undefined) {
          expect(cb.streaming).toBe(patchB.streaming);
        }
        if (patchC.confidencePill !== undefined) {
          expect(bc.confidencePill).toBe(patchC.confidencePill);
        }
        if (patchB.confidencePill !== undefined) {
          expect(cb.confidencePill).toBe(patchB.confidencePill);
        }
        const bKeys = new Set(Object.keys(patchB));
        const cKeys = new Set(Object.keys(patchC));
        const noOverlap = ![...bKeys].some((k) => cKeys.has(k));
        if (noOverlap) {
          expect(bc).toEqual(cb);
        }
      }),
    );
  });

  it('patch keys override cur keys (last-write semantics)', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (curValue, patchValue) => {
        const cur = { ...DEFAULT_SETTINGS, cacheEnabled: curValue };
        const patch: Partial<Settings> = { cacheEnabled: patchValue };
        const result = mergeSettingsPatch(cur, patch);
        expect(result.cacheEnabled).toBe(patchValue);
      }),
    );
  });

  it('map fields merge: an empty patch map keeps cur keys; patch keys win; omitted cur keys survive', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s !== '__proto__'),
        (siteKey) => {
          const cur: Settings = {
            ...DEFAULT_SETTINGS,
            sitePrefs: { [siteKey]: { disabled: true } },
          };

          // Case 1: an empty map patch spreads to nothing, so cur's keys survive.
          const patchEmpty: Partial<Settings> = { sitePrefs: {} };
          const afterEmpty = mergeSettingsPatch(cur, patchEmpty);
          expect(afterEmpty.sitePrefs[siteKey]).toEqual({ disabled: true });

          // Case 2: patch provides sitePrefs with a DIFFERENT key → original key still present
          const otherKey = siteKey + '-other';
          const patchOther: Partial<Settings> = {
            sitePrefs: { [otherKey]: { disabled: false } },
          };
          const afterOther = mergeSettingsPatch(cur, patchOther);
          expect(afterOther.sitePrefs[siteKey]).toEqual({ disabled: true });
          expect(afterOther.sitePrefs[otherKey]).toEqual({ disabled: false });

          // Case 3: patch overrides the same key → patch value wins
          const patchOverride: Partial<Settings> = {
            sitePrefs: { [siteKey]: { disabled: false } },
          };
          const afterOverride = mergeSettingsPatch(cur, patchOverride);
          expect(afterOverride.sitePrefs[siteKey]).toEqual({ disabled: false });
        },
      ),
    );
  });

  it('model merge: a partial model patch keeps the cur model fields it omits', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (modelStr) => {
        const cur: Settings = {
          ...DEFAULT_SETTINGS,
          model: { ...DEFAULT_SETTINGS.model, anthropic: modelStr },
        };
        const patch: Partial<Settings> = {
          streaming: false,
          model: { openai: 'x' } as Settings['model'],
        };
        const result = mergeSettingsPatch(cur, patch);
        expect(result.model.anthropic).toBe(modelStr);
        expect(result.model.openai).toBe('x');
        expect(result.streaming).toBe(false);
      }),
    );
  });

  it('advanced merge does not drop advanced fields omitted from the patch', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 }), fc.boolean(), (retryCount, streaming) => {
        const cur: Settings = {
          ...DEFAULT_SETTINGS,
          advanced: { ...DEFAULT_SETTINGS.advanced, retryCount },
          streaming,
        };
        const patch: Partial<Settings> = {
          advanced: { temperature: 0.5 } as Settings['advanced'],
        };
        const result = mergeSettingsPatch(cur, patch);
        expect(result.advanced.temperature).toBe(0.5);
        expect(result.advanced.retryCount).toBe(retryCount);
        expect(result.streaming).toBe(streaming);
      }),
    );
  });
});
