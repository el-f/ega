import { onShadowHostRemount } from '../shadowHost';
import { isPickable, isInsideEgaHost } from '../picker';
import { CURSOR_NAV_KEYS, hoveredElement, nextCursorTarget } from '../pick-cursor';
import { isSensitiveTarget } from '../safety';
import { showToast } from '../toast';
import { ensurePageStyles } from '../page-styles';
import { MAX_SELECTION_CHARS } from '@/shared/constants';
import type { RenderMode } from './store';
import { mountPickerBar, type PickerBarHandle } from '../picker-bar';
import { isUserGesture } from '../user-gesture';

export interface SelectedBlock {
  id: string;
  element: HTMLElement;
  text: string;
}

export interface MultiSelectOpts {
  initialMode: RenderMode;
  onModeChange?: (mode: RenderMode) => void;
  onFire: (blocks: SelectedBlock[], mode: RenderMode) => void;
}

const HOVER_ATTR = 'data-ega-ms-hover';
const SELECTED_ATTR = 'data-ega-ms-selected';
const CURSOR_ATTR = 'data-ega-ms-cursor';

/** Replacing one of these in place detaches the document — including the shadow host, so Cancel goes with it. */
const DOCUMENT_LEVEL_TAGS = new Set(['html', 'body', 'head']);
/** Page machinery and layout scaffolding: nothing readable inside, and a replacement breaks the surrounding box. */
const STRUCTURAL_TAGS = new Set([
  'base',
  'link',
  'meta',
  'noscript',
  'script',
  'style',
  'template',
  'title',
  'audio',
  'canvas',
  'embed',
  'iframe',
  'object',
  'svg',
  'video',
  'input',
  'option',
  'optgroup',
  'select',
  'textarea',
  'col',
  'colgroup',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
]);
const TRANSLATED_SEL = '[data-ega-replaced],[data-ega-tx]';
const ANNOUNCE_CHARS = 60;

interface MsSession {
  selected: Element[];
  mode: RenderMode;
  opts: MultiSelectOpts;
  bar: PickerBarHandle;
  hovered: Element | null;
  cursor: Element | null;
}

let ms: MsSession | null = null;

export function isMultiSelectActive(): boolean {
  return ms !== null;
}

/** One id per element, so a re-selected block keeps its id across sessions; WeakMap lets detached nodes go. */
const elementIdCache = new WeakMap<Element, string>();

function blockId(el: Element): string {
  let id = elementIdCache.get(el);
  if (id === undefined) {
    const b = new Uint8Array(4);
    globalThis.crypto.getRandomValues(b);
    id = 'b-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    elementIdCache.set(el, id);
  }
  return id;
}

function elementText(el: Element): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- innerText is undefined in jsdom, so both fallbacks are real
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isStructural(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return DOCUMENT_LEVEL_TAGS.has(tag) || STRUCTURAL_TAGS.has(tag);
}

function structuralReject(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (DOCUMENT_LEVEL_TAGS.has(tag)) return 'Pick a block inside the page, not the whole document.';
  if (STRUCTURAL_TAGS.has(tag)) return 'That element is not text. Pick a block inside it.';
  return null;
}

/** Cursor and hover targets. Looser than selectable: the user must be able to walk
 *  through a container that is itself too long to translate. */
function isNavigableBlock(el: Element | null): boolean {
  return !!el && isPickable(el) && !isStructural(el);
}

/** `null` when the block can be selected; otherwise the sentence to show the user. */
function selectReject(el: Element): string | null {
  const structural = structuralReject(el);
  if (structural !== null) return structural;
  if (
    el.closest(TRANSLATED_SEL) !== null ||
    el.querySelector(TRANSLATED_SEL) !== null ||
    // Bilingual leaves the source untouched and puts the translation next to it.
    el.nextElementSibling?.hasAttribute('data-ega-tx') === true
  ) {
    return 'That area is already translated.';
  }
  const text = elementText(el);
  if (!text) return 'Nothing to translate in that element.';
  if (text.length > MAX_SELECTION_CHARS) {
    return `That area is too long: ${text.length} characters, limit ${MAX_SELECTION_CHARS}. Pick smaller blocks inside it.`;
  }
  return null;
}

function countLabel(n: number): string {
  if (n === 0) return 'Click blocks to choose them';
  return n === 1 ? '1 area chosen' : `${n} areas chosen`;
}

function announce(text: string): void {
  ms?.bar.announce(text);
}

function patchToolbar(): void {
  if (!ms) return;
  const count = ms.selected.length;
  ms.bar.set({ status: countLabel(count), canTranslate: count > 0, mode: ms.mode });
}

function renumber(): void {
  if (!ms) return;
  ms.selected.forEach((el, i) => {
    el.setAttribute(SELECTED_ATTR, String(i + 1));
  });
}

function unselect(el: Element): void {
  if (!ms) return;
  el.removeAttribute(SELECTED_ATTR);
  ms.selected = ms.selected.filter((s) => s !== el);
  renumber();
  patchToolbar();
}

function select(el: Element): void {
  if (!ms) return;
  // A parent swallows selected children — nested picks would double-translate and break in-place mounts.
  const swallowed = ms.selected.filter((s) => el.contains(s));
  for (const s of swallowed) s.removeAttribute(SELECTED_ATTR);
  ms.selected = ms.selected.filter((s) => !el.contains(s));
  ms.selected.push(el);
  renumber();
  patchToolbar();
}

