import { describe, expect, it } from 'vitest';
import type { LangSelection } from '@/shared/types';
import {
  DEFAULT_CONTEXT_MENU_ITEMS,
  ROOT_MENU_ID,
  buildMenuTree,
  contextsFor,
  nextMenuItemId,
  resolveMenuAction,
  withImageSurface,
  type ContextMenuItem,
} from '@/shared/context-menu';
import { decodeCustomMenuId } from '@/shared/context-menu-ids';

describe('DEFAULT_CONTEXT_MENU_ITEMS', () => {
  it('contains the built-in ids', () => {
    const ids = DEFAULT_CONTEXT_MENU_ITEMS.map((i) => i.id);
    expect(ids).toContain('ega-translate-selection');
    expect(ids).toContain('ega-translate-page');
    expect(ids).toContain('ega-pick-element');
    expect(ids).toContain('ega-translate-image');
    expect(ids).toContain('ega-explain-image');
    expect(ids).toContain('ega-toggle-site');
  });

  it('contains new ega-sidepanel-selection as task/sidepanel', () => {
    const item = DEFAULT_CONTEXT_MENU_ITEMS.find((i) => i.id === 'ega-sidepanel-selection');
    expect(item).toBeDefined();
    expect(item?.kind).toBe('task');
    if (item?.kind === 'task') {
      expect(item.surface).toBe('sidepanel');
      expect(item.task).toBe('translate');
    }
  });
});

describe('buildMenuTree — flat', () => {
  it('returns enabled items as top-level nodes in order', () => {
    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, 'flat');
    const enabledCount = DEFAULT_CONTEXT_MENU_ITEMS.filter((i) => i.enabled).length;
    expect(nodes).toHaveLength(enabledCount);
    expect(nodes.every((n) => n.parentId === undefined)).toBe(true);
  });

  it('items are sorted by order field', () => {
    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, 'flat');
    const orders = nodes.map((n) => {
      const item = DEFAULT_CONTEXT_MENU_ITEMS.find((i) => i.id === n.id);
      return item?.order ?? -1;
    });
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('task items use selection context', () => {
    const selectionItem = DEFAULT_CONTEXT_MENU_ITEMS.find(
      (i) => i.id === 'ega-translate-selection',
    );
    expect(selectionItem).toBeDefined();
    if (selectionItem) {
      expect(contextsFor(selectionItem)).toContain('selection');
    }
  });

  it('image-task items use image context', () => {
    const imageItem = DEFAULT_CONTEXT_MENU_ITEMS.find((i) => i.id === 'ega-translate-image');
    expect(imageItem).toBeDefined();
    if (imageItem) {
      expect(contextsFor(imageItem)).toContain('image');
    }
  });

  it('page-kind items use page context', () => {
    const pageItem = DEFAULT_CONTEXT_MENU_ITEMS.find((i) => i.id === 'ega-translate-page');
    expect(pageItem).toBeDefined();
    if (pageItem) {
      expect(contextsFor(pageItem)).toContain('page');
    }
  });

  it('excluded disabled items', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'ega-translate-selection',
        kind: 'task',
        enabled: false,
        order: 0,
        label: 'Translate',
        task: 'translate',
        surface: 'tooltip',
      },
      {
        id: 'ega-translate-page',
        kind: 'page-translate',
        enabled: true,
        order: 1,
        label: 'Translate page',
      },
    ];
    const nodes = buildMenuTree(items, 'flat');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.id).toBe('ega-translate-page');
  });

  it('empty enabled set returns []', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'ega-translate-selection',
        kind: 'task',
        enabled: false,
        order: 0,
        label: 'Translate',
        task: 'translate',
        surface: 'tooltip',
      },
    ];
    expect(buildMenuTree(items, 'flat')).toEqual([]);
  });
});

describe('buildMenuTree — nested', () => {
  it('returns root node first with id ega-root and title Ega', () => {
    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, 'nested');
    expect(nodes[0]?.id).toBe(ROOT_MENU_ID);
    expect(nodes[0]?.title).toBe('Ega');
    expect(nodes[0]?.parentId).toBeUndefined();
  });

  it('child nodes have parentId ega-root', () => {
    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, 'nested');
    const children = nodes.slice(1);
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((n) => n.parentId === ROOT_MENU_ID)).toBe(true);
  });

  it('root contexts is union of all child contexts', () => {
    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, 'nested');
    const root = nodes[0];
    expect(root).toBeDefined();
    if (root) {
      expect(root.contexts).toContain('selection');
      expect(root.contexts).toContain('image');
      expect(root.contexts).toContain('page');
    }
  });

  it('empty enabled set returns [] — no root', () => {
    const items: ContextMenuItem[] = [
      {
        id: 'ega-translate-selection',
        kind: 'task',
        enabled: false,
        order: 0,
        label: 'Translate',
        task: 'translate',
        surface: 'tooltip',
      },
    ];
    expect(buildMenuTree(items, 'nested')).toEqual([]);
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

describe('withImageSurface', () => {
  it('re-mints every image id so the cold-SW click decodes the new surface', () => {
    const out = withImageSurface(DEFAULT_CONTEXT_MENU_ITEMS, 'tooltip');
    const imageIds = out.filter((i) => i.kind === 'image-task').map((i) => i.id);

    expect(imageIds.length).toBe(2);
    for (const id of imageIds) {
      expect(decodeCustomMenuId(id)).toEqual({ kind: 'image-task', surface: 'tooltip' });
    }
  });

  it('gives the two image items distinct ids', () => {
    const out = withImageSurface(DEFAULT_CONTEXT_MENU_ITEMS, 'tooltip');
    const imageIds = out.filter((i) => i.kind === 'image-task').map((i) => i.id);

    expect(new Set(imageIds).size).toBe(imageIds.length);
  });

  it('does not collide with an existing custom id', () => {
    const items: ContextMenuItem[] = [
      ...DEFAULT_CONTEXT_MENU_ITEMS,
      {
        id: nextMenuItemId(DEFAULT_CONTEXT_MENU_ITEMS, 'image-task', 'tooltip'),
        kind: 'image-task',
        enabled: true,
        order: 7,
        label: 'Custom image',
        task: 'translate',
        surface: 'tooltip',
      },
    ];
    const out = withImageSurface(items, 'tooltip');
    const ids = out.map((i) => i.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('changes nothing when the surface already matches', () => {
    expect(withImageSurface(DEFAULT_CONTEXT_MENU_ITEMS, 'sidepanel')).toEqual(
      DEFAULT_CONTEXT_MENU_ITEMS,
    );
  });

  it('leaves non-image items untouched', () => {
    const out = withImageSurface(DEFAULT_CONTEXT_MENU_ITEMS, 'tooltip');
    const others = out.filter((i) => i.kind !== 'image-task');

    expect(others).toEqual(DEFAULT_CONTEXT_MENU_ITEMS.filter((i) => i.kind !== 'image-task'));
  });
});
