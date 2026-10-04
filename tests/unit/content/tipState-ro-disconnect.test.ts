// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openTooltip, closeTooltip } from '@/content/tipState.svelte';
import { mountShadowHost } from '@/content/shadowHost';

// A ResizeObserver left connected holds a reference to the detached `.tooltip` element.

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
});

describe('tipState — ResizeObserver disconnect on bulk close', () => {
  it("closeTooltip() (no arg) disconnects each entry's ResizeObserver", async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    // installRepositioning runs in a microtask — flush it so the observer exists.
    await Promise.resolve();
    await Promise.resolve();

    expect(observers.length).toBeGreaterThan(0);
    const ro = observers[observers.length - 1];
    expect(ro?.disconnected).toBe(false);

    closeTooltip();

    expect(ro?.disconnected).toBe(true);
  });

  it('closeTooltip(id) on a live entry still disconnects', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    await Promise.resolve();
    await Promise.resolve();

    const ro = observers[observers.length - 1];
    expect(ro?.disconnected).toBe(false);
    closeTooltip('a');
    expect(ro?.disconnected).toBe(true);
  });
});
