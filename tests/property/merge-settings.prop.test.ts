import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

// Mirrors the in-memory merge `updateSettings` performs, so properties run without a storage mock per case.
function merge(cur: Settings, patch: Partial<Settings>): Settings {
  return {
    ...cur,
    ...patch,
    model: { ...cur.model, ...patch.model },
    advanced: { ...cur.advanced, ...patch.advanced },
    sitePrefs: { ...cur.sitePrefs, ...patch.sitePrefs },
    taskBackends: { ...cur.taskBackends, ...patch.taskBackends },
    taskTemperatures: { ...cur.taskTemperatures, ...patch.taskTemperatures },
    taskMaxTokens: { ...cur.taskMaxTokens, ...patch.taskMaxTokens },
    varietyOverrides: { ...cur.varietyOverrides, ...patch.varietyOverrides },
  };
}

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
        const bc = merge(merge(base, patchB), patchC);
        const cb = merge(merge(base, patchC), patchB);

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
        const result = merge(cur, patch);
        expect(result.cacheEnabled).toBe(patchValue);
      }),
    );
  });

  it('merge shallow-merges map fields: patch empty-map clears; patch with keys wins; cur keys survive when patch omits them', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s !== '__proto__'),
        fc.constantFrom('translate', 'explain', 'summarize'),
        (siteKey, task) => {
          const cur: Settings = {
            ...DEFAULT_SETTINGS,
            sitePrefs: { [siteKey]: { disabled: true } },
            taskBackends: { [task as 'translate']: asBackendIdUnsafe('anthropic') },
          };

          // Case 1: an empty map patch spreads to nothing, so cur's keys survive.
          const patchEmpty: Partial<Settings> = { sitePrefs: {}, taskBackends: {} };
          const afterEmpty = merge(cur, patchEmpty);
          expect(afterEmpty.sitePrefs[siteKey]).toEqual({ disabled: true });
          expect(afterEmpty.taskBackends[task as 'translate']).toBe(asBackendIdUnsafe('anthropic'));

          // Case 2: patch provides sitePrefs with a DIFFERENT key → original key still present
          const otherKey = siteKey + '-other';
          const patchOther: Partial<Settings> = {
            sitePrefs: { [otherKey]: { disabled: false } },
          };
          const afterOther = merge(cur, patchOther);
          expect(afterOther.sitePrefs[siteKey]).toEqual({ disabled: true });
          expect(afterOther.sitePrefs[otherKey]).toEqual({ disabled: false });

          // Case 3: patch overrides the same key → patch value wins
          const patchOverride: Partial<Settings> = {
            sitePrefs: { [siteKey]: { disabled: false } },
          };
          const afterOverride = merge(cur, patchOverride);
          expect(afterOverride.sitePrefs[siteKey]).toEqual({ disabled: false });
        },
      ),
    );
  });

  it('model merge: patch without model key preserves all cur model fields', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (modelStr) => {
        const cur: Settings = {
          ...DEFAULT_SETTINGS,
          model: { ...DEFAULT_SETTINGS.model, anthropic: modelStr },
        };
        // `model` is absent from the patch, so the spread falls back to `cur.model`.
        const patch: Partial<Settings> = { streaming: false };
        const result = merge(cur, patch);
        expect(result.model.anthropic).toBe(modelStr);
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
          advanced: { ...DEFAULT_SETTINGS.advanced, temperature: 0.5 },
        };
        const result = merge(cur, patch);
        // `patch.advanced` is a full object, so it overwrites `cur.advanced.retryCount` with the default.
        expect(result.advanced.temperature).toBe(0.5);
        expect(result.streaming).toBe(streaming);
      }),
    );
  });
});
