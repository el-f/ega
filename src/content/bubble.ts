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

// A probe that lands between blocks hits `<body>` or `#app`, whose textContent is the whole page.
function hasText(el: Element): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue?.trim()) return true;
  }
  return false;
}

/** `left` is the bubble's inline-start edge: its left side, or its right side on a right-to-left block. */
function placeBubble(rect: DOMRect, rtl: boolean): { left: number; top: number } {
  // Below the last line; above the first when below covers text or leaves the viewport and above covers none.
  const below = rect.bottom + 4;
  const above = rect.top - BUBBLE_HEIGHT - 4;
  const anchorX = rtl ? rect.right : rect.left;
  const probeX = Math.max(4, Math.min(window.innerWidth - 4, anchorX + (rtl ? -16 : 16)));
  // ponytail: two probes per spot, text in other elements only; the selection's own paragraph needs a line-box probe.
  const covers = (ys: number[], outside: (r: DOMRect) => boolean): boolean =>
    ys.some((y) => {
      // An open bubble or tooltip hits as our host, which holds no page text; look past it.
      const hit = document
        .elementsFromPoint(probeX, Math.min(window.innerHeight - 4, Math.max(0, y)))
        .find((el) => el !== getShadowHostElement());
      return !!hit && outside(hit.getBoundingClientRect()) && hasText(hit);
    });
  const belowCovers = covers(
    [below + BUBBLE_HEIGHT / 2, below + BUBBLE_HEIGHT - 2],
    (r) => r.top >= rect.bottom - 2 && r.bottom > below,
  );
  const offBottom = below + BUBBLE_HEIGHT > window.innerHeight - 8;
  const aboveFits =
    above >= 4 &&
    !covers(
      [above + 2, above + BUBBLE_HEIGHT / 2],
      (r) => r.bottom <= rect.top + 2 && r.top < above + BUBBLE_HEIGHT,
    );
  const top =
    (belowCovers || offBottom) && aboveFits ? above : Math.min(window.innerHeight - 32, below);
  const left = rtl
    ? Math.max(BUBBLE_WIDTH, Math.min(window.innerWidth - 8, anchorX))
    : Math.max(8, Math.min(window.innerWidth - BUBBLE_WIDTH, anchorX));
  return { left, top };
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
      onmenu: (chevron: HTMLButtonElement, viaKeyboard: boolean) => {
        void loadBubbleMenu().then((m) =>
          m.openBubbleMenu(chevron, { focusFirst: viaKeyboard, hideBubble }),
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
