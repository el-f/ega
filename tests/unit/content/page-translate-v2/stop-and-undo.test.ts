// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  cancelPageTranslateV2,
  isPageV2Active,
  routePageV2Chunk,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import { deps, flush, enterAndFire } from '@tests/_helpers/page-translate';

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
    update: vi.fn(),
    settle,
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
    text: `{"translation":"${text}"}`,
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
  it('keeps the finished blocks, puts back the unfinished ones, and cancels their requests', async () => {
    const rig = await run(['a', 'b']);
    finishBlock(rig.ids[0], 'One.');
    await flush();

    rig.stop();
    await flush();

    expect(document.getElementById('a')?.textContent).toBe('One.');
    expect(document.getElementById('b')?.textContent).toBe('二つ目の段落です。');
    expect(document.querySelector('[data-ega-replaced]')?.textContent).toBe('One.');
    expect(rig.cancelRequest).toHaveBeenCalledTimes(1);
    expect(rig.cancelRequest).toHaveBeenCalledWith(rig.ids[1]);
    expect(rig.dismiss).not.toHaveBeenCalled();
    expect(rig.settle).toHaveBeenCalledWith(
      expect.objectContaining({ done: 1, total: 1, complete: false, failed: 0, stopped: 1 }),
    );
  });

  it('ignores a late chunk for a stopped block', async () => {
    const rig = await run(['a', 'b']);
    finishBlock(rig.ids[0], 'One.');
    rig.stop();
    await flush();

    finishBlock(rig.ids[1], 'Two.');
    await flush();

    expect(document.getElementById('b')?.textContent).toBe('二つ目の段落です。');
  });

  it('with nothing finished it undoes the page, as there is nothing to keep', async () => {
    const rig = await run(['a', 'b']);

    rig.stop();
    await flush();

    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
    expect(rig.dismiss).toHaveBeenCalled();
    expect(isPageV2Active()).toBe(false);
  });

  it('does not queue a block that was still waiting for a worker slot', async () => {
    document.body.innerHTML += '<p id="d">四つ目の段落です。</p><p id="e">五つ目の段落です。</p>';
    const rig = await run(['a', 'b', 'c', 'd', 'e']);
    expect(rig.ids).toHaveLength(3);
    finishBlock(rig.ids[0], 'One.');
    await flush();
    const sent = rig.ids.length;

    rig.stop();
    await flush();

    expect(rig.ids).toHaveLength(sent);
    expect(document.getElementById('e')?.textContent).toBe('五つ目の段落です。');
  });
});

describe('Undo all', () => {
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
    routePageV2Chunk({ type: 'error', requestId: rig.ids[0] ?? '', code: 'AUTH', message: 'no' });
    routePageV2Chunk({ type: 'error', requestId: rig.ids[1] ?? '', code: 'AUTH', message: 'no' });
    await flush();
    expect(rig.settle).toHaveBeenCalledWith(expect.objectContaining({ failed: 2 }));
    const before = rig.ids.length;

    rig.retryFailed();
    await flush();

    expect(rig.ids.length).toBe(before + 2);
  });
});
