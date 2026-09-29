// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTooltip, appendDelta, closeTooltip } from '@/content/tipState.svelte';
import { mountShadowHost, getContainer } from '@/content/shadowHost';
import { DEFAULT_TRANSLATE_TIMEOUT_MS } from '@/shared/constants';

// The guard must outlast the router's own timeout, else a healthy slow stream shows a fake one.

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

describe('tooltip stuck-timeout', () => {
  it('does NOT fake a timeout at the old 30s mark', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    vi.advanceTimersByTime(30_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(getContainer().textContent).not.toMatch(/timed out/i);
  });

  it('fires only after the router default + margin when no chunk ever arrives', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    vi.advanceTimersByTime(DEFAULT_TRANSLATE_TIMEOUT_MS + 30_000 + 100);
    await Promise.resolve();
    await Promise.resolve();
    expect(getContainer().textContent).toMatch(/timed out/i);
  });

  it('calls a silent worker a timeout, not a network issue', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    vi.advanceTimersByTime(DEFAULT_TRANSLATE_TIMEOUT_MS + 30_000 + 100);
    await Promise.resolve();
    await Promise.resolve();
    const text = getContainer().textContent;
    expect(text).toContain('Timed out: No reply in time. Try again.');
    expect(text).not.toMatch(/network issue/i);
  });

  it('every delta re-arms the guard — a live stream is never killed mid-stream', async () => {
    const guard = DEFAULT_TRANSLATE_TIMEOUT_MS + 30_000;
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    for (let i = 0; i < 4; i++) {
      appendDelta('a', 'x');
      vi.advanceTimersByTime(guard - 1_000);
      await Promise.resolve();
    }
    await Promise.resolve();
    expect(getContainer().textContent).not.toMatch(/timed out/i);
  });

  it('a stream that goes silent after the first delta still fails', async () => {
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    appendDelta('a', '"partial translation');
    vi.advanceTimersByTime(DEFAULT_TRANSLATE_TIMEOUT_MS + 30_000 + 100);
    await Promise.resolve();
    await Promise.resolve();
    expect(getContainer().textContent).toMatch(/timed out/i);
  });

  it('stuckTimeoutMs override sizes the guard for the image budget', async () => {
    openTooltip({
      requestId: 'a',
      srcText: '',
      rect: rect(50, 50, 100, 20),
      imageUrl: 'https://x.test/a.png',
      stuckTimeoutMs: 150_000,
    });
    vi.advanceTimersByTime(DEFAULT_TRANSLATE_TIMEOUT_MS + 30_000 + 100);
    await Promise.resolve();
    await Promise.resolve();
    expect(getContainer().textContent).not.toMatch(/timed out/i);

    vi.advanceTimersByTime(150_000 - (DEFAULT_TRANSLATE_TIMEOUT_MS + 30_000));
    await Promise.resolve();
    await Promise.resolve();
    expect(getContainer().textContent).toMatch(/timed out/i);
  });
});
