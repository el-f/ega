import { isSensitiveTarget } from './safety';
import { MAX_SELECTION_CHARS } from '@/shared/constants';
import { showToast } from './toast';
import { getShadowHostElement } from './shadowHost';
import { CURSOR_NAV_KEYS, nextCursorTarget } from './pick-cursor';
import { isUserGesture } from './user-gesture';
import { ensurePageStyles } from './page-styles';

const PICKING_ATTR = 'data-ega-picking';
export const PRIVATE_FIELD_REASON =
  'Ega does not read password, card or other private fields, or text you can edit.';

export interface PickResult {
  text: string;
  element: Element;
  rect: DOMRect;
}

export interface PickerOpts {
  onPick: (r: PickResult) => void;
  onExit: () => void;
  /** `null` clears the highlight (the cursor is on Ega's own UI); `blocked` marks a private field Ega will not read. The listener measures the element itself. */
  onHover?: (h: { element: Element; blocked?: true } | null) => void;
}

export interface PickerController {
  enter(): void;
  exit(): void;
  isActive(): boolean;
}

/** Reads the host this module built — a page decoy carrying our id must not be treated as ours. */
export function isInsideEgaHost(el: Element | null): boolean {
  const host = getShadowHostElement();
  if (!host || !el) return false;
  return host.contains(el);
}

export function isPickable(el: Element | null): boolean {
  if (!el) return false;
  if (isInsideEgaHost(el)) return false;
  return !isSensitiveTarget(el);
}

export function createPicker(opts: PickerOpts): PickerController {
  let active = false;
  let cursor: Element | null = null;

  const onMouseMove = (e: MouseEvent): void => {
    const el = e.target as Element | null;
    if (!el) return;
    if (!isPickable(el)) {
      // Clearing the cursor too: Enter must not pick an element the outline no longer marks.
      cursor = null;
      // A private field is marked as refused, not skipped in silence, so the user learns why.
      opts.onHover?.(isInsideEgaHost(el) ? null : { element: el, blocked: true });
      return;
    }
    cursor = el;
    opts.onHover?.({ element: el });
  };

  function pick(el: Element): void {
    // innerText respects display:none but is undefined in jsdom, so both fallbacks run despite the non-null types.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const rawText = ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
    // A click on an element with no text still ends the mode, or the overlay stays up with nothing to translate.
    const rect = el.getBoundingClientRect();
    exit();
    if (!rawText) {
      showToast('Nothing to translate in that element.');
      return;
    }
    const text =
      rawText.length > MAX_SELECTION_CHARS ? rawText.slice(0, MAX_SELECTION_CHARS) : rawText;
    opts.onPick({ text, element: el, rect });
  }

  const onClick = (e: MouseEvent): void => {
    if (!isUserGesture(e)) return;
    const el = e.target as Element | null;
    if (!el) return;
    if (isInsideEgaHost(el)) return;
    e.preventDefault();
    e.stopPropagation();
    if (isSensitiveTarget(el)) {
      showToast(PRIVATE_FIELD_REASON);
      return;
    }
    pick(el);
  };

  function moveCursor(el: Element | null): void {
    if (!el) return;
    cursor = el;
    el.scrollIntoView({ block: 'nearest' });
    opts.onHover?.({ element: el });
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!isUserGesture(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      exit();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (!cursor) return;
      e.preventDefault();
      e.stopPropagation();
      pick(cursor);
      return;
    }
    if (!CURSOR_NAV_KEYS.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    moveCursor(nextCursorTarget(cursor, e.key, e.shiftKey, isPickable));
  };

  function enter(): void {
    if (active) return;
    active = true;
    ensurePageStyles();
    document.documentElement.setAttribute(PICKING_ATTR, '');
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function exit(): void {
    if (!active) return;
    active = false;
    cursor = null;
    document.documentElement.removeAttribute(PICKING_ATTR);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    opts.onExit();
  }

  return { enter, exit, isActive: () => active };
}
