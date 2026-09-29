import { debugCatch } from '@/shared/logger';
import { mount, unmount } from 'svelte';
import Bubble from './Bubble.svelte';
import { getContainer, peekContainer, onShadowHostRemount } from './shadowHost';

interface BubbleOpts {
  rect: DOMRect;
  queued: number;
  /** Translation direction, shown read-only; swapping lives in the tooltip action row. */
  direction?: { source: string; target: string };
  /** First-ever render for this install. Drives a 3× ring pulse so
   *  the affordance is discoverable. Parent persists the "seen" flag. */
  firstRun?: boolean;
  onClick: (e: MouseEvent) => void;
}

interface Mounted {
  handle: ReturnType<typeof mount>;
  anchor: HTMLDivElement;
  queued: number;
  direction: string;
  firstRun: boolean;
}

let current: Mounted | null = null;
let currentOnClick: ((e: MouseEvent) => void) | null = null;

const BUBBLE_HEIGHT = 24;

// A probe that lands between blocks hits `<body>` or `#app`, whose textContent is the whole page.
function hasText(el: Element): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue?.trim()) return true;
  }
  return false;
}

function placeBubble(rect: DOMRect): { left: number; top: number } {
  // The default +8 landing sits on the next line of a wrapped paragraph, so probe it and clear any text there.
  const desiredTop = rect.bottom + 8;
  const desiredLeft = Math.max(8, rect.left);
  let top = Math.min(window.innerHeight - 32, desiredTop);
  const probeX = Math.min(window.innerWidth - 4, desiredLeft + 16);
  const probeY = Math.min(window.innerHeight - 4, desiredTop + BUBBLE_HEIGHT / 2);
  const hit = document.elementFromPoint(probeX, probeY);
  if (hit) {
    const hitRect = hit.getBoundingClientRect();
    // Re-anchor only when the element below the selection would sit under the bubble, so nearby text stays readable.
    if (hitRect.top >= rect.bottom - 2 && hitRect.bottom > desiredTop && hasText(hit)) {
      top = Math.min(window.innerHeight - 32, hitRect.bottom + 6);
    }
  }
  // With no room below, the bubble pins to the viewport bottom and covers the last selected line, so flip it above.
  if (desiredTop + BUBBLE_HEIGHT > window.innerHeight - 8) {
    const aboveTop = rect.top - BUBBLE_HEIGHT - 8;
    if (aboveTop >= 4) top = aboveTop;
  }
  return { left: Math.min(window.innerWidth - 90, desiredLeft), top };
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
    current.firstRun !== (opts.firstRun === true)
  ) {
    return false;
  }
  const btn = current.anchor.querySelector<HTMLElement>('.bubble');
  if (!btn?.isConnected) return false;
  btn.style.left = `${left}px`;
  btn.style.top = `${top}px`;
  return true;
}

export function showBubble(opts: BubbleOpts): void {
  const { left, top } = placeBubble(opts.rect);
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
      onclick: (e: MouseEvent) => {
        currentOnClick?.(e);
        hideBubble();
      },
    },
  });
  current = {
    handle,
    anchor,
    queued: opts.queued,
    direction: directionKey(opts.direction),
    firstRun: opts.firstRun === true,
  };
}

export function hideBubble(): void {
  currentOnClick = null;
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
