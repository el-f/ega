// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  cancelPageTranslateV2,
  isPageV2Active,
  pageSettleMessage,
  routePageV2Chunk,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import { deps, flush, enterAndFire } from '@tests/_helpers/page-translate';

interface Captured {
  close?: () => void;
  toggle?: (showOriginal: boolean) => void;
  handle: ProgressHandle;
  settle: Mock;
  dismiss: Mock;
  live: Mock;
}

function progress(): Captured {
  const out: Partial<Captured> = {};
  const settle = vi.fn();
  const dismiss = vi.fn();
  const live = vi.fn();
  out.settle = settle;
  out.dismiss = dismiss;
  out.live = live;
  out.handle = {
    update: vi.fn(),
    settle,
    setLiveMessage: live,
    setOnClose: vi.fn((h: () => void) => {
      out.close = h;
    }),
    setOnToggleOriginal: vi.fn((h: (showOriginal: boolean) => void) => {
      out.toggle = h;
    }),
    dismiss,
  };
  return out as Captured;
}

/** Two blocks, so a run can settle with one failure and one success. */
function twoBlocks(): void {
  document.body.innerHTML = '<p id="a">これは最初の段落です。</p><p id="b">二つ目の段落です。</p>';
}

beforeEach(async () => {
  document.body.innerHTML = '';
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  vi.restoreAllMocks();
});

describe('settling a batch', () => {
  it('waits for every block before settling, and settles once', async () => {
    twoBlocks();
    const ids: string[] = [];
    const p = progress();
    await enterAndFire(
      deps({
        mountProgress: () => p.handle,
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['a', 'b'],
    );

    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    await flush();
    expect(p.settle).not.toHaveBeenCalled();

    routePageV2Chunk({ type: 'done', requestId: ids[1] ?? '', confidence: 1 });
    await flush();
    expect(p.settle).toHaveBeenCalledTimes(1);
    expect(p.settle).toHaveBeenCalledWith({ done: 2, total: 2, complete: true, failed: 0 });
  });

  it('reports the failure count and is not complete when a block errored', async () => {
    twoBlocks();
    const ids: string[] = [];
    const p = progress();
    await enterAndFire(
      deps({
        mountProgress: () => p.handle,
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['a', 'b'],
    );

    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    // AUTH is terminal in the error policy; a retryable code would go to backoff instead.
    routePageV2Chunk({
      type: 'error',
      requestId: ids[1] ?? '',
      code: 'AUTH',
      message: 'the key was refused',
    });
    await flush();

    expect(p.settle).toHaveBeenCalledWith({
      done: 2,
      total: 2,
      complete: false,
      failed: 1,
      failedLabel: 'Authentication failed',
    });
    expect(p.live).toHaveBeenCalledWith(pageSettleMessage(2, 2, 1));
  });
});

describe('the show-original toggle a settled batch offers', () => {
  it('says which view is on, and puts the page back on the translation', async () => {
    twoBlocks();
    const ids: string[] = [];
    const p = progress();
    await enterAndFire(
      deps({
        mountProgress: () => p.handle,
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['a'],
    );
    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: '{"translation":"One."}' });
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    await flush();

    p.toggle?.(true);
    expect(p.live).toHaveBeenCalledWith('Showing the original page.');

    p.toggle?.(false);
    expect(p.live).toHaveBeenCalledWith('Showing the translation.');
  });

  it('closing while the original is shown leaves the translation on the page', async () => {
    twoBlocks();
    const ids: string[] = [];
    const p = progress();
    await enterAndFire(
      deps({
        mountProgress: () => p.handle,
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['a'],
    );
    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: '{"translation":"One."}' });
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    await flush();

    p.toggle?.(true);
    p.close?.();
    await flush();

    expect(document.querySelector('[data-ega-replaced]')?.textContent).toBe('One.');
    expect(p.dismiss).toHaveBeenCalled();
    expect(isPageV2Active()).toBe(false);
  });
});

describe('canceling a batch', () => {
  it('says so, drops the pill, and unregisters every in-flight request', async () => {
    twoBlocks();
    const onUnregister = vi.fn();
    const cancelRequest = vi.fn();
    const p = progress();
    await enterAndFire(deps({ mountProgress: () => p.handle, onUnregister, cancelRequest }), [
      'a',
      'b',
    ]);

    await cancelPageTranslateV2();

    expect(p.live).toHaveBeenCalledWith('Page translation canceled.');
    expect(p.dismiss).toHaveBeenCalled();
    expect(onUnregister).toHaveBeenCalledTimes(2);
    expect(cancelRequest).toHaveBeenCalledTimes(2);
    expect(isPageV2Active()).toBe(false);
  });

  it('puts the original text back', async () => {
    twoBlocks();
    const ids: string[] = [];
    const p = progress();
    await enterAndFire(
      deps({
        mountProgress: () => p.handle,
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['a'],
    );
    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: '{"translation":"One."}' });
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    await flush();
    expect(document.querySelector('[data-ega-replaced]')?.textContent).toBe('One.');

    await cancelPageTranslateV2();

    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
    expect(document.getElementById('a')?.textContent).toBe('これは最初の段落です。');
  });

  it('stops following the page URL, so a later popstate does nothing', async () => {
    twoBlocks();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    await enterAndFire(deps({ mountProgress: () => progress().handle }), ['a']);

    await cancelPageTranslateV2();

    expect(removeSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
  });

  it('is a no-op when nothing is running', async () => {
    await expect(cancelPageTranslateV2()).resolves.toBeUndefined();
    expect(isPageV2Active()).toBe(false);
  });
});
