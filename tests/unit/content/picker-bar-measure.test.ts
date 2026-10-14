// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountPickerBar, type PickerBarHandle } from '@/content/picker-bar';
import { getShadowRoot, mountShadowHost } from '@/content/shadowHost';

// The bar publishes its own height, so a toast clears it however many rows it takes (spec 1.3, MI-2, CI-1).

const read = (p: string): string => readFileSync(resolve(p), 'utf8');

function q(sel: string): HTMLElement {
  const node = getShadowRoot().querySelector<HTMLElement>(sel);
  if (!node) throw new Error(`test setup: ${sel}`);
  return node;
}

/** jsdom lays nothing out: give an element the box the browser would. */
function box(el: HTMLElement, at: { top?: number; height: number }): void {
  Object.defineProperty(el, 'offsetTop', { configurable: true, value: at.top ?? 0 });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: at.height });
}

let resized: (() => void) | undefined;
const observed = new Set<Element>();
let bar: PickerBarHandle | undefined;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resized = cb;
      }
      observe(el: Element): void {
        observed.add(el);
      }
      disconnect(): void {
        observed.clear();
      }
    },
  );
  mountShadowHost();
  bar = mountPickerBar({
    kind: 'areas',
    initialStatus: 'Click blocks to choose them',
    onCancel: vi.fn(),
  });
});

afterEach(() => {
  bar?.destroy();
  bar = undefined;
  vi.unstubAllGlobals();
});

describe('the picker bar measures itself for the toast above it', () => {
  it('a bar that wraps to two rows publishes its height and takes the card radius', () => {
    const el = q('.ega-picker-bar');
    expect(observed.has(el)).toBe(true);
    box(el, { height: 64 });
    box(q('.ega-picker-bar .lead'), { top: 4, height: 18 });
    box(q('.ega-picker-bar .controls'), { top: 30, height: 28 });
    resized?.();
    const root = q('[data-ega-root]');
    expect(root.style.getPropertyValue('--ega-picker-bar-h')).toBe('64px');
    expect(el.hasAttribute('data-ega-wrapped')).toBe(true);

    // Back on one row once the long status is gone.
    box(el, { height: 38 });
    box(q('.ega-picker-bar .lead'), { top: 9, height: 18 });
    box(q('.ega-picker-bar .controls'), { top: 4, height: 28 });
    resized?.();
    expect(root.style.getPropertyValue('--ega-picker-bar-h')).toBe('38px');
    expect(el.hasAttribute('data-ega-wrapped')).toBe(false);
  });

  it('leaves nothing behind when the mode ends', () => {
    const root = q('[data-ega-root]');
    bar?.destroy();
    bar = undefined;
    expect(root.style.getPropertyValue('--ega-picker-bar-h')).toBe('');
    expect(observed.size).toBe(0);
  });

  it('the toast rules read the measured heights, and a hidden pill gives way to the bar', () => {
    const pickerCss = read('src/content/picker-bar/picker-bar.css');
    expect(pickerCss).toMatch(
      /\.ega-root:has\(> \[data-ega-picker-bar-wrap\]\) \.ega-toast \{\s*bottom: calc\(var\(--space-4\) \+ var\(--ega-picker-bar-h, 40px\) \+ var\(--space-2\)\);/,
    );
    // No height written by hand anywhere: the old fixed 40/84px lift covered a wrapped bar.
    expect(read('src/content/shadow.css')).not.toMatch(/--ega-picker-bar-h:/);
    expect(pickerCss).not.toMatch(/--ega-picker-bar-h:/);
    expect(read('src/content/batch-progress.css')).toMatch(
      /\.ega-root:has\(> \[data-ega-batch-progress-wrap\]\):not\(:has\(> \[data-ega-picker-bar-wrap\]\)\) \.ega-toast\s*\{/,
    );
  });
});
