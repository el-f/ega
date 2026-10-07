import { debugCatch } from '@/shared/logger';
import { mount, unmount } from 'svelte';
import Bubble from './Bubble.svelte';
import type * as MenuMod from './bubble-menu';
import {
  getContainer,
  getShadowHostElement,
  peekContainer,
  onShadowHostRemount,
} from './shadowHost';

interface BubbleOpts {
  rect: DOMRect;
  queued: number;
  /** Translation direction, shown read-only; swapping lives in the tooltip action row. */
  direction?: { source: string; target: string };
  /** First-ever render for this install. Drives a 3× ring pulse so
   *  the affordance is discoverable. Parent persists the "seen" flag. */
  firstRun?: boolean;
  /** The selection's block runs right to left: the bubble lines up with its right edge. */
  rtl?: boolean;
  onClick: (e: MouseEvent) => void;
}

interface Mounted {
  handle: ReturnType<typeof mount>;
  anchor: HTMLDivElement;
  queued: number;
  direction: string;
  firstRun: boolean;
  rtl: boolean;
}

let current: Mounted | null = null;
let currentOnClick: ((e: MouseEvent) => void) | null = null;
// The menu loads on first open; most pages never open it.
let menuMod: typeof MenuMod | null = null;

/** The one import site for the menu chunk, so its preload list ships once in the eager script. */
export function loadBubbleMenu(): Promise<typeof MenuMod> {
  return import('./bubble-menu').then((m) => (menuMod = m));
}

const BUBBLE_HEIGHT = 28;
/** The mark, a 160px label and the chevron. */
const BUBBLE_WIDTH = 250;
// ponytail: a band check reads at most this many text nodes, then calls the band clear; raise it if long runs of empty-box text hide lines.
const MAX_TEXT_READS = 32;

/** A line of `walker`'s text crosses the band [top, top + 28] within [x0, x1]. Text runs down the page, so the walk stops at the first line past the band. */
function textInBand(
  walker: TreeWalker,
  from: Node | null,
  down: boolean,
  top: number,
  x0: number,
  x1: number,
): boolean {
  const range = document.createRange();
  let reads = 0;
  for (
    let n = from;
    n && reads < MAX_TEXT_READS;
    n = down ? walker.nextNode() : walker.previousNode()
  ) {
    if (!n.nodeValue?.trim()) continue;
    reads++;
    range.selectNodeContents(n);
    const rects = range.getClientRects();
    for (const r of rects) {
      if (r.bottom > top && r.top < top + BUBBLE_HEIGHT && r.right > x0 && r.left < x1) return true;
    }
    const edge = rects[down ? 0 : rects.length - 1];
    if (edge && (down ? edge.top >= top + BUBBLE_HEIGHT : edge.bottom <= top)) return false;
  }
  return false;
}

/** The selection's own lines and the text right after (or before) it, read from where the selection ends (or starts). */
function ownTextInBand(down: boolean, top: number, x0: number, x1: number): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  const at = down ? range.endContainer : range.startContainer;
  if (!document.body.contains(at)) return false;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  walker.currentNode = at;
  const from =
    at.nodeType === Node.TEXT_NODE ? at : down ? walker.nextNode() : walker.previousNode();
  return textInBand(walker, from, down, top, x0, x1);
}

