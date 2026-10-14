import { describe, expect, it } from 'vitest';
import { parseStoredSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS, type ContextMenuItem } from '@/shared/context-menu';
import type { LangSelection } from '@/shared/types';

const parse = (raw: unknown) => parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

describe('settings — contextMenuItems', () => {
  it('empty storage seeds DEFAULT_CONTEXT_MENU_ITEMS', () => {
    const s = parse({});
    expect(s.contextMenuItems).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
  });

  it('valid stored custom array round-trips', () => {
    const custom: ContextMenuItem[] = [
      {
        id: 'ega-translate-selection',
        kind: 'task',
        enabled: true,
        order: 0,
        label: 'My label',
        task: 'translate',
        surface: 'sidepanel',
      },
    ];
    const s = parse({ contextMenuItems: custom });
    expect(s.contextMenuItems).toEqual(custom);
  });

  it('malformed contextMenuItems string falls back to defaults', () => {
    const s = parse({ contextMenuItems: 'nope' });
    expect(s.contextMenuItems).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
  });

  it('malformed contextMenuItems array entry falls back to defaults', () => {
    const s = parse({ contextMenuItems: [{ bad: 1 }] });
    expect(s.contextMenuItems).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
  });

  it('null contextMenuItems falls back to defaults', () => {
    const s = parse({ contextMenuItems: null });
    expect(s.contextMenuItems).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
  });

  it('task item with optional targetLang round-trips', () => {
    const custom: ContextMenuItem[] = [
      {
        id: 'ega-to-french',
        kind: 'task',
        enabled: true,
        order: 0,
        label: 'To French',
        task: 'translate',
        surface: 'tooltip',
        targetLang: 'fr' as LangSelection,
      },
    ];
    const s = parse({ contextMenuItems: custom });
    expect(s.contextMenuItems).toEqual(custom);
  });
});

describe('retired context menu layout', () => {
  it.each(['flat', 'nested', 'sideways', null])(
    'drops legacy layout %s while keeping a usable menu',
    (contextMenuLayout) => {
      const s = parse({ contextMenuLayout });
      expect(s).not.toHaveProperty('contextMenuLayout');
      expect(s.contextMenuItems).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
    },
  );
});

describe('DEFAULT_SETTINGS carries context-menu fields', () => {
  it('contextMenuItems equals DEFAULT_CONTEXT_MENU_ITEMS', () => {
    expect(DEFAULT_SETTINGS.contextMenuItems).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
  });

  it('does not write the retired layout', () => {
    expect(DEFAULT_SETTINGS).not.toHaveProperty('contextMenuLayout');
  });
});
