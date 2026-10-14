/** Menu id decoding kept out of context-menu.ts, which rides the settings chunk every page loads. */
import { DEFAULT_CONTEXT_MENU_ITEMS, type ContextMenuItem, type MenuSurface } from './context-menu';

/** A cold-SW click must decide sidePanel.open synchronously, and the id is the only data it can read without storage.
 *  `-as-<stored id>` is the alias for a row whose stored id does not encode its surface; an imported id may hold any
 *  character, a line break too. */
const CUSTOM_MENU_ID_RE = /^ega-custom-(txt|img)-(tt|sp)-(?:\d+|as-.+)$/s;

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

/** Aliases every id that does not encode its own surface — a shipped id with an edited surface, or an
 *  imported or upgraded one — since the click's sync half reads the id alone. The alias is built from the
 *  stored id, so adding, deleting or moving another row never renames it in Chrome. */
export function withEncodedMenuIds(items: readonly ContextMenuItem[]): ContextMenuItem[] {
  const taken = new Set(items.map((i) => i.id));
  return items.map((item) => {
    if (
      (item.kind !== 'task' && item.kind !== 'image-task') ||
      encodedSurface(item.id, item.kind) === item.surface
    ) {
      return item;
    }
    const k = item.kind === 'image-task' ? 'img' : 'txt';
    const s = item.surface === 'sidepanel' ? 'sp' : 'tt';
    let id = `ega-custom-${k}-${s}-as-${item.id}`;
    // Only a stored id that already looks like an alias can collide.
    while (taken.has(id)) id = `ega-custom-${k}-${s}-as-${id}`;
    taken.add(id);
    return { ...item, id };
  });
}
