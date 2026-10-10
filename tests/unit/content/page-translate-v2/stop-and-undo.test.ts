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

interface Rig {
  stop: () => void;
  undo: () => void;
  retryFailed: () => void;
  handle: ProgressHandle;
  settle: Mock;
  dismiss: Mock;
  ids: string[];
  cancelRequest: Mock;
}

async function run(blockIds: string[]): Promise<Rig> {
  const settle = vi.fn();
  const dismiss = vi.fn();
  const cancelRequest = vi.fn();
  const rig: Partial<Rig> = { settle, dismiss, cancelRequest, ids: [] };
  const handle: ProgressHandle = {
    update: vi.fn(trackSettle(settle)),
    setLiveMessage: vi.fn(),
    setOnClose: vi.fn(),
    setOnToggleOriginal: vi.fn(),
    setOnUndoAll: vi.fn((h: () => void) => {
      rig.undo = h;
    }),
    setOnRetryFailed: vi.fn((h: () => void) => {
      rig.retryFailed = h;
    }),
    dismiss,
  };
  await enterAndFire(
    deps({
      cancelRequest,
      mountProgress: (_total, onCancel) => {
        rig.stop = onCancel;
        return handle;
      },
      dispatch: vi.fn((requestId: string) => {
        rig.ids?.push(requestId);
        return Promise.resolve();
      }),
    }),
    blockIds,
  );
  rig.handle = handle;
  return rig as Rig;
}

function finishBlock(requestId: string | undefined, text: string): void {
  routePageV2Chunk({
    type: 'delta',
    requestId: requestId ?? '',
    text: text,
  });
  routePageV2Chunk({ type: 'done', requestId: requestId ?? '', confidence: 1 });
}

beforeEach(async () => {
  document.body.innerHTML =
    '<p id="a">これは最初の段落です。</p><p id="b">二つ目の段落です。</p><p id="c">三つ目の段落です。</p>';
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  vi.restoreAllMocks();
});

describe('Stop on a running page translation', () => {
  it('lets blocks in flight finish, starts nothing new, and settles on what is done', async () => {
    document.body.innerHTML += '<p id="d">四つ目の段落です。</p>';
    const rig = await run(['a', 'b', 'c', 'd']);
    // Three slots: d waits for one.
    expect(rig.ids).toHaveLength(3);

    rig.stop();
    await flush();
    expect(rig.cancelRequest).not.toHaveBeenCalled();
    expect(rig.settle).not.toHaveBeenCalled();

    finishBlock(rig.ids[0], 'One.');
    finishBlock(rig.ids[1], 'Two.');
    finishBlock(rig.ids[2], 'Three.');
    await flush();

    // The block that was waiting for a slot never started.
    expect(rig.ids).toHaveLength(3);
    expect(document.getElementById('c')?.textContent).toBe('Three.');
    expect(document.getElementById('d')?.textContent).toBe('四つ目の段落です。');
    expect(rig.settle).toHaveBeenCalledWith(
      expect.objectContaining({ done: 3, total: 3, failed: 0, skipped: 1 }),
    );
    expect(rig.dismiss).not.toHaveBeenCalled();
  });

  it('puts back a block whose retryable failure lands after Stop, since a retry is a new start', async () => {
    const rig = await run(['a', 'b']);
    finishBlock(rig.ids[0], 'One.');
    rig.stop();
    await flush();

    routePageV2Chunk({
      type: 'error',
      requestId: rig.ids[1] ?? '',
      code: 'SERVER',
      message: '503',
    });
    await flush();

    expect(document.getElementById('b')?.textContent).toBe('二つ目の段落です。');
    expect(rig.settle).toHaveBeenCalledWith(
      expect.objectContaining({ done: 1, total: 1, skipped: 1, failed: 0 }),
    );
  });

  it('with nothing finished and nothing in flight it removes the translation', async () => {
    const rig = await run(['a', 'b']);
    routePageV2Chunk({
      type: 'error',
      requestId: rig.ids[0] ?? '',
      code: 'SERVER',
      message: '503',
    });
    routePageV2Chunk({
      type: 'error',
      requestId: rig.ids[1] ?? '',
      code: 'SERVER',
      message: '503',
    });
    await flush();

    // Both wait out a backoff: nothing is done and nothing is in flight.
    rig.stop();
    await flush();

    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
    expect(rig.dismiss).toHaveBeenCalled();
    expect(isPageV2Active()).toBe(false);
  });

  it('a second Stop during a retry counts every dropped area', async () => {
    const rig = await run(['a', 'b', 'c']);
    routePageV2Chunk({
      type: 'error',
      requestId: rig.ids[0] ?? '',
      code: 'UNKNOWN',
      message: 'no',
    });
    finishBlock(rig.ids[1], 'Two.');
    await flush();
    rig.stop();
    finishBlock(rig.ids[2], 'Three.');
    await flush();
    expect(rig.settle).toHaveBeenLastCalledWith(
      expect.objectContaining({ total: 3, failed: 1, skipped: 0 }),
    );

    rig.retryFailed();
    await flush();
    rig.stop();
    routePageV2Chunk({
      type: 'error',
      requestId: rig.ids[3] ?? '',
      code: 'SERVER',
      message: '503',
    });
    await flush();

    expect(rig.settle).toHaveBeenLastCalledWith(expect.objectContaining({ total: 2, skipped: 1 }));
    expect(document.getElementById('a')?.textContent).toBe('これは最初の段落です。');
    expect(document.getElementById('b')?.textContent).toBe('Two.');
  });
});

describe('Remove translation', () => {
  it('puts every block back after the batch settled', async () => {
    const rig = await run(['a']);
    finishBlock(rig.ids[0], 'One.');
    await flush();
    expect(document.getElementById('a')?.textContent).toBe('One.');

    rig.undo();
    await flush();

    expect(document.getElementById('a')?.textContent).toBe('これは最初の段落です。');
    expect(rig.dismiss).toHaveBeenCalled();
    expect(isPageV2Active()).toBe(false);
  });

  it('is offered from the start of the run, and reverts finished blocks too', async () => {
    const rig = await run(['a', 'b']);
    finishBlock(rig.ids[0], 'One.');

    rig.undo();
    await flush();

    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
    expect(document.getElementById('a')?.textContent).toBe('これは最初の段落です。');
  });
});

describe('Retry failed', () => {
  it('retries every failed block at once', async () => {
    const rig = await run(['a', 'b']);
    routePageV2Chunk({
      type: 'error',
      requestId: rig.ids[0] ?? '',
      code: 'UNKNOWN',
      message: 'no',
    });
    routePageV2Chunk({
      type: 'error',
      requestId: rig.ids[1] ?? '',
      code: 'UNKNOWN',
      message: 'no',
    });
    await flush();
    expect(rig.settle).toHaveBeenCalledWith(expect.objectContaining({ failed: 2 }));
    const before = rig.ids.length;

    rig.retryFailed();
    await flush();

    expect(rig.ids.length).toBe(before + 2);
  });
});
