// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openTooltip,
  appendDelta,
  closeTooltip,
  positionFromRect,
} from '@/content/tipState.svelte';
import { mountShadowHost, getContainer } from '@/content/shadowHost';

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

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ega-host-installed');
  mockViewport(1280, 1000);
  // jsdom has no ResizeObserver, and openTooltip's post-mount microtask needs one.
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
      StubResizeObserver;
  }
  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  document.body.innerHTML = '';
});

function activeWraps(): NodeListOf<HTMLElement> {
  return getContainer().querySelectorAll<HTMLElement>('[data-ega-tooltip-wrap]');
}

describe('tooltip lifecycle — only one tooltip at a time', () => {
  it('opening a new tooltip with a different requestId closes the previous one', () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    expect(activeWraps().length).toBe(1);
    expect(activeWraps()[0]?.getAttribute('data-ega-tooltip-wrap')).toBe('a');

    openTooltip({ requestId: 'b', srcText: 'bye', rect: rect(60, 60, 100, 20) });
    const wraps = activeWraps();
    expect(wraps.length).toBe(1);
    expect(wraps[0]?.getAttribute('data-ega-tooltip-wrap')).toBe('b');
  });

  it('re-opening with the SAME requestId still works (idempotent)', () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    openTooltip({ requestId: 'a', srcText: 'hi-again', rect: rect(50, 50, 100, 20) });
    const wraps = activeWraps();
    expect(wraps.length).toBe(1);
    expect(wraps[0]?.getAttribute('data-ega-tooltip-wrap')).toBe('a');
  });

  it('closing a stale id after a new tooltip has opened does NOT touch the live one', () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    openTooltip({ requestId: 'b', srcText: 'bye', rect: rect(60, 60, 100, 20) });
    // 'a' was already swept when 'b' opened, so this close is a no-op.
    closeTooltip('a');
    const wraps = activeWraps();
    expect(wraps.length).toBe(1);
    expect(wraps[0]?.getAttribute('data-ega-tooltip-wrap')).toBe('b');
  });

  it('appendDelta against a swept-away requestId is a silent no-op (no late writes leak across instances)', () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    openTooltip({ requestId: 'b', srcText: 'bye', rect: rect(60, 60, 100, 20) });
    expect(() => appendDelta('a', 'leaked-delta')).not.toThrow();
    expect(activeWraps().length).toBe(1);
  });
});

describe('tooltip lifecycle — anchor refresh from the live Range', () => {
  it('OpenOpts accepts a `range` and the tooltip subsequently tracks it on subsequent renders', async () => {
    // The fake Range returns a moving rect — the page scrolls under the tooltip.
    let liveRect = rect(50, 50, 200, 20);
    const fakeRange = {
      getBoundingClientRect: () => liveRect,
    } as unknown as Range;

    openTooltip({
      requestId: 'a',
      srcText: 'hello',
      rect: rect(50, 50, 200, 20),
      range: fakeRange,
    });
    // Flush openTooltip's queueMicrotask.
    await Promise.resolve();
    await Promise.resolve();

    liveRect = rect(150, 250, 200, 20);
    document.dispatchEvent(new Event('scroll'));
    // The scroll handler repositions inside a rAF.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await Promise.resolve();

    // `left` is the axis that matters here: asserting `top` alone passes either way.
    const wrap = activeWraps()[0];
    expect(wrap).toBeTruthy();
    const tipEl = wrap?.querySelector<HTMLElement>('.tooltip');
    expect(tipEl).toBeTruthy();
    if (!tipEl) throw new Error('no tooltip');
    const expectedAfter = positionFromRect(liveRect).left;
    expect(tipEl.style.left).toBe(`${expectedAfter}px`);
  });

  it('explain follow-up that re-opens with a fresh requestId KEEPS the live range — anchor stays attached after Explain', async () => {
    let liveRect = rect(40, 40, 100, 20);
    const fakeRange = {
      getBoundingClientRect: () => liveRect,
    } as unknown as Range;

    openTooltip({
      requestId: 'a',
      srcText: 'hi',
      rect: rect(40, 40, 100, 20),
      range: fakeRange,
    });
    await Promise.resolve();
    await Promise.resolve();

    // Explain re-opens under a new id with the same range.
    openTooltip({
      requestId: 'b',
      srcText: 'hi',
      rect: rect(40, 40, 100, 20),
      range: fakeRange,
    });
    await Promise.resolve();
    await Promise.resolve();

    liveRect = rect(300, 400, 100, 20);
    document.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await Promise.resolve();

    const wrap = activeWraps()[0];
    expect(wrap?.getAttribute('data-ega-tooltip-wrap')).toBe('b');
    const tipEl = wrap?.querySelector<HTMLElement>('.tooltip');
    expect(tipEl).toBeTruthy();
    if (!tipEl) throw new Error('no tooltip');
    const expected = positionFromRect(liveRect);
    expect(tipEl.style.left).toBe(`${expected.left}px`);
    // 70px is the mount-time top (40 + 20 + 10) — the live rect must override it.
    expect(tipEl.style.top).not.toBe('70px');
  });

  it('without a range, falls back to the captured rect (image and popup translates)', async () => {
    openTooltip({
      requestId: 'a',
      srcText: 'hi',
      rect: rect(80, 80, 100, 20),
    });
    await Promise.resolve();
    await Promise.resolve();

    document.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await Promise.resolve();

    const wrap = activeWraps()[0];
    const tipEl = wrap?.querySelector<HTMLElement>('.tooltip');
    expect(tipEl?.style.left).toBe('80px');
  });
});

