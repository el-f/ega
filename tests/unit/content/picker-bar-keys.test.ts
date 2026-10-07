// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { enterPickerMode, teardownPicker } from '@/content/picker-overlay';
import { getShadowRoot, mountShadowHost } from '@/content/shadowHost';

// Pick element and its bar, composed as on a page: the mode's document listener sees every key first.

function bar(sel: string): HTMLElement {
  const node = getShadowRoot().querySelector<HTMLElement>(sel);
  if (!node) throw new Error(`test setup: ${sel}`);
  return node;
}

function press(target: EventTarget, key: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(e);
  return e;
}

function picking(): boolean {
  return document.documentElement.hasAttribute('data-ega-picking');
}

beforeEach(async () => {
  document.body.innerHTML = '<main><p id="a">first para</p><p id="b">second para</p></main>';
  mountShadowHost();
  await enterPickerMode(vi.fn());
});

afterEach(() => {
  teardownPicker();
});

describe('Pick element: the bar from the keyboard', () => {
  it('? moves focus to Keys, which shows the key list', () => {
    expect(press(document, '?').defaultPrevented).toBe(true);
    flushSync();
    expect(getShadowRoot().activeElement).toBe(bar('[data-ega-picker-keys]'));
    expect(bar('[role="tooltip"]').hidden).toBe(false);
    expect(bar('[role="tooltip"]').textContent).toContain('?');
  });

  it('Esc with the key list open closes only the list; the next Esc leaves the mode', () => {
    const keys = bar('[data-ega-picker-keys]');
    keys.click();
    flushSync();
    expect(bar('[role="tooltip"]').hidden).toBe(false);

    press(keys, 'Escape');
    flushSync();
    expect(bar('[role="tooltip"]').hidden).toBe(true);
    expect(picking()).toBe(true);

    press(keys, 'Escape');
    expect(picking()).toBe(false);
  });

  it('Tab from the bar goes back to the blocks', () => {
    press(document, '?');
    const e = press(bar('[data-ega-picker-keys]'), 'Tab');
    expect(e.defaultPrevented).toBe(true);
    expect(getShadowRoot().activeElement).toBeNull();
    expect(picking()).toBe(true);
  });
});
