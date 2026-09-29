import { describe, it, expect } from 'vitest';
import { decodeCustomMenuId, withEncodedMenuIds } from '@/background/menu-id';
import { DEFAULT_CONTEXT_MENU_ITEMS, type ContextMenuItem } from '@/shared/context-menu';

describe('decodeCustomMenuId', () => {
  it.each([
    ['ega-custom-txt-sp-3', { kind: 'task', surface: 'sidepanel' }],
    ['ega-custom-txt-tt-0', { kind: 'task', surface: 'tooltip' }],
    ['ega-custom-img-sp-12', { kind: 'image-task', surface: 'sidepanel' }],
    ['ega-custom-img-tt-7', { kind: 'image-task', surface: 'tooltip' }],
  ])('decodes %s', (id, expected) => {
    expect(decodeCustomMenuId(id)).toEqual(expected);
  });

  it.each([
    'ega-translate-selection',
    'ega-sidepanel-selection',
    'ega-toggle-site',
    'ega-root',
    'ega-custom-3',
    'ega-custom-txt-sp-',
    'ega-custom-txt-sp-3x',
    'ega-custom-vid-sp-3',
    'xega-custom-txt-sp-3',
    '',
  ])('returns null for %j', (id) => {
    expect(decodeCustomMenuId(id)).toBeNull();
  });
});

describe('withEncodedMenuIds', () => {
  it('leaves a list whose ids already encode their surface untouched', () => {
    expect(withEncodedMenuIds(DEFAULT_CONTEXT_MENU_ITEMS)).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
  });

  it('re-mints a default id that carries a non-default surface', () => {
    const stored = DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
      i.kind === 'image-task' ? { ...i, surface: 'tooltip' as const } : i,
    );

    const out = withEncodedMenuIds(stored);

    for (const item of out) {
      if (item.kind !== 'image-task') continue;
      expect(decodeCustomMenuId(item.id)).toEqual({ kind: 'image-task', surface: 'tooltip' });
    }
    expect(new Set(out.map((i) => i.id)).size).toBe(out.length);
  });

  it('re-mints a pre-v5 custom id, which encodes nothing', () => {
    const stored: ContextMenuItem[] = [
      ...DEFAULT_CONTEXT_MENU_ITEMS,
      {
        id: 'ega-custom-3',
        kind: 'task',
        enabled: true,
        order: 7,
        label: 'Send to side panel',
        task: 'translate',
        surface: 'sidepanel',
      },
    ];

    const out = withEncodedMenuIds(stored);

    expect(decodeCustomMenuId(out[7]?.id ?? '')).toEqual({ kind: 'task', surface: 'sidepanel' });
  });

  it('never mints an id an existing item already holds', () => {
    const stored: ContextMenuItem[] = [
      { ...DEFAULT_CONTEXT_MENU_ITEMS[4], surface: 'tooltip' } as ContextMenuItem,
      {
        id: 'ega-custom-img-tt-0',
        kind: 'image-task',
        enabled: true,
        order: 1,
        label: 'Read image',
        task: 'explain',
        surface: 'tooltip',
      },
    ];

    const out = withEncodedMenuIds(stored);

    expect(out[0]?.id).not.toBe('ega-custom-img-tt-0');
    expect(new Set(out.map((i) => i.id)).size).toBe(2);
  });
});
