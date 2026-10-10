// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import {
  openTooltip,
  appendDelta,
  finishTooltip,
  finishTooltipDirect,
  closeTooltip,
  getTooltipBody,
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

function detectedPill(): Element | null {
  const direction = getContainer().querySelector('[data-ega-meta-item="direction"]');
  return direction?.textContent === 'Arabizi (Levantine)' ? direction : null;
}

describe('the detected-variety pill comes from the done chunk', () => {
  it('applies replacements and authoritative final text without interpreting JSON', async () => {
    openTooltip({ requestId: 'protocol', srcText: 'Example', rect: rect(50, 50, 100, 20) });
    appendDelta('protocol', 'Earlier');
    appendDelta('protocol', 'Corrected', true);
    await tick();
    expect(getContainer().querySelector('.body')?.textContent.trim()).toBe('Corrected');
    const text = '{"translation":"literal example"}';
    finishTooltip('protocol', { text });
    expect(getTooltipBody('protocol')).toBe(text);
  });
  it('finishTooltip carries detectedLang and detectedDetail into the tooltip', async () => {
    openTooltip({ requestId: 'd', srcText: 'kifak', rect: rect(50, 50, 100, 20) });
    appendDelta('d', 'how are you');
    finishTooltip('d', { confidence: 0.9, detectedLang: 'arabizi', detectedDetail: 'Levantine' });
    await tick();
    expect(detectedPill()).not.toBeNull();
  });
});

describe('a buffered image result shows what a streamed one would', () => {
  it('finishTooltipDirect renders the explanation, the from-image marker and the detected pill', async () => {
    openTooltip({
      requestId: 'i',
      srcText: '',
      rect: rect(50, 50, 100, 20),
      imageUrl: 'https://cdn.test/a.png',
    });
    finishTooltipDirect('i', 'hi', 0.9, {
      explain: 'a greeting',
      usedImage: true,
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine',
    });
    await tick();
    expect(getContainer().querySelector('.body')?.textContent.trim()).toBe('hi');
    expect(getContainer().querySelector('.explain-body')?.textContent).toBe('a greeting');
    expect(getContainer().querySelector('.ega-from-image')).not.toBeNull();
    expect(detectedPill()).not.toBeNull();
  });
});
