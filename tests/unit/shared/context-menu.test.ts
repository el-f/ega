import { describe, expect, it } from 'vitest';
import type { LangSelection } from '@/shared/types';
import {
  DEFAULT_CONTEXT_MENU_ITEMS,
  ROOT_MENU_ID,
  buildMenuTree,
  contextsFor,
  nextMenuItemId,
  resolveMenuAction,
  type ContextMenuItem,
} from '@/shared/context-menu';
import {
  autoMenuName,
  customMenuLabel,
  isMenuModified,
  isShippedItem,
  menuItemName,
  withShippedIds,
  type MenuNameLookup,
} from '@/shared/context-menu-names';
import { SETTINGS_SPEC } from '@/shared/settings-spec';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

const TASKS: Record<string, string> = {
  translate: 'Translate',
  explain: 'Explain',
  'c-tweet': 'Tweet',
};
const LANGS: Record<string, string> = { he: 'Hebrew', fr: 'French' };
const LOOKUP: MenuNameLookup = {
  taskLabel: (id) => TASKS[id] ?? id,
  langLabel: (id) => LANGS[id] ?? id,
};
const titleOf = (i: ContextMenuItem): string => menuItemName(i, LOOKUP);

function text(over: Partial<Extract<ContextMenuItem, { kind: 'task' }>> = {}): ContextMenuItem {
  return {
    id: 'x',
    kind: 'task',
    enabled: true,
    order: 0,
    label: '',
    task: 'translate',
    surface: 'tooltip',
    ...over,
  };
}

describe('DEFAULT_CONTEXT_MENU_ITEMS', () => {
  it('contains the built-in ids', () => {
    const ids = DEFAULT_CONTEXT_MENU_ITEMS.map((i) => i.id);
    expect(ids).toEqual([
      'ega-translate-selection',
      'ega-sidepanel-selection',
      'ega-translate-image',
      'ega-explain-image',
      'ega-translate-page',
      'ega-pick-element',
      'ega-toggle-site',
    ]);
    expect(DEFAULT_CONTEXT_MENU_ITEMS.every(isShippedItem)).toBe(true);
  });

  it('maps each kind to the one Chrome context it shows in', () => {
    const by = (id: string) => DEFAULT_CONTEXT_MENU_ITEMS.find((i) => i.id === id);
    expect(contextsFor(by('ega-translate-selection') as ContextMenuItem)).toEqual(['selection']);
    expect(contextsFor(by('ega-translate-image') as ContextMenuItem)).toEqual(['image']);
    expect(contextsFor(by('ega-toggle-site') as ContextMenuItem)).toEqual(['page']);
  });
});

describe('buildMenuTree', () => {
  it('puts every shown item under one Ega root, in order', () => {
    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, titleOf);
    expect(nodes[0]).toEqual({
      id: ROOT_MENU_ID,
      title: 'Ega',
      contexts: ['selection', 'image', 'page'],
    });
    expect(nodes.slice(1).every((n) => n.parentId === ROOT_MENU_ID)).toBe(true);
    expect(nodes.slice(1).map((n) => n.id)).toEqual(DEFAULT_CONTEXT_MENU_ITEMS.map((i) => i.id));
  });

  it('titles every default item with its automatic name, none ending in "with Ega"', () => {
    const titles = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, titleOf).map((n) => n.title);
    expect(titles).toEqual([
      'Ega',
      'Translate',
      'Translate in side panel',
      'Translate image in side panel',
      'Explain image in side panel',
      'Translate this page',
      'Pick an element to translate',
      'Disable Ega on this site',
    ]);
  });

  it('leaves hidden items out, and has no root when nothing shows', () => {
    const hidden = text({ enabled: false });
    expect(buildMenuTree([hidden], titleOf)).toEqual([]);
  });

  it('keeps the site toggle when an older version stored it hidden', () => {
    const items = DEFAULT_CONTEXT_MENU_ITEMS.map((i) => ({ ...i, enabled: false }));
    expect(buildMenuTree(items, titleOf).map((n) => n.id)).toEqual([
      ROOT_MENU_ID,
      'ega-toggle-site',
    ]);
  });
});

