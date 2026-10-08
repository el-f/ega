/** Keyboard block cursor shared by the element picker and translate-areas mode; each caller supplies which blocks it may stop on. */
export type PickableTest = (el: Element | null) => boolean;

export const CURSOR_NAV_KEYS = new Set(['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Tab']);

/**
 * The question-mark key that opens the bar. Arabic, Persian and Urdu layouts type U+061F there, and some
 * have no ASCII '?' at all. Not e.code: on AZERTY, '?' is Shift+KeyM.
 */
export function isKeysKey(e: KeyboardEvent): boolean {
  return e.key === '?' || e.key === '؟';
}

/** The element under the pointer now, from the browser's own hover state; null when the pointer is off the page. */
export function hoveredElement(): Element | null {
  const el = [...document.querySelectorAll(':hover')].at(-1) ?? null;
  return el === document.documentElement || el === document.body ? null : el;
}

const TEXT_BLOCKS =
  'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption, dd, dt, summary';

/** The first text block whose top edge is in view: where the keyboard starts when no pointer is on the page. */
export function firstBlockInView(ok: PickableTest): Element | null {
  for (const el of document.body.querySelectorAll(TEXT_BLOCKS)) {
    const r = el.getBoundingClientRect();
    if (
      r.height > 0 &&
      r.top >= 0 &&
      r.top < window.innerHeight &&
      el.textContent.trim() &&
      ok(el)
    ) {
      return el;
    }
  }
  return null;
}

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
