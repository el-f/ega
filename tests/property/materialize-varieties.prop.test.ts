import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { materializeVarieties } from '@/shared/varieties';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { arbCustomLanguage } from './setup';
import type { CustomLanguage } from '@/shared/types';

const builtinCount = BUILT_IN_PRESETS.length;

describe('materializeVarieties', () => {
  it('keeps every custom whose id is free, and drops only the ones a built-in or an earlier row already owns', () => {
    const builtinIds = new Set<string>(BUILT_IN_PRESETS.map((p) => String(p.id)));
    fc.assert(
      fc.property(fc.array(arbCustomLanguage, { maxLength: 20 }), (customs) => {
        const kept = new Set<string>();
        for (const c of customs) {
          if (!builtinIds.has(String(c.id))) kept.add(String(c.id));
        }
        const result = materializeVarieties(DEFAULT_SETTINGS, customs);
        expect(result.length).toBe(builtinCount + kept.size);
        expect(new Set(result.map((v) => v.id)).size).toBe(result.length);
      }),
    );
  });

  it('every result item has a non-empty id', () => {
    fc.assert(
      fc.property(fc.array(arbCustomLanguage, { maxLength: 20 }), (customs) => {
        const result = materializeVarieties(DEFAULT_SETTINGS, customs);
        for (const v of result) {
          expect(typeof v.id).toBe('string');
          expect(v.id.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('ordering is stable across calls with the same input', () => {
    fc.assert(
      fc.property(fc.array(arbCustomLanguage, { maxLength: 10 }), (customs) => {
        const a = materializeVarieties(DEFAULT_SETTINGS, customs).map((v) => v.id);
        const b = materializeVarieties(DEFAULT_SETTINGS, customs).map((v) => v.id);
        expect(a).toEqual(b);
      }),
    );
  });

  it('builtin varieties always appear before custom varieties', () => {
    // At least one custom plus builtinCount > 0 means both indices exist, so no guard.
    fc.assert(
      fc.property(fc.array(arbCustomLanguage, { minLength: 1, maxLength: 10 }), (customs) => {
        const result = materializeVarieties(DEFAULT_SETTINGS, customs);
        const firstCustomIdx = result.findIndex((v) => v.kind === 'custom');
        const lastBuiltinIdx = result.map((v) => v.kind).lastIndexOf('builtin');
        // Both must be present given minLength:1 customs and builtinCount>0
        expect(firstCustomIdx).toBeGreaterThanOrEqual(0);
        expect(lastBuiltinIdx).toBeGreaterThanOrEqual(0);
        expect(lastBuiltinIdx).toBeLessThan(firstCustomIdx);
      }),
    );
  });

  it('enabledOnly filter never returns more items than the unfiltered call', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 64 }).filter((s) => /^[a-z0-9][\w-]*$/i.test(s)),
          { maxLength: 5 },
        ),
        fc.array(arbCustomLanguage, { maxLength: 10 }),
        (disabledIds, customs) => {
          const settings = {
            ...DEFAULT_SETTINGS,
            disabledVarieties: disabledIds,
          };
          const all = materializeVarieties(settings, customs);
          const enabled = materializeVarieties(settings, customs, { enabledOnly: true });
          expect(enabled.length).toBeLessThanOrEqual(all.length);
        },
      ),
    );
  });

  it('handles empty customs without crashing', () => {
    const result = materializeVarieties(DEFAULT_SETTINGS, [] as CustomLanguage[]);
    expect(result.length).toBe(builtinCount);
  });
});