describe('automatic names', () => {
  it('names a text item after its task, its language and where it opens', () => {
    expect(autoMenuName(text(), LOOKUP)).toBe('Translate');
    expect(autoMenuName(text({ targetLang: 'he' as LangSelection }), LOOKUP)).toBe(
      'Translate into Hebrew',
    );
    expect(autoMenuName(text({ task: 'explain', targetLang: 'fr' as LangSelection }), LOOKUP)).toBe(
      'Explain in French',
    );
    expect(autoMenuName(text({ task: 'c-tweet', surface: 'sidepanel' }), LOOKUP)).toBe(
      'Tweet in side panel',
    );
  });

  it('follows the task: a row switched to Explain is no longer called Translate', () => {
    expect(menuItemName(text({ task: 'explain' }), LOOKUP)).toBe('Explain');
  });

  it('treats an old shipped label as no custom name, and a typed one as the name', () => {
    const old = text({ label: 'Translate selection with Ega' });
    expect(customMenuLabel(old)).toBe('');
    expect(menuItemName(old, LOOKUP)).toBe('Translate');
    expect(customMenuLabel(text({ label: 'New text action' }))).toBe('');
    expect(menuItemName(text({ label: '  Mine ' }), LOOKUP)).toBe('Mine');
  });

  it('never renames the site toggle', () => {
    const site: ContextMenuItem = {
      id: 'ega-toggle-site',
      kind: 'site-toggle',
      enabled: true,
      order: 0,
      label: 'Turn it off',
    };
    expect(menuItemName(site, LOOKUP)).toBe('Disable Ega on this site');
  });
});

describe('isMenuModified', () => {
  it('is false for the shipped menu and for an old profile that stored the old names', () => {
    expect(isMenuModified(DEFAULT_CONTEXT_MENU_ITEMS)).toBe(false);
    const OLD: Record<string, string> = {
      'ega-translate-selection': 'Translate selection with Ega',
      'ega-sidepanel-selection': 'Send selection to side panel',
      'ega-translate-page': 'Translate this page with Ega',
      'ega-pick-element': 'Pick an element to translate',
      'ega-translate-image': 'Translate image with Ega',
      'ega-explain-image': 'Explain image with Ega',
      'ega-toggle-site': 'Disable Ega on this site',
    };
    // Older versions stored the shipped names and put page rows before image rows.
    const legacy = DEFAULT_CONTEXT_MENU_ITEMS.map((i, n) => ({
      ...i,
      label: OLD[i.id] ?? '',
      order: i.kind === 'image-task' ? 10 + n : n,
    }));
    expect(isMenuModified(legacy)).toBe(false);
  });

  it('is true for a hidden row, a renamed row or a reorder inside a group', () => {
    const [a, b, ...rest] = DEFAULT_CONTEXT_MENU_ITEMS;
    if (!a || !b) throw new Error('defaults missing');
    expect(isMenuModified([{ ...a, enabled: false }, b, ...rest])).toBe(true);
    expect(isMenuModified([{ ...a, label: 'Mine' }, b, ...rest])).toBe(true);
    expect(isMenuModified([{ ...b, order: 0 }, { ...a, order: 1 }, ...rest])).toBe(true);
  });
});

describe('withShippedIds', () => {
  it('gives back the shipped id an older version re-minted, so the row stays undeletable', () => {
    const items = DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
      i.id === 'ega-translate-image'
        ? {
            ...i,
            id: 'ega-custom-img-tt-7',
            surface: 'tooltip' as const,
            label: 'Translate image with Ega',
          }
        : i,
    );
    const row = withShippedIds(items).find(
      (i) => i.kind === 'image-task' && i.task === 'translate',
    );
    expect(row?.id).toBe('ega-translate-image');
    // The surface the user picked is kept.
    expect(row?.kind === 'image-task' ? row.surface : null).toBe('tooltip');
  });

  it('leaves a row the user added alone', () => {
    const added: ContextMenuItem = {
      id: 'ega-custom-img-sp-9',
      kind: 'image-task',
      enabled: true,
      order: 9,
      label: '',
      task: 'translate',
      surface: 'sidepanel',
    };
    expect(withShippedIds([...DEFAULT_CONTEXT_MENU_ITEMS, added])).toContainEqual(added);
  });

  it('never claims an added row that older versions gave the shipped name', () => {
    // Older versions named added image rows this too; a re-mint kept its place, an added row went last.
    const reminted: ContextMenuItem = {
      id: 'ega-custom-img-tt-7',
      kind: 'image-task',
      enabled: true,
      order: 2,
      label: 'Translate image with Ega',
      task: 'translate',
      surface: 'tooltip',
    };
    const added: ContextMenuItem = { ...reminted, id: 'ega-custom-img-sp-8', order: 9 };
    const withoutShipped = DEFAULT_CONTEXT_MENU_ITEMS.filter((i) => i.id !== 'ega-translate-image');
    // Stored array order is not menu order: the added row comes first in the array.
    const out = withShippedIds([added, ...withoutShipped, reminted]);
    expect(out.find((i) => i.id === 'ega-translate-image')?.order).toBe(2);
    expect(out).toContainEqual(added);

    // With the shipped row deleted, an added image row that sorts after another added image row stays added.
    const other: ContextMenuItem = { ...added, id: 'ega-custom-img-sp-7', order: 7, label: '' };
    expect(withShippedIds([...withoutShipped, other, added])).toContainEqual(added);
  });

  it('claims a re-minted image row back when an added text row sorts before it', () => {
    // Every write puts the text rows first, so an added text row always sorts before the image rows.
    const text: ContextMenuItem = {
      id: 'ega-custom-txt-tt-7',
      kind: 'task',
      enabled: true,
      order: 2,
      label: '',
      task: 'translate',
      surface: 'tooltip',
    };
    const items = [
      ...DEFAULT_CONTEXT_MENU_ITEMS.filter((i) => i.kind === 'task'),
      text,
      ...DEFAULT_CONTEXT_MENU_ITEMS.filter((i) => i.kind !== 'task').map((i) =>
        i.id === 'ega-translate-image'
          ? {
              ...i,
              id: 'ega-custom-img-tt-8',
              surface: 'tooltip' as const,
              label: 'Translate image with Ega',
            }
          : i,
      ),
    ].map((i, order) => ({ ...i, order }));
    const out = withShippedIds(items);
    expect(out.find((i) => i.id === 'ega-translate-image')?.order).toBe(3);
    expect(out).toContainEqual(text);
  });

  it('the settings search counts a re-minted shipped row as unchanged, as the card does', () => {
    // An older version re-minted the id on every surface change, even back to the shipped one.
    const items = DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
      i.id === 'ega-translate-image'
        ? { ...i, id: 'ega-custom-img-sp-7', label: 'Translate image with Ega' }
        : i,
    );
    const entry = SETTINGS_SPEC.find((e) => e.id === 'contextMenu.items');
    if (entry?.isModified?.kind !== 'custom') throw new Error('no custom isModified');
    expect(isMenuModified(withShippedIds(items))).toBe(false);
    expect(entry.isModified.fn({ ...DEFAULT_SETTINGS, contextMenuItems: items })).toBe(false);
  });
});

