import { describe, it, expect } from 'vitest';
import { materializeVarieties } from '@/shared/varieties';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import type { CustomLanguage, Settings } from '@/shared/types';

function settingsWith(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('materializeVarieties — disabled-set semantics', () => {
  it('marks disabled when the id is in disabledVarieties', () => {
    const s = settingsWith({ disabledVarieties: ['arabizi'] });
    const vs = materializeVarieties(s, []);
    const arabizi = vs.find((v) => v.id === 'arabizi');
    expect(arabizi?.disabled).toBe(true);
  });

  it('treats disabledVarieties=[] as "everything enabled"', () => {
    const s = settingsWith({ disabledVarieties: [] });
    const vs = materializeVarieties(s, []);
    for (const v of vs) expect(v.disabled).toBe(false);
  });

  it('enabledOnly option filters the disabled entries out', () => {
    const s = settingsWith({ disabledVarieties: ['arabizi'] });
    const vs = materializeVarieties(s, [], { enabledOnly: true });
    expect(vs.find((v) => v.id === 'arabizi')).toBeUndefined();
  });
});

describe('materializeVarieties — varietyOverrides merge', () => {
  const firstBuiltin = BUILT_IN_PRESETS[0];
  if (!firstBuiltin) throw new Error('no built-in presets in test env');

  it('applies hint override from varietyOverrides to the built-in variety', () => {
    const CUSTOM_HINT = 'my custom hint override';
    const s = settingsWith({
      varietyOverrides: { [firstBuiltin.id]: { hint: CUSTOM_HINT } },
    });
    const vs = materializeVarieties(s, []);
    const v = vs.find((x) => x.id === firstBuiltin.id);
    expect(v?.hint).toBe(CUSTOM_HINT);
    expect(v?.hasOverrides).toBe(true);
  });

  it('built-in label is NOT overridable via varietyOverrides', () => {
    const s = settingsWith({
      varietyOverrides: { [firstBuiltin.id]: { label: 'CHANGED LABEL' } as never },
    });
    const vs = materializeVarieties(s, []);
    const v = vs.find((x) => x.id === firstBuiltin.id);
    // Label comes from the shipped preset, not the override.
    expect(v?.label).toBe(firstBuiltin.label);
  });

  it('varieties without overrides report hasOverrides=false', () => {
    const s = settingsWith({ varietyOverrides: {} });
    const vs = materializeVarieties(s, []);
    for (const v of vs.filter((x) => x.kind === 'builtin')) {
      expect(v.hasOverrides).toBe(false);
    }
  });

  it('empty override object {} does not set hasOverrides', () => {
    const s = settingsWith({
      varietyOverrides: { [firstBuiltin.id]: {} },
    });
    const vs = materializeVarieties(s, []);
    const v = vs.find((x) => x.id === firstBuiltin.id);
    // {} has no keys so hasOverrides must be false.
    expect(v?.hasOverrides).toBe(false);
  });
});

describe('materializeVarieties — custom language injection', () => {
  const custom: CustomLanguage = {
    id: 'custom-test-001' as never,
    label: 'Klingon Test',
    hint: 'fictional language for tests',
    examples: [],
    createdAt: 1000,
  };

  it('custom languages appear in the output list', () => {
    const s = settingsWith({});
    const vs = materializeVarieties(s, [custom]);
    const found = vs.find((v) => v.id === 'custom-test-001');
    expect(found).toBeDefined();
    expect(found?.kind).toBe('custom');
    expect(found?.label).toBe('Klingon Test');
  });

  it('custom language disabled flag follows disabledVarieties', () => {
    const s = settingsWith({ disabledVarieties: ['custom-test-001'] });
    const vs = materializeVarieties(s, [custom]);
    expect(vs.find((v) => v.id === 'custom-test-001')?.disabled).toBe(true);
  });

  it('custom language filtered out by enabledOnly when disabled', () => {
    const s = settingsWith({ disabledVarieties: ['custom-test-001'] });
    const vs = materializeVarieties(s, [custom], { enabledOnly: true });
    expect(vs.find((v) => v.id === 'custom-test-001')).toBeUndefined();
  });

  it('multiple customs all appear', () => {
    const custom2: CustomLanguage = {
      id: 'custom-test-002' as never,
      label: 'Elvish',
      hint: 'tolkien',
      examples: [],
      createdAt: 2000,
    };
    const s = settingsWith({});
    const vs = materializeVarieties(s, [custom, custom2]);
    expect(vs.some((v) => v.id === 'custom-test-001')).toBe(true);
    expect(vs.some((v) => v.id === 'custom-test-002')).toBe(true);
  });
});

describe('materializeVarieties — output stability', () => {
  it('same settings + same customs produces the same output twice (pure, no side-effects)', () => {
    const s = settingsWith({ disabledVarieties: ['arabizi'] });
    const customs: CustomLanguage[] = [];
    const first = materializeVarieties(s, customs);
    const second = materializeVarieties(s, customs);
    expect(first.map((v) => v.id)).toEqual(second.map((v) => v.id));
    expect(first.map((v) => v.disabled)).toEqual(second.map((v) => v.disabled));
  });

  it('built-ins appear before customs in the output', () => {
    const s = settingsWith({});
    const custom: CustomLanguage = {
      id: 'custom-last' as never,
      label: 'Last Lang',
      hint: '',
      examples: [],
      createdAt: 9999,
    };
    const vs = materializeVarieties(s, [custom]);
    const lastBuiltinIdx = vs.reduce((idx, v, i) => (v.kind === 'builtin' ? i : idx), -1);
    const firstCustomIdx = vs.findIndex((v) => v.kind === 'custom');
    expect(lastBuiltinIdx).toBeLessThan(firstCustomIdx);
  });

  it('total count equals built-ins + customs length', () => {
    const s = settingsWith({});
    const customs: CustomLanguage[] = [
      { id: 'c1' as never, label: 'L1', hint: '', examples: [], createdAt: 1 },
      { id: 'c2' as never, label: 'L2', hint: '', examples: [], createdAt: 2 },
    ];
    const vs = materializeVarieties(s, customs);
    expect(vs.length).toBe(BUILT_IN_PRESETS.length + 2);
  });
});