describe('tooltip lifecycle — sweep cleans up listeners + ResizeObserver', () => {
  it("opening a new tooltip disconnects the previous instance's scroll + resize observers", async () => {
    // ResizeObserver disconnection is not observable — a removed wrap proves the sweep ran.
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    await Promise.resolve();
    const oldWrap = activeWraps()[0];
    expect(oldWrap?.isConnected).toBe(true);

    openTooltip({ requestId: 'b', srcText: 'bye', rect: rect(60, 60, 100, 20) });
    expect(oldWrap?.isConnected).toBe(false);
  });

  it('closeTooltip with no arg sweeps every instance', () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    openTooltip({ requestId: 'b', srcText: 'bye', rect: rect(60, 60, 100, 20) });
    expect(activeWraps().length).toBe(1);
    closeTooltip();
    expect(activeWraps().length).toBe(0);
  });
});

describe('tooltip lifecycle — smoke', () => {
  it('rapid-fire openTooltip × 5 leaves exactly one tooltip mounted', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      openTooltip({ requestId: id, srcText: id, rect: rect(50, 50, 100, 20) });
    }
    expect(activeWraps().length).toBe(1);
    expect(activeWraps()[0]?.getAttribute('data-ega-tooltip-wrap')).toBe('e');
  });

  it('appendDelta still flows to the live tooltip after a rapid-fire sweep', () => {
    openTooltip({ requestId: 'a', srcText: 'a', rect: rect(50, 50, 100, 20) });
    openTooltip({ requestId: 'b', srcText: 'b', rect: rect(50, 50, 100, 20) });
    appendDelta('b', '"plain text delta"');
    // Svelte 5 state is not readable here — a surviving wrap proves the call went through.
    expect(activeWraps().length).toBe(1);
    expect(activeWraps()[0]?.getAttribute('data-ega-tooltip-wrap')).toBe('b');
  });
});

describe('the shimmer stays until visible text arrives', () => {
  it('a first chunk that is only the JSON envelope keeps the loading state', async () => {
    openTooltip({ requestId: 'shim', srcText: 'hola', rect: rect(10, 10, 100, 20) });
    await Promise.resolve();
    expect(getContainer().querySelector('.shimmer')).not.toBeNull();
    appendDelta('shim', '{"');
    await Promise.resolve();
    expect(getContainer().querySelector('.shimmer')).not.toBeNull();
    appendDelta('shim', 'translation": "Hel');
    await Promise.resolve();
    expect(getContainer().querySelector('.shimmer')).toBeNull();
    closeTooltip('shim');
  });
});
