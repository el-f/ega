// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTooltip, errorTooltip, closeTooltip } from '@/content/tipState.svelte';
import { mountShadowHost, getContainer } from '@/content/shadowHost';

// Retry stays disabled while the server's Retry-After window is open, then re-enables.
// The button renders only for a caller that wired a handler, so every open here passes one.

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
  vi.useFakeTimers();
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
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function retryBtn(): HTMLButtonElement | null {
  return getContainer().querySelector<HTMLButtonElement>('.tooltip [data-ega-retry]');
}

function waitLabel(): HTMLElement | null {
  return getContainer().querySelector<HTMLElement>('.tooltip [data-ega-retry-wait]');
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('errorTooltip honors retryAfterMs', () => {
  it('disables Retry inside the window, re-enables after it passes', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20), onRetry: () => {} });
    await flush();
    errorTooltip('a', { code: 'RATE_LIMIT', message: 'HTTP 429', retryAfterMs: 5_000 });
    await flush();
    expect(retryBtn()).not.toBeNull();
    expect(retryBtn()?.hasAttribute('disabled')).toBe(true);

    vi.advanceTimersByTime(5_100);
    await flush();
    expect(retryBtn()?.hasAttribute('disabled')).toBe(false);
  });

  it('leaves Retry enabled when the error carries no retryAfterMs', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20), onRetry: () => {} });
    await flush();
    errorTooltip('a', { code: 'RATE_LIMIT', message: 'HTTP 429' });
    await flush();
    expect(retryBtn()?.hasAttribute('disabled')).toBe(false);
  });

  it('caps the wait at 60s so a bogus header cannot brick the button', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20), onRetry: () => {} });
    await flush();
    errorTooltip('a', { code: 'RATE_LIMIT', message: 'HTTP 429', retryAfterMs: 3_600_000 });
    await flush();
    expect(retryBtn()?.hasAttribute('disabled')).toBe(true);

    vi.advanceTimersByTime(60_100);
    await flush();
    expect(retryBtn()?.hasAttribute('disabled')).toBe(false);
  });

  it('shows a live countdown next to the disabled Retry and clears it at zero', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20), onRetry: () => {} });
    await flush();
    errorTooltip('a', { code: 'RATE_LIMIT', message: 'HTTP 429', retryAfterMs: 5_000 });
    await flush();
    expect(waitLabel()?.textContent).toBe('Retry in 5s');

    vi.advanceTimersByTime(2_000);
    await flush();
    expect(waitLabel()?.textContent).toBe('Retry in 3s');

    vi.advanceTimersByTime(3_100);
    await flush();
    expect(waitLabel()).toBeNull();
    expect(retryBtn()?.hasAttribute('disabled')).toBe(false);
  });

  it('renders no countdown when the error carries no retryAfterMs', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20), onRetry: () => {} });
    await flush();
    errorTooltip('a', { code: 'RATE_LIMIT', message: 'HTTP 429' });
    await flush();
    expect(waitLabel()).toBeNull();
  });
});
