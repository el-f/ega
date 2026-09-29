// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

type HoverArg = { rect: DOMRect };
let onHover: ((a: HoverArg) => void) | undefined;

vi.mock('@/content/picker', () => ({
  createPicker: (opts: { onHover?: (a: HoverArg) => void }) => {
    onHover = opts.onHover;
    return { enter: vi.fn(), exit: vi.fn(), isActive: () => false };
  },
}));

const container = document.createElement('div');
vi.mock('@/content/shadowHost', () => ({
  getContainer: () => container,
  onShadowHostRemount: () => {},
}));

import { enterPickerMode } from '@/content/picker-overlay';

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height }) as DOMRect;

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
    onHover?.({ rect: rect(10, 20, 100, 40) });

    expect(outline?.hidden).toBe(false);
    expect(outline?.style.left).toBe('10px');
    expect(outline?.style.top).toBe('20px');
    expect(outline?.style.width).toBe('100px');
    expect(outline?.style.height).toBe('40px');

    onHover?.({ rect: rect(50, 60, 200, 80) });
    expect(outline?.style.left).toBe('50px');

    // The nodes must stay the same: a remount would swap them and reset the live region.
    expect(container.querySelector('.picker-hint')).toBe(hintBefore);
    expect(container.querySelector('.picker-dimmer')).toBe(dimmerBefore);
    expect(container.querySelector('[data-ega-picker-outline]')).toBe(outline);

    vi.unstubAllGlobals();
  });
});
