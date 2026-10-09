// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { positionFromRect, repositionIfOverflow, type TipState } from '@/content/tipState.svelte';

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    width: w,
    height: h,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function makeState(): TipState {
  return {
    srcText: '',
    body: '',
    loading: false,
    confidencePill: true,
    left: 0,
    top: 0,
    // Minimal shape — repositionIfOverflow only reads/writes top.
  } as unknown as TipState;
}

function elementWithRect(r: DOMRect): HTMLElement {
  const el = document.createElement('div');
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => r;
  return el;
}

describe('tooltip positioning — positionFromRect', () => {
  beforeEach(() => mockViewport(1280, 800));
  afterEach(() => {
    /* vitest isolates modules per file; nothing else to reset here */
  });

  it('places tooltip below selection with a 10px gap', () => {
    const selectionRect = rect(100, 200, 300, 20);
    const pos = positionFromRect(selectionRect);
    expect(pos.top).toBe(230); // 200 + 20 + 10
    expect(pos.left).toBe(100);
  });

  it('clamps left to 8px minimum when selection is near viewport left edge', () => {
    const selectionRect = rect(-50, 200, 100, 20);
    const pos = positionFromRect(selectionRect);
    expect(pos.left).toBe(8);
  });

  it('clamps left so tooltip 370px width fits on the right', () => {
    const selectionRect = rect(1200, 200, 100, 20);
    const pos = positionFromRect(selectionRect);
    expect(pos.left).toBeLessThanOrEqual(1280 - 370);
  });

  it('a bottom-of-viewport selection DOES NOT produce a viewport-top tooltip position', () => {
    // positionFromRect only places below; repositionIfOverflow flips it with measured geometry.
    mockViewport(1280, 1000);
    const selectionRect = rect(100, 950, 400, 30);
    const pos = positionFromRect(selectionRect);
    // Placed below even though it overflows — ResizeObserver corrects after mount.
    expect(pos.top).toBe(990);
    expect(pos.top).toBeGreaterThan(500);
  });
  it.each([400, 320, 256])('stays inside a %ipx viewport on the first frame', (width) => {
    mockViewport(width, 800);
    const pos = positionFromRect(rect(100, 200, 80, 20));
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });
});

describe('tooltip positioning — repositionIfOverflow', () => {
  beforeEach(() => mockViewport(1280, 1000));
  it.each([400, 320, 256])('uses the measured width at %ipx', (width) => {
    mockViewport(width, 800);
    const cardWidth = width - 16;
    const state = makeState();
    repositionIfOverflow(
      state,
      elementWithRect(rect(0, 0, cardWidth, 180)),
      rect(200, 200, 20, 20),
    );
    expect(state.left).toBe(8);
    expect(state.left + cardWidth).toBeLessThanOrEqual(width - 8);
  });

  it('stays below selection when card fits below', () => {
    const anchor = rect(100, 200, 300, 20);
    const card = elementWithRect(rect(100, 230, 360, 300));
    const state = makeState();
    state.top = 230;
    repositionIfOverflow(state, card, anchor);
    expect(state.top).toBe(228); // anchor.bottom (220) + gap (8)
  });

  it('flips above when card does not fit below but fits above', () => {
    const anchor = rect(100, 700, 300, 20);
    const card = elementWithRect(rect(100, 730, 360, 400));
    const state = makeState();
    state.top = 730;
    repositionIfOverflow(state, card, anchor);
    // Should flip above: anchor.top (700) - card.height (400) - gap (8) = 292
    expect(state.top).toBe(292);
  });

  it('a bottom-of-viewport selection keeps the tooltip anchored, NOT clamped to viewport-top=8', () => {
    // The card is taller than the space above, so the flip math can go negative.
    const anchor = rect(100, 950, 400, 30);
    const card = elementWithRect(rect(100, 980, 360, 900));
    const state = makeState();
    state.top = 960;
    repositionIfOverflow(state, card, anchor);
    // Neither side fits, so the exact top is not pinned — only that it flipped and stayed on-screen.
    expect(state.top).toBeGreaterThanOrEqual(8);
    expect(state.top).toBeLessThan(anchor.top);
    // The card's bottom must sit near the selection top, not float at the viewport top.
    const tooltipBottom = state.top + 900;
    expect(Math.abs(tooltipBottom - anchor.top)).toBeLessThanOrEqual(20);
  });

  it('when neither side fits, pins to the side with more space — NEVER viewport-top', () => {
    // Selection sits mid-viewport and the card is taller than either side.
    mockViewport(1280, 500);
    const anchor = rect(100, 200, 300, 20);
    const card = elementWithRect(rect(100, 230, 360, 600));
    const state = makeState();
    state.top = 230;
    repositionIfOverflow(state, card, anchor);
    // Below has ~280px, above ~200px — below wins: 220 + 8 gap, body scrolls internally.
    expect(state.top).toBe(228);
  });
});
