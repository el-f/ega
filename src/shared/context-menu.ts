/** Pure model and tree builder for the right-click menu. No chrome.* calls, so the background owns registration. */
import type { Task } from './task-prompts';
import type { LangSelection } from './types';

export type MenuSurface = 'tooltip' | 'sidepanel';
export type MenuLayout = 'nested' | 'flat';

export type ContextMenuItem =
  | {
      id: string;
      kind: 'task';
      enabled: boolean;
      order: number;
      label: string;
      task: Task;
      surface: MenuSurface;
      targetLang?: LangSelection;
    }
  | {
      id: string;
      kind: 'image-task';
      enabled: boolean;
      order: number;
      label: string;
      task: 'translate' | 'explain';
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

/** chrome.contextMenus contexts per item kind. */
export function contextsFor(item: ContextMenuItem): ContextType[] {
  switch (item.kind) {
    case 'task':
      return ['selection'];
    case 'image-task':
      return ['image'];
    case 'page-translate':
    case 'pick-element':
    case 'site-toggle':
      return ['page'];
  }
}

export const DEFAULT_CONTEXT_MENU_ITEMS: ContextMenuItem[] = [
  {
    id: 'ega-translate-selection',
    kind: 'task',
    enabled: true,
    order: 0,
    label: 'Translate selection with Ega',
    task: 'translate',
    surface: 'tooltip',
  },
  {
    id: 'ega-sidepanel-selection',
    kind: 'task',
    enabled: true,
    order: 1,
    label: 'Send selection to side panel',
    task: 'translate',
    surface: 'sidepanel',
  },
  {
    id: 'ega-translate-page',
    kind: 'page-translate',
    enabled: true,
    order: 2,
    label: 'Translate this page with Ega',
  },
  {
    id: 'ega-pick-element',
    kind: 'pick-element',
    enabled: true,
    order: 3,
    label: 'Pick an element to translate',
  },
  {
    id: 'ega-translate-image',
    kind: 'image-task',
    enabled: true,
    order: 4,
    label: 'Translate image with Ega',
    task: 'translate',
    // Matches DEFAULT_SETTINGS.imageTranslateSurface — a fresh install must not disagree with itself.
    surface: 'sidepanel',
  },
  {
    id: 'ega-explain-image',
    kind: 'image-task',
    enabled: true,
    order: 5,
    label: 'Explain image with Ega',
    task: 'explain',
    surface: 'sidepanel',
  },
  {
    id: 'ega-toggle-site',
    kind: 'site-toggle',
    enabled: true,
    order: 6,
    label: 'Disable Ega on this site',
  },
];

/** Stamp `surface` onto every image item. The Display-tab global and the v3→v4 migration both write through this. */
export function withImageSurface(
  items: readonly ContextMenuItem[],
  surface: MenuSurface,
): ContextMenuItem[] {
  const out: ContextMenuItem[] = [];
  for (const item of items) {
    if (item.kind !== 'image-task' || item.surface === surface) {
      out.push(item);
      continue;
    }
    // Re-mint the id so it always encodes the surface — the cold-SW click decides from the id alone.
    out.push({ ...item, surface, id: nextMenuItemId([...items, ...out], 'image-task', surface) });
  }
  return out;
}

export interface MenuNode {
  id: string;
  title: string;
  contexts: ContextType[];
  parentId?: string;
}

/** Ordered create() descriptors. nested → an Ega root first, then children. */
export function buildMenuTree(items: readonly ContextMenuItem[], layout: MenuLayout): MenuNode[] {
  const enabled = items
    .filter((i) => i.enabled)
    .slice()
    .sort((a, b) => a.order - b.order);
  if (enabled.length === 0) return [];
  if (layout === 'flat') {
    return enabled.map((i) => ({ id: i.id, title: i.label, contexts: contextsFor(i) }));
  }
  const union = Array.from(new Set(enabled.flatMap((i) => contextsFor(i))));
  const root: MenuNode = { id: ROOT_MENU_ID, title: 'Ega', contexts: union };
  return [
    root,
    ...enabled.map((i) => ({
      id: i.id,
      title: i.label,
      contexts: contextsFor(i),
      parentId: ROOT_MENU_ID,
    })),
  ];
}

export interface MenuAction {
  kind: ContextMenuItem['kind'];
  task?: Task;
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
