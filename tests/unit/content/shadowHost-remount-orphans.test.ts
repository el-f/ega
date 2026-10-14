// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountShadowHost, getContainer, getShadowHostElement } from '@/content/shadowHost';
import { openTooltip, closeTooltip } from '@/content/tipState.svelte';

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
  disconnected: boolean;
  target?: Element;
}

const observers: StubRO[] = [];

class TrackingResizeObserver {
  disconnected = false;
  target?: Element;
  observe(target: Element): void {
    this.target = target;
  }
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
  document.documentElement.querySelectorAll('#ega-shadow-host').forEach((n) => n.remove());
  document.documentElement.removeAttribute('data-ega-host-installed');
  observers.length = 0;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  (globalThis as unknown as { ResizeObserver: typeof TrackingResizeObserver }).ResizeObserver =
    TrackingResizeObserver;
});

afterEach(() => {
  closeTooltip();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('shadowHost — a re-mount must not orphan live components', () => {
  it('disposes the tooltip left in the detached root, with its scroll listener and observer', async () => {
    mountShadowHost();
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    await Promise.resolve();
    await Promise.resolve();
    // Menu triggers also measure their size; track the card's positioning observer.
    const positioning = observers.find((observer) => observer.target?.matches('.tooltip'));
    expect(positioning).toBeDefined();

    const removeSpy = vi.spyOn(document, 'removeEventListener');
    getShadowHostElement()?.remove();
    getContainer();

    expect(removeSpy.mock.calls.some((c) => c[0] === 'scroll')).toBe(true);
    expect(positioning?.disconnected).toBe(true);
  });
});

describe('bubble — hiding must never build the shadow host', () => {
  it('hideBubble on a page that showed no UI leaves the document untouched', async () => {
    vi.resetModules();
    const { hideBubble } = await import('@/content/bubble');

    hideBubble();

    expect(document.getElementById('ega-shadow-host')).toBeNull();
  });
});
