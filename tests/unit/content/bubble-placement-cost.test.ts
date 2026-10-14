// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
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

/** Where an element's text sits; by default its text fills its box. */
const textRects = new WeakMap<Element, DOMRect>();
/** The root of every text walk placement starts. */
const walks: Node[] = [];

beforeAll(() => {
  const realWalker = Document.prototype.createTreeWalker;
  Document.prototype.createTreeWalker = function (this: Document, root: Node, ...rest) {
    walks.push(root);
    return realWalker.call(this, root, ...rest);
  } as typeof Document.prototype.createTreeWalker;
  // jsdom lays nothing out, so a text node's line boxes come from the box its element is given here.
  Range.prototype.getClientRects = function (this: Range) {
    const el = this.startContainer.parentElement;
    const r = el ? (textRects.get(el) ?? el.getBoundingClientRect()) : undefined;
    return (r ? [r] : []) as unknown as DOMRectList;
  };
});

/** An element under the probe with a fixed box; `textReads` counts the text walks rooted at it. */
function probeHit(box: DOMRect, text: string): { el: HTMLElement; textReads: () => number } {
  const el = document.createElement('div');
  el.textContent = text;
  document.body.appendChild(el);
  el.getBoundingClientRect = () => box;
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [el];
  return { el, textReads: () => walks.filter((root) => root === el).length };
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

  it('a text line right below the selection moves the bubble above the first line', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    probeHit(rect(122, 142), 'next line of the paragraph');

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(68);
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

    expect(bubbleTop()).toBe(68);
  });

  it('a blank element below the selection leaves the bubble where it was', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    probeHit(rect(122, 142), '   ');

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(124);
  });

  it('stays below and clamps when there is no room above either', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    probeHit(rect(22, 42), 'next line of the paragraph');

    showBubble({ rect: rect(0, 20), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(24);
  });

  it('on a right-to-left block, anchors to the selection right edge', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    probeHit(rect(0, 900), 'the whole page text');

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn(), rtl: true });

    const group = getContainer().querySelector<HTMLElement>('.bubble-group');
    expect(group?.classList.contains('is-rtl')).toBe(true);
    expect(group?.style.left).toBe('300px');
  });

  it('a next line that starts inside the bubble lower half still moves it above', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const gap = probeHit(rect(0, 900), 'the article').el;
    const line = probeHit(rect(146, 166), 'next paragraph').el;
    // Under the bubble's middle there is only the gap between paragraphs; under its bottom, the next one.
    (
      document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }
    ).elementsFromPoint = (_x, y) => (y >= 146 ? [line] : [gap]);

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(68);
  });

  it('stays below when the line above the selection would be covered too', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const gap = probeHit(rect(0, 900), 'the article').el;
    const prev = probeHit(rect(60, 90), 'previous paragraph').el;
    const next = probeHit(rect(126, 146), 'next paragraph').el;
    // Dense text: a paragraph ends just above the selection and the next starts just below it.
    (
      document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }
    ).elementsFromPoint = (_x, y) => (y >= 126 ? [next] : y <= 90 ? [prev] : [gap]);

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(124);
  });

  it('a block above whose text ends well over the bubble does not keep it below', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const gap = probeHit(rect(0, 900), 'the article').el;
    // A tall block: one line of text at its top, then padding down to the selection.
    const prev = probeHit(rect(20, 98), 'previous paragraph').el;
    textRects.set(prev, rect(20, 40));
    const next = probeHit(rect(126, 146), 'next paragraph').el;
    (
      document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }
    ).elementsFromPoint = (_x, y) => (y >= 126 ? [next] : y <= 98 ? [prev] : [gap]);

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(68);
  });
});

describe('bubble placement — the selection own paragraph', () => {
  it('a selection on the first line moves above when its own next line is under it', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    document.body.innerHTML =
      '<p id="p"><span id="l1">selected words</span><span id="l2"> and the rest of the paragraph</span></p>';
    const p = document.getElementById('p') as HTMLElement;
    p.getBoundingClientRect = () => rect(100, 142);
    textRects.set(document.getElementById('l1') as HTMLElement, rect(100, 120));
    textRects.set(document.getElementById('l2') as HTMLElement, rect(122, 142));
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('l1')?.firstChild as Node);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    // The probe under the bubble hits the paragraph itself, which holds the selection.
    (
      document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }
    ).elementsFromPoint = (_x, y) => (y >= 100 && y <= 142 ? [p] : []);

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(68);
    window.getSelection()?.removeAllRanges();
  });
});

describe('bubble placement — cost on a large page', () => {
  /** Counts the line-box reads placement makes. */
  function countReads(): () => number {
    const real = Range.prototype.getClientRects;
    let n = 0;
    Range.prototype.getClientRects = function (this: Range) {
      n += 1;
      return real.call(this);
    };
    afterEachRestore.push(() => (Range.prototype.getClientRects = real));
    return () => n;
  }

  /** A container of `count` paragraphs, each with its own line box from `firstTop` down. */
  function bigBlock(box: DOMRect, count: number, firstTop: number): HTMLElement {
    const el = document.createElement('div');
    for (let i = 0; i < count; i++) {
      const p = document.createElement('p');
      p.textContent = `paragraph ${i}`;
      textRects.set(p, rect(firstTop + i * 24, firstTop + i * 24 + 20));
      el.append(p);
    }
    el.getBoundingClientRect = () => box;
    document.body.append(el);
    return el;
  }

  const afterEachRestore: (() => void)[] = [];
  afterEach(() => {
    for (const undo of afterEachRestore.splice(0)) undo();
  });

  it('a container below whose text starts past the band is read for one line, not walked whole', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    // Its first text sits 80px under the selection, below the container's own top padding.
    const below = bigBlock(rect(122, 50000), 2000, 200);
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [
      below,
    ];
    const reads = countReads();

    showBubble({ rect: rect(100, 120), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(124);
    expect(reads()).toBeLessThanOrEqual(6);
  });

  it('the space above is not probed while the space below is clear', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    let probes = 0;
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => {
      probes += 1;
      return [];
    };

    showBubble({ rect: rect(300, 320), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(324);
    expect(probes).toBe(3);
  });

  it('a container above is read from its last line, where it meets the bubble', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    // 2000 paragraphs whose last line ends at 9956, then bottom padding down to the selection; below it, the next line is in the way.
    const above = bigBlock(rect(0, 9998), 2000, 9936 - 1999 * 24);
    const next = probeHit(rect(10022, 10042), 'next line').el;
    (
      document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }
    ).elementsFromPoint = (_x, y) => (y >= 10022 ? [next] : y <= 9998 ? [above] : []);
    const reads = countReads();

    showBubble({ rect: rect(10000, 10020), queued: 0, onClick: vi.fn() });

    expect(bubbleTop()).toBe(9968);
    expect(reads()).toBeLessThanOrEqual(12);
  });
});
