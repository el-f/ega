/** Pure model and tree builder for the right-click menu. No chrome.* calls, so the background owns registration. */
import type { TaskId } from './task-view';
import type { LangSelection } from './types';

export type MenuSurface = 'tooltip' | 'sidepanel';

export type ContextMenuItem =
  | {
      id: string;
      kind: 'task';
      enabled: boolean;
      order: number;
      label: string;
      task: TaskId;
      surface: MenuSurface;
      targetLang?: LangSelection;
    }
  | {
      id: string;
      kind: 'image-task';
      enabled: boolean;
      order: number;
      label: string;
      task: TaskId;
      surface: MenuSurface;
    }
  | {
      id: string;
      kind: 'page-translate' | 'pick-element' | 'site-toggle';
      enabled: boolean;
      order: number;
      label: string;
    };

export const ROOT_MENU_ID = 'ega-root';

export type ContextType = `${chrome.contextMenus.ContextType}`;

/** The three menus Chrome draws for Ega, one per right-click target. */
export type MenuGroup = 'selection' | 'image' | 'page';

/** Which of the three menus an item shows in. */
export function menuGroupOf(item: ContextMenuItem): MenuGroup {
  switch (item.kind) {
    case 'task':
      return 'selection';
    case 'image-task':
      return 'image';
    case 'page-translate':
    case 'pick-element':
    case 'site-toggle':
      return 'page';
  }
}

/** chrome.contextMenus contexts per item kind. */
export function contextsFor(item: ContextMenuItem): ContextType[] {
  return [menuGroupOf(item)];
}

// An empty label means "use the automatic name", so a new task or language renames the item by itself.
export const DEFAULT_CONTEXT_MENU_ITEMS: ContextMenuItem[] = [
  {
    id: 'ega-translate-selection',
    kind: 'task',
    enabled: true,
    order: 0,
    label: '',
    task: 'translate',
    surface: 'tooltip',
  },
  {
    id: 'ega-sidepanel-selection',
    kind: 'task',
    enabled: true,
    order: 1,
    label: '',
    task: 'translate',
    surface: 'sidepanel',
  },
  {
    id: 'ega-translate-image',
    kind: 'image-task',
    enabled: true,
    order: 2,
    label: '',
    task: 'translate',
    surface: 'sidepanel',
  },
  {
    id: 'ega-explain-image',
    kind: 'image-task',
    enabled: true,
    order: 3,
    label: '',
    task: 'explain',
    surface: 'sidepanel',
  },
  { id: 'ega-translate-page', kind: 'page-translate', enabled: true, order: 4, label: '' },
  { id: 'ega-pick-element', kind: 'pick-element', enabled: true, order: 5, label: '' },
  { id: 'ega-toggle-site', kind: 'site-toggle', enabled: true, order: 6, label: '' },
];

export interface MenuNode {
  id: string;
  title: string;
  contexts: ContextType[];
  parentId?: string;
}

/** Ordered create() descriptors: an "Ega" root first, then the shown items under it. Chrome groups an
 *  extension's items under one parent anyway, so the root keeps that parent's name short and stable. */
export function buildMenuTree(
  items: readonly ContextMenuItem[],
  titleOf: (item: ContextMenuItem) => string,
): MenuNode[] {
  const shown = items
    .filter((i) => i.enabled || i.kind === 'site-toggle')
    .slice()
    .sort((a, b) => a.order - b.order);
  if (shown.length === 0) return [];
  const union = Array.from(new Set(shown.flatMap((i) => contextsFor(i))));
  const root: MenuNode = { id: ROOT_MENU_ID, title: 'Ega', contexts: union };
  return [
    root,
    ...shown.map((i) => ({
      id: i.id,
      title: titleOf(i),
      contexts: contextsFor(i),
      parentId: ROOT_MENU_ID,
    })),
  ];
}

export interface MenuAction {
  kind: ContextMenuItem['kind'];
  task?: TaskId;
  surface?: MenuSurface;
  targetLang?: LangSelection;
}

/** Map a clicked menu id to its action descriptor. null when unknown. */
export function resolveMenuAction(
  id: string,
  items: readonly ContextMenuItem[],
): MenuAction | null {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  if (item.kind === 'task') {
    return {
      kind: 'task',
      task: item.task,
      surface: item.surface,
      ...(item.targetLang !== undefined ? { targetLang: item.targetLang } : {}),
    };
  }
  if (item.kind === 'image-task') {
    return { kind: 'image-task', task: item.task, surface: item.surface };
  }
  return { kind: item.kind };
}

/** Encodes kind and surface in the id so a cold-SW click can decide sidePanel.open without storage. */
export function nextMenuItemId(
  items: readonly ContextMenuItem[],
  kind: 'task' | 'image-task',
  surface: MenuSurface,
): string {
  const k = kind === 'image-task' ? 'img' : 'txt';
  const s = surface === 'sidepanel' ? 'sp' : 'tt';
  let n = items.length;
  const taken = new Set(items.map((i) => i.id));
  let id = `ega-custom-${k}-${s}-${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `ega-custom-${k}-${s}-${n}`;
  }
  return id;
}
