// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { showBubble, hideBubble } from '@/content/bubble';
import { getContainer, mountShadowHost } from '@/content/shadowHost';

function rect(top: number, bottom: number): DOMRect {
  return {
    x: 100,
    y: top,
    left: 100,
    top,
    right: 300,
    bottom,
    width: 200,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** An element under the probe, with a spied textContent and a fixed box. */
function probeHit(box: DOMRect, text: string): { el: HTMLElement; textReads: () => number } {
  const el = document.createElement('div');
  el.textContent = text;
  document.body.appendChild(el);
  let reads = 0;
  const real = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  Object.defineProperty(el, 'textContent', {
    configurable: true,
    get() {
      reads++;
      return real?.get?.call(this) as string | null;
    },
  });
  el.getBoundingClientRect = () => box;
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [el];
  return { el, textReads: () => reads };
}

function bubbleTop(): number {
  const btn = getContainer().querySelector<HTMLElement>('.bubble-group');
  return Number.parseFloat(btn?.style.top ?? 'NaN');
}

afterEach(() => {
  hideBubble();
  document.body.innerHTML = '';
});

describe('bubble placement', () => {
  it('an enclosing container under the probe is rejected by geometry, without reading its text', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const { textReads } = probeHit(rect(0, 900), 'the whole page text');

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(textReads()).toBe(0);
    expect(bubbleTop()).toBe(124);
  });

  it('a text line right below the selection still pushes the bubble under it', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    probeHit(rect(122, 142), 'next line of the paragraph');

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(146);
  });

  it('looks past an open Ega surface to the page text under the probe', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const { el } = probeHit(rect(122, 142), 'next line of the paragraph');
    const host = mountShadowHost();
    // A hit on our own UI is retargeted to the host, which holds no light-DOM text.
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [
      host,
      el,
    ];

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(146);
  });

  it('a blank element below the selection leaves the bubble where it was', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    probeHit(rect(122, 142), '   ');

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(124);
  });
});
