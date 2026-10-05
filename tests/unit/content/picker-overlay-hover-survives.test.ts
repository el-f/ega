// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

type HoverArg = { element: Element; blocked?: true } | null;
let onHover: ((a: HoverArg) => void) | undefined;

vi.mock('@/content/picker', () => ({
  PRIVATE_FIELD_REASON: 'Ega does not read private fields.',
  createPicker: (opts: { onHover?: (a: HoverArg) => void }) => {
    onHover = opts.onHover;
    return { enter: vi.fn(), exit: vi.fn(), isActive: () => false };
  },
}));

const container = document.createElement('div');
vi.mock('@/content/shadowHost', () => ({
  getContainer: () => container,
  onShadowHostRemount: () => {},
  ensureShadowSheet: () => {},
}));

import { enterPickerMode } from '@/content/picker-overlay';

/** A page element whose box can be moved between the hover and the paint frame. */
function boxed(left: number, top: number, width: number, height: number) {
  const el = document.createElement('p');
  document.body.appendChild(el);
  let box = { left, top, width, height } as DOMRect;
  el.getBoundingClientRect = () => box;
  return {
    el,
    move: (l: number, t: number) => {
      box = { ...box, left: l, top: t } as DOMRect;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  container.replaceChildren();
});

describe('picker-overlay — a hover repaints without remounting', () => {
  it('keeps the same hint and dimmer nodes across repaints and moves the outline', async () => {
    // rAF runs inline so the repaint lands inside the test.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    await enterPickerMode(vi.fn());

    const hintBefore = container.querySelector('.picker-hint');
    const dimmerBefore = container.querySelector('.picker-dimmer');
    const outline = container.querySelector<HTMLElement>('[data-ega-picker-outline]');
    expect(hintBefore).not.toBeNull();
    expect(dimmerBefore).not.toBeNull();
    expect(outline?.hidden).toBe(true);

    expect(onHover).toBeTypeOf('function');
    onHover?.({ element: boxed(10, 20, 100, 40).el });

    expect(outline?.hidden).toBe(false);
    expect(outline?.style.left).toBe('10px');
    expect(outline?.style.top).toBe('20px');
    expect(outline?.style.width).toBe('100px');
    expect(outline?.style.height).toBe('40px');

    onHover?.({ element: boxed(50, 60, 200, 80).el });
    expect(outline?.style.left).toBe('50px');

    // The nodes must stay the same: a remount would swap them and reset the live region.
    expect(container.querySelector('.picker-hint')).toBe(hintBefore);
    expect(container.querySelector('.picker-dimmer')).toBe(dimmerBefore);
    expect(container.querySelector('[data-ega-picker-outline]')).toBe(outline);
  });

  it('measures the element in the frame that paints the outline', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    await enterPickerMode(vi.fn());
    const outline = container.querySelector<HTMLElement>('[data-ega-picker-outline]');

    const target = boxed(10, 20, 100, 40);
    onHover?.({ element: target.el });
    // The page scrolls between the mousemove and the next frame.
    target.move(10, 300);
    frames.shift()?.(0);

    expect(outline?.style.top).toBe('300px');
  });

  it('marks a refused private field in red and swaps the hint to the reason', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    await enterPickerMode(vi.fn());
    const outline = container.querySelector<HTMLElement>('[data-ega-picker-outline]');
    const hintDefault = container.querySelector<HTMLElement>('.picker-hint-default');
    const hintBlocked = container.querySelector<HTMLElement>('.picker-hint-blocked');

    onHover?.({ element: boxed(0, 0, 100, 20).el, blocked: true });
    expect(outline?.hidden).toBe(false);
    expect(outline?.classList.contains('is-blocked')).toBe(true);
    expect(hintDefault?.hidden).toBe(true);
    expect(hintBlocked?.hidden).toBe(false);

    onHover?.({ element: boxed(0, 40, 100, 20).el });
    expect(outline?.classList.contains('is-blocked')).toBe(false);
    expect(hintDefault?.hidden).toBe(false);
    expect(hintBlocked?.hidden).toBe(true);
  });
});
