// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTooltip, closeTooltip } from '@/content/tipState.svelte';
import { mountShadowHost } from '@/content/shadowHost';

// installRepositioning registers its document scroll listener in a microtask, so a close that lands first leaves the listener with no owner.

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

interface StubRO {
  observe: () => void;
  unobserve: () => void;
  disconnect: () => void;
  disconnected: boolean;
}

const observers: StubRO[] = [];

class TrackingResizeObserver {
  disconnected = false;
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  constructor() {
    observers.push(this as unknown as StubRO);
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ega-host-installed');
  observers.length = 0;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  (globalThis as unknown as { ResizeObserver: typeof TrackingResizeObserver }).ResizeObserver =
    TrackingResizeObserver;
  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('tipState — installRepositioning fast-close race', () => {
  it('removes the scroll listener + disconnects RO when entry was closed before the microtask fired', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    closeTooltip('a');

    await Promise.resolve();
    await Promise.resolve();

    const scrollAdds = addSpy.mock.calls.filter((c) => c[0] === 'scroll');
    const scrollRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'scroll');

    // Either no listener was added, or the microtask removed the one it added.
    expect(scrollRemoves.length).toBeGreaterThanOrEqual(scrollAdds.length);

    // The observer is built after closeTooltip ran, so only the microtask can dispose it.
    if (observers.length > 0) {
      const ro = observers[observers.length - 1];
      expect(ro?.disconnected).toBe(true);
    }
  });

  it('happy path — entry survives microtask → listener stays registered until closeTooltip', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    await Promise.resolve();
    await Promise.resolve();

    const scrollRemovesBeforeClose = removeSpy.mock.calls.filter((c) => c[0] === 'scroll');
    expect(scrollRemovesBeforeClose).toHaveLength(0);

    closeTooltip('a');
    const scrollRemovesAfterClose = removeSpy.mock.calls.filter((c) => c[0] === 'scroll');
    expect(scrollRemovesAfterClose.length).toBeGreaterThanOrEqual(1);
  });
});
