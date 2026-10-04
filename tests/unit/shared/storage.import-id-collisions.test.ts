import { describe, it, expect } from 'vitest';
import { getCustomLanguages } from '@/shared/storage';
import { importAs } from '@tests/_helpers/import-bundle';
import { materializeVarieties } from '@/shared/varieties';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { preset } from '@tests/_helpers/lang';
import type { CustomLanguage } from '@/shared/types';

const BUILTIN_ID = BUILT_IN_PRESETS[0]?.id ?? 'arabizi';

function custom(id: string, label: string): Record<string, unknown> {
  return { id, label, hint: 'hint', examples: [], createdAt: 1000 };
}

function bundle(customLanguages: unknown[]): unknown {
  return {
    egaVarieties: {
      v: 1,
      exportedAt: '2026-01-01',
      customLanguages,
      varietyOverrides: {},
      disabledVarieties: [],
    },
  };
}

describe('varieties import — custom id collisions', () => {
  it('drops a custom whose id repeats a built-in and counts it', async () => {
    const { result } = await importAs(
      bundle([custom(BUILTIN_ID, 'Shadow'), custom('custom-ok', 'Good')]),
      'varieties',
    );

    expect(result.droppedCollidingCustoms).toBe(1);
    expect(result.customLanguagesAdded).toBe(1);
    const stored = await getCustomLanguages();
    expect(stored.map((c) => c.id)).toEqual([preset('custom-ok')]);
  });

  it('keeps the first of two entries sharing one id', async () => {
    const { result } = await importAs(
      bundle([custom('custom-dupe', 'First'), custom('custom-dupe', 'Second')]),
      'varieties',
    );

    expect(result.droppedCollidingCustoms).toBe(1);
    const stored = await getCustomLanguages();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.label).toBe('First');
  });

  it('reports zero drops for a clean bundle', async () => {
    const { result } = await importAs(
      bundle([custom('custom-a', 'A'), custom('custom-b', 'B')]),
      'varieties',
    );

    expect(result.droppedCollidingCustoms).toBe(0);
    expect(result.customLanguagesAdded).toBe(2);
  });
});

describe('settings import — custom id collisions', () => {
  it('drops a custom shadowing a built-in', async () => {
    await importAs(
      {
        version: 1,
        settings: { ...DEFAULT_SETTINGS },
        customLanguages: [custom(BUILTIN_ID, 'Shadow'), custom('custom-ok', 'Good')],
      },
      'settings',
    );

    const stored = await getCustomLanguages();
    expect(stored.map((c) => c.id)).toEqual([preset('custom-ok')]);
  });

  it('drops a repeated id inside the bundle', async () => {
    await importAs(
      {
        version: 1,
        settings: { ...DEFAULT_SETTINGS },
        customLanguages: [custom('custom-dupe', 'First'), custom('custom-dupe', 'Second')],
      },
      'settings',
    );

    const stored = await getCustomLanguages();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.label).toBe('First');
  });
});

describe('materializeVarieties — defensive de-duplication', () => {
  it('a stored custom shadowing a built-in cannot produce two rows with one id', () => {
    const shadow: CustomLanguage = {
      id: preset(BUILTIN_ID),
      label: 'Shadow',
      hint: '',
      examples: [],
      createdAt: 1,
    };

    const vs = materializeVarieties(DEFAULT_SETTINGS, [shadow]);

    const ids = vs.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(vs.find((v) => v.id === BUILTIN_ID)?.kind).toBe('builtin');
  });

  it('keeps the first of two stored customs sharing one id', () => {
    const dupe = (label: string): CustomLanguage => ({
      id: preset('custom-dupe'),
      label,
      hint: '',
      examples: [],
      createdAt: 1,
    });

    const vs = materializeVarieties(DEFAULT_SETTINGS, [dupe('First'), dupe('Second')]);

    expect(vs.filter((v) => v.id === 'custom-dupe')).toHaveLength(1);
    expect(vs.find((v) => v.id === 'custom-dupe')?.label).toBe('First');
  });
});
