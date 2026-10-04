// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { openTooltip, appendDelta, finishTooltip, closeTooltip } from '@/content/tipState.svelte';
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

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ega-host-installed');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
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

function marker(): Element | null {
  return getContainer().querySelector('.ega-from-image');
}

const EXPLAIN_JSON =
  '{"translation":"Hello","confidence":0.5,"explain":"A regional greeting grounded in the image."}';

describe('tooltip from-image marker — driven by the done chunk, not client optimism', () => {
  it('shows the marker when the done chunk carries usedImage:true', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20), task: 'explain' });
    appendDelta('a', EXPLAIN_JSON);
    finishTooltip('a', {
      confidence: 0.5,
      explain: 'A regional greeting grounded in the image.',
      usedImage: true,
    });
    await tick();
    expect(marker()).toBeTruthy();
  });

  it('omits the marker when the done chunk lacks usedImage (text-only explain fallback)', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20), task: 'explain' });
    appendDelta('a', EXPLAIN_JSON);
    finishTooltip('a', {
      confidence: 0.5,
      explain: 'A regional greeting grounded in the image.',
    });
    await tick();
    expect(marker()).toBeNull();
  });
});