/** Click and Space share one path: inside a selection removes it, otherwise select or explain the refusal. */
function toggleSelect(el: Element): void {
  if (!ms) return;
  const owner = ms.selected.find((s) => s === el || s.contains(el));
  if (owner) {
    unselect(owner);
    announce(`Removed. ${countLabel(ms.selected.length)}`);
    return;
  }
  const reason = selectReject(el);
  if (reason !== null) {
    // A refusal replaces the bar's status for a moment; it is not a toast.
    ms.bar.flash(reason);
    announce(reason);
    return;
  }
  select(el);
  announce(`Selected. ${countLabel(ms.selected.length)}`);
}

function describeCursor(el: Element): string {
  const text = elementText(el);
  const snippet = text.length > ANNOUNCE_CHARS ? `${text.slice(0, ANNOUNCE_CHARS)}…` : text;
  const order = ms ? ms.selected.indexOf(el) : -1;
  const state = order >= 0 ? ` — selected, number ${order + 1}` : '';
  return `${snippet || 'Empty block'}${state}`;
}

function setCursor(el: Element | null): void {
  if (!ms || !el) return;
  ms.cursor?.removeAttribute(CURSOR_ATTR);
  ms.cursor = el;
  el.setAttribute(CURSOR_ATTR, '');
  el.scrollIntoView({ block: 'nearest' });
  announce(describeCursor(el));
}

function setMode(mode: RenderMode): void {
  if (!ms || ms.mode === mode) return;
  ms.mode = mode;
  patchToolbar();
  ms.opts.onModeChange?.(mode);
}

/** The segment's own text, so the spoken name and the checked segment never drift. */
function modeLabel(mode: RenderMode): string {
  return mode === 'inplace' ? 'Replace text' : 'Show both';
}

function fire(): void {
  if (!ms || ms.selected.length === 0) return;
  const blocks: SelectedBlock[] = [];
  let skipped = 0;
  for (const el of ms.selected) {
    const text = elementText(el);
    // The page can grow a block between pick and fire; cutting it here would drop page text on replace.
    if (!text || text.length > MAX_SELECTION_CHARS) {
      skipped++;
      continue;
    }
    blocks.push({ id: blockId(el), element: el as HTMLElement, text });
  }
  const { mode, opts } = ms;
  exitMultiSelect();
  if (blocks.length === 0) {
    showToast('Nothing to translate in the chosen areas.');
    return;
  }
  if (skipped > 0) {
    showToast(`Skipped ${skipped} area${skipped === 1 ? '' : 's'}: empty or too long.`);
  }
  opts.onFire(blocks, mode);
}

function hoverBlock(el: Element | null): void {
  if (!ms) return;
  const next = isNavigableBlock(el) ? el : null;
  if (ms.hovered === next) return;
  ms.hovered?.removeAttribute(HOVER_ATTR);
  ms.hovered = next;
  next?.setAttribute(HOVER_ATTR, '');
}

const onMouseMove = (e: MouseEvent): void => {
  hoverBlock(e.target as Element | null);
};

const onClick = (e: MouseEvent): void => {
  if (!ms || !isUserGesture(e)) return;
  const el = e.target as Element | null;
  if (!el) return;
  // Toolbar clicks pass through to the Svelte handlers.
  if (isInsideEgaHost(el)) return;
  e.preventDefault();
  e.stopPropagation();
  if (isSensitiveTarget(el)) {
    ms.bar.flash("Ega doesn't read password, card or code fields, or text you can edit.");
    return;
  }
  if (!isPickable(el)) return;
  toggleSelect(el);
};

const onKeyDown = (e: KeyboardEvent): void => {
  if (!ms || !isUserGesture(e)) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    // Immediate: inline's Esc listener on the same node, added later, must not count this one.
    e.stopImmediatePropagation();
    exitMultiSelect();
    return;
  }
  // Focus sits on a toolbar button: Tab, Space and Enter belong to it, not to the block walk.
  if (isInsideEgaHost(e.target as Element | null)) return;
  // Bare key only: Cmd+M minimizes the window on a Mac, and Ctrl+M is the browser's.
  if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    const next: RenderMode = ms.mode === 'inplace' ? 'bilingual' : 'inplace';
    setMode(next);
    announce(modeLabel(next));
    return;
  }
  if (e.key === 'Enter') {
    if (ms.selected.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    fire();
    return;
  }
  if (e.key === ' ') {
    if (!ms.cursor) return;
    e.preventDefault();
    e.stopPropagation();
    toggleSelect(ms.cursor);
    return;
  }
  if (!CURSOR_NAV_KEYS.has(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  setCursor(nextCursorTarget(ms.cursor, e.key, e.shiftKey, isNavigableBlock));
};

// exit() must run when the page detaches the shadow host, or the mode stays armed with no toolbar.
onShadowHostRemount(() => {
  if (ms) exitMultiSelect();
});

export function enterMultiSelect(opts: MultiSelectOpts): void {
  if (ms) return;
  ensurePageStyles();
  const bar = mountPickerBar({
    kind: 'areas',
    initialStatus: countLabel(0),
    initialMode: opts.initialMode,
    onTranslate: () => {
      fire();
    },
    onModeSelect: (m: RenderMode) => {
      setMode(m);
    },
    onCancel: () => {
      exitMultiSelect();
    },
  });
  bar.anchor.setAttribute('data-ega-ms-wrap', '');
  ms = { selected: [], mode: opts.initialMode, opts, bar, hovered: null, cursor: null };
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  // The block under the pointer is outlined at once, before the first mouse move.
  hoverBlock(hoveredElement());
}

export function exitMultiSelect(): void {
  if (!ms) return;
  const session = ms;
  ms = null;
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  session.hovered?.removeAttribute(HOVER_ATTR);
  session.cursor?.removeAttribute(CURSOR_ATTR);
  for (const el of session.selected) el.removeAttribute(SELECTED_ATTR);
  session.bar.destroy();
}
