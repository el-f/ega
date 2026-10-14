// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTooltip, finishTooltipDirect, closeTooltip } from '@/content/tipState.svelte';
import { mountShadowHost, getContainer } from '@/content/shadowHost';

function rect(): DOMRect {
  return {
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 110,
    bottom: 30,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

function copyButton(): HTMLButtonElement {
  const btn = getContainer().querySelector<HTMLButtonElement>(
    'button[aria-label="Copy translation"]',
  );
  if (!btn) throw new Error('test setup: copy button missing');
  return btn;
}

/** What a screen reader is handed — the polite region, not the button's own label. */
function announced(): string {
  const region = getContainer().querySelector<HTMLElement>('[data-ega-copy-live]');
  return region?.textContent.trim() ?? '<no live region>';
}

beforeEach(() => {
  document.body.innerHTML = '';
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
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
});

afterEach(() => {
  closeTooltip();
  vi.restoreAllMocks();
});

describe('copying a translation is announced to screen readers', () => {
  it('announces the copy through a live region that was already there', async () => {
    openTooltip({ requestId: 'c1', srcText: 'hola', rect: rect() });
    finishTooltipDirect('c1', 'hello');
    await Promise.resolve();

    // The region must exist before the text lands, or the update is never announced.
    expect(announced()).toBe('');

    copyButton().click();
    await new Promise((r) => setTimeout(r, 0));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    expect(announced()).toBe('Copied');
  });

  it('keeps the button name describing the action, not the result', async () => {
    openTooltip({ requestId: 'c2', srcText: 'hola', rect: rect() });
    finishTooltipDirect('c2', 'hello');
    await Promise.resolve();

    copyButton().click();
    await new Promise((r) => setTimeout(r, 0));

    expect(copyButton().getAttribute('aria-label')).toBe('Copy translation');
  });
});
