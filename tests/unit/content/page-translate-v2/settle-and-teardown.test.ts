// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  cancelPageTranslateV2,
  isPageV2Active,
  routePageV2Chunk,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import { deps, flush, enterAndFire, trackSettle } from '@tests/_helpers/page-translate';

interface Captured {
  close?: () => void;
  toggle?: (showOriginal: boolean) => void;
  handle: ProgressHandle;
  settle: Mock;
  dismiss: Mock;
  live: Mock;
  update: Mock;
}

function progress(): Captured {
  const out: Partial<Captured> = {};
  const settle = vi.fn();
  const dismiss = vi.fn();
  const live = vi.fn();
  const update = vi.fn(trackSettle(settle));
  out.update = update;
  out.settle = settle;
  out.dismiss = dismiss;
  out.live = live;
  out.handle = {
    update,
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
    expect(p.settle).toHaveBeenCalledWith(
      expect.objectContaining({ done: 2, total: 2, failed: 0, skipped: 0 }),
    );
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
    // UNKNOWN is terminal in the error policy; a retryable code would go to backoff instead.
    routePageV2Chunk({
      type: 'error',
      requestId: ids[1] ?? '',
      code: 'UNKNOWN',
      message: 'the key was refused',
    });
    await flush();

    expect(p.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        done: 2,
        total: 2,
        failed: 1,
        failure: expect.objectContaining({
          body: 'Ega could not finish this translation.',
          details: ['the key was refused'],
        }),
      }),
    );
    expect(p.live).toHaveBeenCalledWith("Couldn't translate 1 of 2 areas.");
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
    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: 'One.' });
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
    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: 'One.' });
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

    expect(p.live).toHaveBeenCalledWith('Translation removed.');
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
    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: 'One.' });
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    await flush();
    expect(document.querySelector('[data-ega-replaced]')?.textContent).toBe('One.');

    await cancelPageTranslateV2();

    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
    expect(document.getElementById('a')?.textContent).toBe('これは最初の段落です。');
  });

  it('stops the page watch it started', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    twoBlocks();
    await enterAndFire(deps({ mountProgress: () => progress().handle }), ['a']);
    const at = observe.mock.calls.findIndex(([target]) => target === document.body);
    const watch = observe.mock.contexts[at];
    expect(watch).toBeDefined();

    await cancelPageTranslateV2();

    expect(disconnect.mock.contexts).toContain(watch);
  });

  it('is a no-op when nothing is running', async () => {
    await expect(cancelPageTranslateV2()).resolves.toBeUndefined();
    expect(isPageV2Active()).toBe(false);
  });
});

describe('a repeated terminal chunk', () => {
  it('counts the block once and settles once', async () => {
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

    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    expect(p.settle).toHaveBeenCalledTimes(1);
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });

    expect(p.settle).toHaveBeenCalledTimes(1);
    expect(p.update).toHaveBeenLastCalledWith(expect.objectContaining({ done: 1, total: 1 }));
  });
});

describe('a send that fails after the batch was canceled', () => {
  it('releases its request id and changes nothing else', async () => {
    twoBlocks();
    const rejects: ((e: Error) => void)[] = [];
    const onUnregister = vi.fn();
    const p = progress();
    await enterAndFire(
      deps({
        mountProgress: () => p.handle,
        onUnregister,
        dispatch: vi.fn(() => new Promise<void>((_, reject) => rejects.push(reject))),
      }),
      ['a'],
    );
    await cancelPageTranslateV2();
    expect(onUnregister).toHaveBeenCalledTimes(1);
    p.update.mockClear();
    p.settle.mockClear();

    rejects[0]?.(new Error('port closed'));
    await flush();

    // Positive control: the failure handler ran, because it released the id a second time.
    expect(onUnregister).toHaveBeenCalledTimes(2);
    expect(p.update).not.toHaveBeenCalled();
    expect(p.settle).not.toHaveBeenCalled();
  });
});

describe('the chunk router', () => {
  it('releases a request on its done chunk or error chunk, and not on a delta', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">二つ目の段落です。</p><p id="c">三つ目の段落です。</p>';
    const ids: string[] = [];
    const onUnregister = vi.fn();
    const cancelRequest = vi.fn();
    await enterAndFire(
      deps({
        onUnregister,
        cancelRequest,
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['a', 'b', 'c'],
    );

    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: 'x' });
    expect(onUnregister).not.toHaveBeenCalled();

    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    expect(onUnregister).toHaveBeenLastCalledWith(ids[0]);
    routePageV2Chunk({ type: 'error', requestId: ids[1] ?? '', code: 'UNKNOWN', message: 'no' });
    expect(onUnregister).toHaveBeenLastCalledWith(ids[1]);
    // A transient error goes to backoff; the old request is over all the same.
    routePageV2Chunk({ type: 'error', requestId: ids[2] ?? '', code: 'NETWORK', message: 'x' });
    expect(onUnregister).toHaveBeenLastCalledWith(ids[2]);
    expect(onUnregister).toHaveBeenCalledTimes(3);

    // Every request already ended, so a cancel has nothing left to stop.
    await cancelPageTranslateV2();
    expect(cancelRequest).not.toHaveBeenCalled();
  });
});
