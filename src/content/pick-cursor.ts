/** Keyboard block cursor shared by the element picker and translate-areas mode; each caller supplies which blocks it may stop on. */
export type PickableTest = (el: Element | null) => boolean;

export const CURSOR_NAV_KEYS = new Set(['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Tab']);

function firstPickableChild(el: Element, ok: PickableTest): Element | null {
  for (const child of Array.from(el.children)) {
    if (ok(child)) return child;
  }
  return null;
}

function pickableSibling(el: Element, forward: boolean, ok: PickableTest): Element | null {
  let cur = forward ? el.nextElementSibling : el.previousElementSibling;
  while (cur && !ok(cur)) {
    cur = forward ? cur.nextElementSibling : cur.previousElementSibling;
  }
  return cur;
}

function pickableParent(el: Element, ok: PickableTest): Element | null {
  const parent = el.parentElement;
  if (!parent || parent === document.documentElement) return null;
  return ok(parent) ? parent : null;
}

/** Down/right descends, up/left climbs, Tab walks siblings. `null` leaves the cursor put. */
export function nextCursorTarget(
  cursor: Element | null,
  key: string,
  shiftKey: boolean,
  ok: PickableTest,
): Element | null {
  if (!cursor) return firstPickableChild(document.body, ok);
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return firstPickableChild(cursor, ok);
    case 'ArrowUp':
    case 'ArrowLeft':
      return pickableParent(cursor, ok);
    default:
      return pickableSibling(cursor, !shiftKey, ok);
  }
}
