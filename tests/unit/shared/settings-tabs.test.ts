import { describe, it, expect } from 'vitest';
import { SETTINGS_TABS, TAB_LABELS, type SettingsTab } from '@/shared/settings-tabs';
import { OPTIONS_TABS, buildRegistry } from '@/shared/command-registry';
import { SETTINGS_SPEC } from '@/shared/settings-spec';
import { TABS } from '@/options/tabs/_tab-spec';

const ids: readonly string[] = SETTINGS_TABS.map((t) => t.id);

describe('settings-tabs — one declaration of the options tabs', () => {
  it('declares all 8 tabs in nav order', () => {
    expect(ids).toEqual([
      'translate',
      'selection-bubble',
      'backends',
      'languages',
      'templates',
      'glossary',
      'advanced',
      'about',
    ]);
  });

  it('every tab carries a label and a description', () => {
    for (const t of SETTINGS_TABS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('TAB_LABELS is derived, not re-typed', () => {
    expect(Object.keys(TAB_LABELS).sort()).toEqual([...ids].sort());
    for (const t of SETTINGS_TABS) expect(TAB_LABELS[t.id]).toBe(t.label);
  });
});

describe('settings-tabs — every consumer reads the same row', () => {
  it('the options nav spec carries the same ids, labels and descriptions', () => {
    expect(TABS.map((t) => t.id)).toEqual(ids);
    for (const t of TABS) {
      expect(t.label).toBe(TAB_LABELS[t.id]);
      expect(t.icon).toBeDefined();
    }
  });

  it('the command palette deep-links every tab under its shared label', () => {
    expect([...OPTIONS_TABS]).toEqual(ids);
    const cmds = buildRegistry({
      onOpenOptions: () => {},
      onSwapTheme: () => {},
      onSetBubbleMode: () => {},
      currentTheme: 'system',
    });
    for (const t of SETTINGS_TABS) {
      const cmd = cmds.find((c) => c.id === `options.open.${t.id}`);
      expect(cmd?.label).toBe(`Open Settings: ${t.label}`);
    }
  });

  it('every spec entry lands on a declared tab', () => {
    const known = new Set<string>(ids);
    const bad = SETTINGS_SPEC.filter((e) => !known.has(e.tab)).map((e) => `${e.id}: ${e.tab}`);
    expect(bad).toEqual([]);
  });

  it('the search-result badge and the nav agree on the selection tab label', () => {
    const tab: SettingsTab = 'selection-bubble';
    expect(TAB_LABELS[tab]).toBe('Selection & picker');
    expect(TABS.find((t) => t.id === tab)?.label).toBe('Selection & picker');
  });
});
