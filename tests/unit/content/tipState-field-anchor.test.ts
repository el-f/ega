// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tick } from 'svelte';
import { openTooltip, closeTooltip } from '@/content/tipState.svelte';
import { getContainer, mountShadowHost } from '@/content/shadowHost';
import { trackSelectionRect } from '@/content/selection';

// A field selection travels as `selectNode(textarea)`; in Chromium that range's rect is the whole textarea.

class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const realSpanRect = HTMLSpanElement.prototype.getBoundingClientRect;
const realRangeRect = Range.prototype.getBoundingClientRect;

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
    StubResizeObserver;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  // The mirror's span is where the selected text lays out.
  HTMLSpanElement.prototype.getBoundingClientRect = () => new DOMRect(100, 766, 600, 54);
  // Like Chromium: a range around one element reports that element's box.
  Range.prototype.getBoundingClientRect = function (this: Range) {
    const child = this.startContainer.childNodes[this.startOffset];
    return child instanceof Element ? child.getBoundingClientRect() : new DOMRect();
  };
  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  HTMLSpanElement.prototype.getBoundingClientRect = realSpanRect;
  Range.prototype.getBoundingClientRect = realRangeRect;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function tooltipTop(): Promise<number> {
  await Promise.resolve();
  await tick();
  const tip = getContainer().querySelector<HTMLElement>('.tooltip');
  return Number.parseFloat(tip?.style.top ?? 'NaN');
}

describe('a tooltip opened on a textarea selection', () => {
  function openOnField(): { setFieldTop: (top: number) => void; mirrors: () => number } {
    let fieldTop = 81;
    let mirrors = 0;
    const span = HTMLSpanElement.prototype.getBoundingClientRect;
    HTMLSpanElement.prototype.getBoundingClientRect = function (this: HTMLSpanElement) {
      // The mirror is a div right under <html>; the card's own spans live in the shadow root.
      if (this.parentElement?.parentNode === document.documentElement) mirrors++;
      return span.call(this);
    };
    const ta = document.createElement('textarea');
    ta.value = Array.from({ length: 38 }, (_, i) => `line ${i}`).join('\n');
    ta.getBoundingClientRect = () => new DOMRect(100, fieldTop, 600, 780);
    document.body.appendChild(ta);
    ta.setSelectionRange(200, 240);
    const range = document.createRange();
    range.selectNode(ta);
    const anchor = trackSelectionRect(range);
    openTooltip({ requestId: 'f', srcText: 'line', rect: new DOMRect(100, 300, 200, 20), anchor });
    return { setFieldTop: (top) => (fieldTop = top), mirrors: () => mirrors };
  }

  it('anchors to the selected text and follows a page scroll without measuring again', async () => {
    const field = openOnField();
    // jsdom gives the card no height, so it sits 8px under its anchor.
    expect(await tooltipTop()).toBe(828);
    expect(field.mirrors()).toBe(1);

    field.setFieldTop(-19);
    document.dispatchEvent(new Event('scroll'));
    expect(await tooltipTop()).toBe(728);
    expect(field.mirrors()).toBe(1);
  });

  // GitHub's code view: a click on the code collapses the field selection while the card stays open.
  it('stays on that text when the field selection collapses or moves', async () => {
    const field = openOnField();
    expect(await tooltipTop()).toBe(828);
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;

    ta.setSelectionRange(3, 3);
    field.setFieldTop(31);
    document.dispatchEvent(new Event('scroll'));
    expect(await tooltipTop()).toBe(778);

    ta.setSelectionRange(0, 10);
    document.dispatchEvent(new Event('scroll'));
    expect(await tooltipTop()).toBe(778);
  });
});