describe('resolveMenuAction', () => {
  it('ega-sidepanel-selection → {kind:task, task:translate, surface:sidepanel}', () => {
    const action = resolveMenuAction('ega-sidepanel-selection', DEFAULT_CONTEXT_MENU_ITEMS);
    expect(action).toEqual({ kind: 'task', task: 'translate', surface: 'sidepanel' });
  });

  it('ega-translate-selection → {kind:task, task:translate, surface:tooltip}', () => {
    const action = resolveMenuAction('ega-translate-selection', DEFAULT_CONTEXT_MENU_ITEMS);
    expect(action).toEqual({ kind: 'task', task: 'translate', surface: 'tooltip' });
  });

  it('ega-translate-image → {kind:image-task, task:translate, surface:sidepanel}', () => {
    const action = resolveMenuAction('ega-translate-image', DEFAULT_CONTEXT_MENU_ITEMS);
    expect(action).toEqual({ kind: 'image-task', task: 'translate', surface: 'sidepanel' });
  });

  it('ega-translate-page → {kind:page-translate}', () => {
    const action = resolveMenuAction('ega-translate-page', DEFAULT_CONTEXT_MENU_ITEMS);
    expect(action).toEqual({ kind: 'page-translate' });
  });

  it('ega-toggle-site → {kind:site-toggle}', () => {
    const action = resolveMenuAction('ega-toggle-site', DEFAULT_CONTEXT_MENU_ITEMS);
    expect(action).toEqual({ kind: 'site-toggle' });
  });

  it('unknown id → null', () => {
    const action = resolveMenuAction('non-existent-id', DEFAULT_CONTEXT_MENU_ITEMS);
    expect(action).toBeNull();
  });

  it('item with targetLang propagates it in action', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'custom-1',
        kind: 'task',
        enabled: true,
        order: 0,
        label: 'To French',
        task: 'translate',
        surface: 'tooltip',
        targetLang: 'fr' as LangSelection,
      },
    ];
    const action = resolveMenuAction('custom-1', items);
    expect(action).toBeDefined();
    if (action?.kind === 'task') {
      expect(action.targetLang).toBe('fr');
    }
  });
});

describe('nextMenuItemId', () => {
  it('returns a string not present in items', () => {
    const id = nextMenuItemId(DEFAULT_CONTEXT_MENU_ITEMS, 'task', 'tooltip');
    const existing = DEFAULT_CONTEXT_MENU_ITEMS.map((i) => i.id);
    expect(existing).not.toContain(id);
  });

  it('is unique across multiple calls with accumulated items', () => {
    const items: ContextMenuItem[] = [...DEFAULT_CONTEXT_MENU_ITEMS];
    const id1 = nextMenuItemId(items, 'task', 'tooltip');
    items.push({
      id: id1,
      kind: 'task',
      enabled: true,
      order: 99,
      label: 'Custom',
      task: 'translate',
      surface: 'tooltip',
    });
    const id2 = nextMenuItemId(items, 'task', 'tooltip');
    expect(id1).not.toBe(id2);
  });

  it('works on empty list', () => {
    const id = nextMenuItemId([], 'image-task', 'sidepanel');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
