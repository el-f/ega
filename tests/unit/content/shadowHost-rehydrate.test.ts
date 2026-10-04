// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mountShadowHost,
  getContainer,
  getShadowHostElement,
  getShadowRoot,
} from '@/content/shadowHost';
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

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.querySelectorAll('#ega-shadow-host').forEach((n) => n.remove());
  document.documentElement.removeAttribute('data-ega-host-installed');
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

describe('shadowHost — remounts after the page removes the injected host', () => {
  it('getShadowRoot re-mounts a fresh, connected host when the old one is detached', () => {
    const original = getShadowHostElement();
    expect(original?.isConnected).toBe(true);

    // SPA frameworks strip injected nodes when they reconcile documentElement.
    original?.remove();
    expect(original?.isConnected).toBe(false);

    const root = getShadowRoot();
    expect(root.host.isConnected).toBe(true);
  });

  it('getContainer returns a container attached to the live document after host removal', () => {
    getShadowHostElement()?.remove();

    const container = getContainer();
    expect(container.isConnected).toBe(true);
  });

  it('openTooltip mounts into the live tree (visible) after the host was stripped', () => {
    getShadowHostElement()?.remove();

    openTooltip({ requestId: 'x', srcText: 'hi', rect: rect(50, 50, 100, 20) });

    const container = getContainer();
    const wrap = container.querySelector<HTMLElement>('[data-ega-tooltip-wrap="x"]');
    expect(wrap).toBeTruthy();
    expect(wrap?.isConnected).toBe(true);
  });
});
