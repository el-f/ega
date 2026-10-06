/** Menu names, the shipped-row marker and the "modified" test. Kept out of context-menu.ts, which rides
 *  the settings chunk the popup preloads; only the worker and the options card need these. */
import {
  DEFAULT_CONTEXT_MENU_ITEMS,
  menuGroupOf,
  type ContextMenuItem,
  type MenuGroup,
  type MenuSurface,
} from './context-menu';

const SHIPPED_IDS: ReadonlySet<string> = new Set(DEFAULT_CONTEXT_MENU_ITEMS.map((i) => i.id));

/** A row Ega ships: the user can hide it, never delete it. */
export function isShippedItem(item: ContextMenuItem): boolean {
  return SHIPPED_IDS.has(item.id);
}

/** The names older versions stored for the shipped rows; a stored copy of one is not a name the user chose. */
const LEGACY_SHIPPED_LABELS: Readonly<Record<string, string>> = {
  'ega-translate-selection': 'Translate selection with Ega',
  'ega-sidepanel-selection': 'Send selection to side panel',
  'ega-translate-page': 'Translate this page with Ega',
  'ega-pick-element': 'Pick an element to translate',
  'ega-translate-image': 'Translate image with Ega',
  'ega-explain-image': 'Explain image with Ega',
  'ega-toggle-site': 'Disable Ega on this site',
};
// "New text action" was the placeholder an added row shipped with until renamed.
const LEGACY_LABELS: ReadonlySet<string> = new Set([
  ...Object.values(LEGACY_SHIPPED_LABELS),
  'New text action',
]);

/** The name the user typed, or '' when the item uses its automatic name. The site toggle has no custom name. */
export function customMenuLabel(item: ContextMenuItem): string {
  if (item.kind === 'site-toggle') return '';
  const label = item.label.trim();
  return LEGACY_LABELS.has(label) ? '' : label;
}

export const SITE_TOGGLE_TITLES = {
  on: 'Disable Ega on this site',
  off: 'Enable Ega on this site',
} as const;

export interface MenuNameLookup {
  taskLabel: (id: string) => string;
  langLabel: (id: string) => string;
}

/** The name Ega gives an item from what it does. No name says "with Ega": every item sits under "Ega ▸". */
export function autoMenuName(item: ContextMenuItem, lookup: MenuNameLookup): string {
  const where = (surface: MenuSurface): string => (surface === 'sidepanel' ? ' in side panel' : '');
  switch (item.kind) {
    case 'task': {
      const task = lookup.taskLabel(item.task);
      if (item.targetLang === undefined) return task + where(item.surface);
      const lang = lookup.langLabel(item.targetLang);
      const base = item.task === 'translate' ? `${task} into ${lang}` : `${task} in ${lang}`;
      return base + where(item.surface);
    }
    case 'image-task':
      return (item.task === 'explain' ? 'Explain image' : 'Translate image') + where(item.surface);
    case 'page-translate':
      return 'Translate this page';
    case 'pick-element':
      return 'Pick an element to translate';
    case 'site-toggle':
      return SITE_TOGGLE_TITLES.on;
  }
}

/** The title Chrome shows: the typed name, else the automatic one. */
export function menuItemName(item: ContextMenuItem, lookup: MenuNameLookup): string {
  return customMenuLabel(item) || autoMenuName(item, lookup);
}

/** Order-free view of what the user changed: per group, each row's id, shown state, name and options. */
function menuFingerprint(items: readonly ContextMenuItem[]): string {
  const rows = items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((i) => ({
      group: menuGroupOf(i),
      id: i.id,
      enabled: i.enabled || i.kind === 'site-toggle',
      label: customMenuLabel(i),
      task: 'task' in i ? i.task : null,
      surface: 'surface' in i ? i.surface : null,
      targetLang: i.kind === 'task' ? (i.targetLang ?? null) : null,
    }));
  const groups: MenuGroup[] = ['selection', 'image', 'page'];
  return JSON.stringify(groups.map((g) => rows.filter((r) => r.group === g)));
}

const DEFAULT_FINGERPRINT = menuFingerprint(DEFAULT_CONTEXT_MENU_ITEMS);

/** True when the menu differs from the shipped one. Order across groups and old stored names do not count. */
export function isMenuModified(items: readonly ContextMenuItem[]): boolean {
  return menuFingerprint(items) !== DEFAULT_FINGERPRINT;
}

/** Gives a shipped row back its shipped id when an older version re-minted it on a surface change, so it stays undeletable. */
export function withShippedIds(items: readonly ContextMenuItem[]): ContextMenuItem[] {
  const present = new Set(items.map((i) => i.id));
  const out = items.slice();
  for (const def of DEFAULT_CONTEXT_MENU_ITEMS) {
    if (present.has(def.id) || (def.kind !== 'task' && def.kind !== 'image-task')) continue;
    const legacy = LEGACY_SHIPPED_LABELS[def.id];
    const at = out.findIndex(
      (i) =>
        i.kind === def.kind &&
        'task' in i &&
        i.task === def.task &&
        i.label === legacy &&
        i.id.startsWith('ega-custom-') &&
        !SHIPPED_IDS.has(i.id),
    );
    const found = out[at];
    if (!found) continue;
    out[at] = { ...found, id: def.id };
    present.add(def.id);
  }
  return out;
}