/** `left` is the bubble's inline-start edge: its left side, or its right side on a right-to-left block. */
function placeBubble(rect: DOMRect, rtl: boolean): { left: number; top: number } {
  // Below the last line; above the first when below covers text or leaves the viewport and above covers none.
  const below = rect.bottom + 4;
  const above = rect.top - BUBBLE_HEIGHT - 4;
  const anchorX = rtl ? rect.right : rect.left;
  const left = rtl
    ? Math.max(BUBBLE_WIDTH, Math.min(window.innerWidth - 8, anchorX))
    : Math.max(8, Math.min(window.innerWidth - BUBBLE_WIDTH, anchorX));
  const x0 = rtl ? left - BUBBLE_WIDTH : left;
  const x1 = x0 + BUBBLE_WIDTH;
  const probeX = Math.max(4, Math.min(window.innerWidth - 4, anchorX + (rtl ? -16 : 16)));
  const covers = (top: number, down: boolean): boolean =>
    ownTextInBand(down, top, x0, x1) ||
    // Then what the page draws there, which page order can miss (floats, columns, positioned boxes).
    [top + 2, top + BUBBLE_HEIGHT / 2, top + BUBBLE_HEIGHT - 2].some((y) => {
      // An open bubble or tooltip hits as our host, which holds no page text; look past it.
      const hit = document
        .elementsFromPoint(probeX, Math.min(window.innerHeight - 4, Math.max(0, y)))
        .find((el) => el !== getShadowHostElement());
      if (!hit) return false;
      // An element that reaches the selection holds it, and the own walk read its lines; a probe between blocks hits <body>.
      const r = hit.getBoundingClientRect();
      const outside = down
        ? r.top >= rect.bottom - 2 && r.bottom > top
        : r.bottom <= rect.top + 2 && r.top < top + BUBBLE_HEIGHT;
      if (!outside) return false;
      const walker = document.createTreeWalker(hit, NodeFilter.SHOW_TEXT);
      return textInBand(walker, down ? walker.nextNode() : walker.lastChild(), down, top, x0, x1);
    });
  // The space above is probed only when the bubble cannot stay below.
  const goAbove =
    (below + BUBBLE_HEIGHT > window.innerHeight - 8 || covers(below, true)) &&
    above >= 4 &&
    !covers(above, false);
  return { left, top: goAbove ? above : Math.min(window.innerHeight - 32, below) };
}

function directionKey(d: BubbleOpts['direction']): string {
  return d ? `${d.source}>${d.target}` : '';
}

/** Dragging a selection fires ~60 events a second; a remount restarts the 120 ms pop animation on every one. */
function moveMounted(opts: BubbleOpts, left: number, top: number): boolean {
  if (!current) return false;
  if (
    current.queued !== opts.queued ||
    current.direction !== directionKey(opts.direction) ||
    current.firstRun !== (opts.firstRun === true) ||
    current.rtl !== (opts.rtl === true)
  ) {
    return false;
  }
  const btn = current.anchor.querySelector<HTMLElement>('.bubble-group');
  if (!btn?.isConnected) return false;
  btn.style.left = `${left}px`;
  btn.style.top = `${top}px`;
  return true;
}

export function showBubble(opts: BubbleOpts): void {
  const { left, top } = placeBubble(opts.rect, opts.rtl === true);
  if (moveMounted(opts, left, top)) {
    currentOnClick = opts.onClick;
    return;
  }
  hideBubble();
  currentOnClick = opts.onClick;
  const c = getContainer();
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-bubble-wrap', '');
  c.appendChild(anchor);
  const handle = mount(Bubble, {
    target: anchor,
    props: {
      left,
      top,
      queued: opts.queued,
      // exactOptionalPropertyTypes: only pass keys when set.
      ...(opts.direction ? { direction: opts.direction } : {}),
      ...(opts.firstRun ? { firstRun: true } : {}),
      ...(opts.rtl ? { rtl: true } : {}),
      onclick: (e: MouseEvent) => {
        currentOnClick?.(e);
        hideBubble();
      },
      onmenu: (
        chevron: HTMLButtonElement,
        viaKeyboard: boolean,
        returnTo: HTMLElement | null | undefined,
      ) => {
        void loadBubbleMenu().then((m) =>
          m.openBubbleMenu(chevron, { focusFirst: viaKeyboard, hideBubble, returnTo }),
        );
      },
    },
  });
  current = {
    handle,
    anchor,
    queued: opts.queued,
    direction: directionKey(opts.direction),
    firstRun: opts.firstRun === true,
    rtl: opts.rtl === true,
  };
}

export function hideBubble(): void {
  currentOnClick = null;
  menuMod?.closeBubbleMenu();
  if (current) {
    try {
      void unmount(current.handle);
    } catch (e) {
      debugCatch(e, 'content.bubble.1');
    }
    current.anchor.remove();
    current = null;
  }
  peekContainer()
    ?.querySelectorAll('[data-ega-bubble-wrap]')
    .forEach((w) => w.remove());
}

onShadowHostRemount(hideBubble);
// A right-click item acts on the selection, and Translate in side panel never messages this page.
document.addEventListener('contextmenu', () => hideBubble(), true);
