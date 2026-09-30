/** Menu id decoding for the service worker only: context-menu.ts rides the settings chunk every page loads. */
import {
  DEFAULT_CONTEXT_MENU_ITEMS,
  nextMenuItemId,
  type ContextMenuItem,
  type MenuSurface,
} from './context-menu';

/** A cold-SW click must decide sidePanel.open synchronously, and the id is the only data it can read without storage. */
const CUSTOM_MENU_ID_RE = /^ega-custom-(txt|img)-(tt|sp)-\d+$/;

export function decodeCustomMenuId(
  id: string,
): { kind: 'task' | 'image-task'; surface: MenuSurface } | null {
  const m = CUSTOM_MENU_ID_RE.exec(id);
  if (!m) return null;
  return {
    kind: m[1] === 'img' ? 'image-task' : 'task',
    surface: m[2] === 'sp' ? 'sidepanel' : 'tooltip',
  };
}

function encodedSurface(id: string, kind: 'task' | 'image-task'): MenuSurface | undefined {
  const custom = decodeCustomMenuId(id);
  if (custom) return custom.kind === kind ? custom.surface : undefined;
  const def = DEFAULT_CONTEXT_MENU_ITEMS.find((i) => i.id === id);
  if (def && (def.kind === 'task' || def.kind === 'image-task') && def.kind === kind) {
    return def.surface;
  }
  return undefined;
}

/** Re-mints every id that does not encode its own surface — an imported or upgraded profile
 *  can hold a default id with an edited surface, and the click's sync half reads the id alone. */
export function withEncodedMenuIds(items: readonly ContextMenuItem[]): ContextMenuItem[] {
  const out: ContextMenuItem[] = [];
  for (const item of items) {
    if (
      (item.kind !== 'task' && item.kind !== 'image-task') ||
      encodedSurface(item.id, item.kind) === item.surface
    ) {
      out.push(item);
      continue;
    }
    out.push({ ...item, id: nextMenuItemId([...items, ...out], item.kind, item.surface) });
  }
  return out;
}
