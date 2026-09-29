import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL, parseStoredSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

/** The read path degrades one field, never a section: over-cap values clamp, unclampable ones drop alone. */

const rule = {
  id: 'r1',
  body: 'always keep names untranslated',
  category: 'always',
  scope: { tasks: [] },
  source: 'manual',
  addedAt: '2026-08-10T00:00:00.000Z',
  enabled: true,
};

function advancedWith(over: Record<string, unknown>): Record<string, unknown> {
  return {
    ...DEFAULT_SETTINGS,
    advanced: {
      ...DEFAULT_SETTINGS.advanced,
      rules: [rule],
      snippets: { greeting: 'hello there' },
      temperature: 1.1,
      ...over,
    },
  } as Record<string, unknown>;
}

function expectAdvancedSiblingsIntact(out: ReturnType<typeof parseStoredSettings>): void {
  expect(out.advanced.rules).toHaveLength(1);
  expect(out.advanced.snippets).toEqual({ greeting: 'hello there' });
  expect(out.advanced.temperature).toBe(1.1);
}

describe('advanced degrades per field', () => {
  it('truncates an over-long custom slot description', () => {
    const raw = advancedWith({
      customSlotDescriptions: { tone: 'z'.repeat(300), other: 'short' },
    });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expectAdvancedSiblingsIntact(out);
    expect(out.advanced.customSlotDescriptions['tone']).toHaveLength(280);
    expect(out.advanced.customSlotDescriptions['other']).toBe('short');
  });

  it('caps customSlotDescriptions at 50 entries', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 60; i += 1) many[`slot${i}`] = `d${i}`;
    const raw = advancedWith({ customSlotDescriptions: many });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expectAdvancedSiblingsIntact(out);
    expect(Object.keys(out.advanced.customSlotDescriptions)).toHaveLength(50);
  });

  it('truncates an over-long snippet body', () => {
    const raw = advancedWith({ snippets: { greeting: 'hello there', big: 'b'.repeat(9000) } });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.advanced.rules).toHaveLength(1);
    expect(out.advanced.snippets['greeting']).toBe('hello there');
    expect(out.advanced.snippets['big']).toHaveLength(8192);
  });

  it('clamps an out-of-range temperature instead of resetting advanced', () => {
    const raw = advancedWith({ temperature: 9 });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.advanced.rules).toHaveLength(1);
    expect(out.advanced.snippets).toEqual({ greeting: 'hello there' });
    expect(out.advanced.temperature).toBe(2);
  });

  it('drops one unfixable rule and keeps the rest', () => {
    const raw = advancedWith({ rules: [rule, { ...rule, id: 'r2', body: '' }] });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.advanced.rules.map((r) => r.id)).toEqual(['r1']);
    expect(out.advanced.snippets).toEqual({ greeting: 'hello there' });
  });

  it('strips an unknown nested advanced key instead of resetting the section', () => {
    const raw = advancedWith({ retiredLabField: { some: 'value' } });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expectAdvancedSiblingsIntact(out);
    expect((out.advanced as unknown as Record<string, unknown>)['retiredLabField']).toBeUndefined();
  });
});

describe('top-level sections degrade per field', () => {
  it('strips an unknown model slot and keeps the other model ids', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      model: { ...DEFAULT_SETTINGS.model, anthropic: 'my-model', retiredProvider: 'x' },
    } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.model.anthropic).toBe('my-model');
    expect((out.model as unknown as Record<string, unknown>)['retiredProvider']).toBeUndefined();
  });

  it('fills a missing model slot from its default and keeps the other model ids', () => {
    const model: Record<string, unknown> = { ...DEFAULT_SETTINGS.model, anthropic: 'my-model' };
    delete model['openai'];
    const raw = { ...DEFAULT_SETTINGS, model } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.model.anthropic).toBe('my-model');
    expect(out.model.openai).toBe(DEFAULT_MODEL.openai);
  });

  it('repairs a legacy image-task menu item with no surface instead of dropping it', () => {
    const image = DEFAULT_SETTINGS.contextMenuItems.find((i) => i.kind === 'image-task');
    if (!image) throw new Error('no image-task item in the shipped menu');
    const legacy: Record<string, unknown> = { ...image };
    delete legacy['surface'];
    const raw = { ...DEFAULT_SETTINGS, contextMenuItems: [legacy] } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.contextMenuItems).toHaveLength(1);
    expect(out.contextMenuItems[0]).toMatchObject({ id: image.id, surface: 'sidepanel' });
  });

  it('truncates an over-long context-menu label and keeps every item', () => {
    const items = [
      { ...DEFAULT_SETTINGS.contextMenuItems[0], label: 'L'.repeat(300) },
      ...DEFAULT_SETTINGS.contextMenuItems.slice(1),
    ];
    const raw = { ...DEFAULT_SETTINGS, contextMenuItems: items } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.contextMenuItems).toHaveLength(items.length);
    expect(out.contextMenuItems[0]?.label).toHaveLength(200);
  });

  it('caps contextMenuItems at 50 rather than resetting to the shipped menu', () => {
    const base = DEFAULT_SETTINGS.contextMenuItems[0];
    const items = Array.from({ length: 60 }, (_, i) => ({
      ...base,
      id: `custom-${i}`,
      order: i,
    }));
    const raw = { ...DEFAULT_SETTINGS, contextMenuItems: items } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.contextMenuItems).toHaveLength(50);
    expect(out.contextMenuItems[0]?.id).toBe('custom-0');
  });

  it('truncates an over-long variety override hint instead of dropping the entry', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      varietyOverrides: { arabizi: { label: 'Arabizi', hint: 'h'.repeat(700) } },
    } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.varietyOverrides['arabizi']?.label).toBe('Arabizi');
    expect(out.varietyOverrides['arabizi']?.hint).toHaveLength(500);
  });

  it('truncates an over-long glossary term and keeps the other entries', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      glossary: [
        { term: 't'.repeat(150), translation: 'ok' },
        { term: 'keep', translation: 'me' },
      ],
    } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.glossary).toHaveLength(2);
    expect(out.glossary[0]?.term).toHaveLength(100);
    expect(out.glossary[1]).toMatchObject({ term: 'keep', translation: 'me' });
  });

  it('clamps an out-of-range per-task max token override', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      taskMaxTokens: { summarize: 999_999, explain: 512 },
    } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.taskMaxTokens?.summarize).toBe(8192);
    expect(out.taskMaxTokens?.explain).toBe(512);
  });

  it('slices an over-long disabledVarieties list', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      disabledVarieties: Array.from({ length: 250 }, (_, i) => `v${i}`),
      cacheEnabled: false,
    } as Record<string, unknown>;

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.disabledVarieties).toHaveLength(200);
    expect(out.cacheEnabled).toBe(false);
  });
});
