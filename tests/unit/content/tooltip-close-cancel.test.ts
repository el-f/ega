// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openTooltip, closeTooltip, errorTooltip } from '@/content/tipState.svelte';
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
  vi.stubGlobal('chrome', {
    runtime: { id: 'ega-test-id', sendMessage: vi.fn(), openOptionsPage: vi.fn() },
    storage: { local: { set: vi.fn() } },
  });
  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function wraps(): NodeListOf<HTMLElement> {
  return getContainer().querySelectorAll<HTMLElement>('[data-ega-tooltip-wrap]');
}

async function mounted(): Promise<void> {
  await vi.waitFor(() => {
    expect(wraps().length).toBe(1);
  });
  await Promise.resolve();
  await Promise.resolve();
}

async function click(selector: string): Promise<void> {
  const btn = getContainer().querySelector<HTMLElement>(selector);
  if (!btn) throw new Error(`no ${selector} in the tooltip`);
  btn.click();
  await Promise.resolve();
  await Promise.resolve();
}

describe('the tooltip close and cancel buttons reach the caller', () => {
  it('the close button runs onClose and takes the tooltip down', async () => {
    const onClose = vi.fn();
    openTooltip({
      requestId: 'r1',
      srcText: 'hello',
      rect: rect(50, 50, 100, 20),
      clickOutsideDismiss: false,
      onClose,
    });
    await mounted();

    await click('button[aria-label="Close"]');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(wraps().length).toBe(0);
  });

  it('the cancel button runs onCancel and takes the tooltip down', async () => {
    const onCancel = vi.fn();
    openTooltip({ requestId: 'r2', srcText: 'hello', rect: rect(50, 50, 100, 20), onCancel });
    await mounted();

    await click('.actions button');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(wraps().length).toBe(0);
  });
});

describe('an error tooltip', () => {
  it('shows exactly one Close, even with click-outside dismiss off', async () => {
    openTooltip({
      requestId: 'r3',
      srcText: 'hello',
      rect: rect(50, 50, 100, 20),
      clickOutsideDismiss: false,
    });
    await mounted();
    errorTooltip('r3', { code: 'NETWORK', message: 'request timed out' });
    await vi.waitFor(() => {
      expect(getContainer().textContent).toContain('request timed out');
    });
    // By accessible name, so a text-only Close in the actions row counts too.
    const closes = [...getContainer().querySelectorAll('button')].filter(
      (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === 'Close',
    );
    expect(closes).toHaveLength(1);
  });
});
