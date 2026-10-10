// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  runPageTranslateV2,
  cancelPageTranslateV2,
  routePageV2Chunk,
  isPageV2Active,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import { isMultiSelectActive } from '@/content/page-translate-v2/multi-select';
import type { Settings } from '@/shared/types';
import {
  deps,
  flush,
  enterAndFire,
  retryButton,
  trackSettle,
} from '@tests/_helpers/page-translate';

interface Captured {
  close?: () => void;
  toggle?: (showOriginal: boolean) => void;
  handle: ProgressHandle;
  settle: Mock;
  dismiss: Mock;
  update: Mock;
  onClose: Mock;
  onToggle: Mock;
}

function progress(): Captured {
  const out: Partial<Captured> = {};
  const settle = vi.fn();
  const dismiss = vi.fn();
  const update = vi.fn(trackSettle(settle));
  const onClose = vi.fn((h: () => void) => {
    out.close = h;
  });
  const onToggle = vi.fn((h: (showOriginal: boolean) => void) => {
    out.toggle = h;
  });
  out.settle = settle;
  out.dismiss = dismiss;
  out.update = update;
  out.onClose = onClose;
  out.onToggle = onToggle;
  out.handle = {
    update,
    setLiveMessage: vi.fn(),
    setOnClose: onClose,
    setOnToggleOriginal: onToggle,
    dismiss,
  };
  return out as Captured;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
});

describe('page-translate-v2 — a second run over a settled batch', () => {
  it('keeps the settled pill and re-enters translate-areas mode', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">二つ目の段落です。</p>';
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const p = progress();
    const d = deps({ mountProgress: () => p.handle, dispatch });
    await enterAndFire(d, ['a']);
    routePageV2Chunk({ type: 'delta', requestId: captured, text: 'One.' });
    routePageV2Chunk({ type: 'done', requestId: captured, confidence: 1 });
    expect(p.settle).toHaveBeenCalled();
    expect(isPageV2Active()).toBe(true);

    await runPageTranslateV2(d);
    expect(p.dismiss).not.toHaveBeenCalled();
    expect(isPageV2Active()).toBe(true);
    expect(isMultiSelectActive()).toBe(true);
    // The first batch's translation stays on the page.
    expect(document.querySelector('[data-ega-replaced]')?.textContent).toBe('One.');
  });

  it('a still-running batch is left alone', async () => {
    document.body.innerHTML = '<p id="a">これは最初の段落です。</p>';
    const p = progress();
    const d = deps({ mountProgress: () => p.handle });
    await enterAndFire(d, ['a']);
    expect(isPageV2Active()).toBe(true);

    await runPageTranslateV2(d);
    expect(p.dismiss).not.toHaveBeenCalled();
    expect(isMultiSelectActive()).toBe(false);
    expect(isPageV2Active()).toBe(true);
  });
});

describe('page-translate-v2 — closing removes controls that no longer work', () => {
  it('removes every retry button when the pill is closed', async () => {
    document.body.innerHTML = '<p id="a">これは最初の段落です。</p>';
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const p = progress();
    await enterAndFire(deps({ mountProgress: () => p.handle, dispatch }), ['a']);
    routePageV2Chunk({ type: 'error', requestId: captured, code: 'UNKNOWN', message: 'bad key' });
    expect(retryButton()).not.toBeNull();

    p.close?.();
    expect(retryButton()).toBeNull();
    // The error chip stays: it still explains why that block is untranslated.
    expect(document.querySelector('[data-ega-tx-error]')).not.toBeNull();
  });
});

describe('page-translate-v2 — a retried block joins the current page view', () => {
  it('re-applies the global Show original view to a block that finished after the toggle', async () => {
    document.body.innerHTML = '<p id="a">これは元の段落です。</p>';
    const seen: string[] = [];
    const dispatch = vi.fn((requestId: string) => {
      seen.push(requestId);
      return Promise.resolve();
    });
    const p = progress();
    await enterAndFire(deps({ mountProgress: () => p.handle, dispatch }), ['a']);
    routePageV2Chunk({ type: 'error', requestId: seen[0] ?? '', code: 'UNKNOWN', message: 'no' });
    p.toggle?.(true);

    (retryButton() as HTMLButtonElement).click();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
    const retryId = seen[1] ?? '';
    routePageV2Chunk({ type: 'delta', requestId: retryId, text: 'Late.' });
    routePageV2Chunk({ type: 'done', requestId: retryId, confidence: 1 });

    const wrapper = document.querySelector('[data-ega-replaced]') as HTMLElement;
    expect(wrapper.textContent).toContain('これは元の段落です。');
    p.toggle?.(false);
    expect(wrapper.textContent).toBe('Late.');
  });

  it('a retry after settle pushes the pill back to in-progress', async () => {
    document.body.innerHTML = '<p id="a">これは元の段落です。</p>';
    const seen: string[] = [];
    const dispatch = vi.fn((requestId: string) => {
      seen.push(requestId);
      return Promise.resolve();
    });
    const p = progress();
    await enterAndFire(deps({ mountProgress: () => p.handle, dispatch }), ['a']);
    routePageV2Chunk({ type: 'error', requestId: seen[0] ?? '', code: 'UNKNOWN', message: 'no' });
    p.update.mockClear();

    (retryButton() as HTMLButtonElement).click();
    await flush();
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ done: 0, settled: false }));
  });
});

describe('page-translate-v2 — the retry budget is finite', () => {
  it('stops re-dispatching after 3 attempts and mounts a retry chip with the failure count', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      document.body.innerHTML = '<p id="a">これは元の段落です。</p>';
      const seen: string[] = [];
      const dispatch = vi.fn((requestId: string) => {
        seen.push(requestId);
        return Promise.resolve();
      });
      const setLiveMessage = vi.fn();
      const p = progress();
      p.handle.setLiveMessage = setLiveMessage;
      await enterAndFire(deps({ mountProgress: () => p.handle, dispatch }), ['a']);

      // Every attempt fails with a retryable code; the budget must stop the loop.
      for (let attempt = 0; attempt < 6; attempt++) {
        const id = seen.at(-1) ?? '';
        routePageV2Chunk({ type: 'error', requestId: id, code: 'RATE_LIMIT', message: '429' });
        await vi.advanceTimersByTimeAsync(10_000);
        await flush();
      }

      expect(dispatch).toHaveBeenCalledTimes(3);
      expect(retryButton()).not.toBeNull();
      expect(setLiveMessage).toHaveBeenCalledWith("Couldn't translate 1 of 1 area.");
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});

function click(id: string): void {
  document.getElementById(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function pressEnter(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

const SETTINGS = { pageTranslateMode: 'inplace', batchConcurrency: 3 } as unknown as Settings;

describe('page-translate-v2 — overlapping entries', () => {
  it('a second run while the first still reads settings is ignored', async () => {
    document.body.innerHTML = '<p id="a">これは最初の段落です。</p>';
    let release!: () => void;
    let reads = 0;
    const first = deps({
      getSettings: () => {
        reads += 1;
        if (reads > 1) return Promise.resolve(SETTINGS);
        return new Promise<Settings>((resolve) => {
          release = () => resolve(SETTINGS);
        });
      },
    });
    const secondSettings = vi.fn(() => Promise.resolve(SETTINGS));
    const second = deps({ getSettings: secondSettings });

    const opening = runPageTranslateV2(first);
    await runPageTranslateV2(second);
    expect(secondSettings).not.toHaveBeenCalled();

    release();
    await opening;
    click('a');
    pressEnter();
    await flush();
    expect(first.dispatch).toHaveBeenCalledTimes(1);
    expect(second.dispatch).not.toHaveBeenCalled();
  });

  it('a pick made while the first batch still reads settings cannot start a second batch', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">二つ目の段落です。</p>';
    let reads = 0;
    let release!: () => void;
    const d = deps({
      getSettings: () => {
        reads += 1;
        // Read 1 opens the picker, read 2 is the first batch starting.
        if (reads !== 2) return Promise.resolve(SETTINGS);
        return new Promise<Settings>((resolve) => {
          release = () => resolve(SETTINGS);
        });
      },
    });
    await runPageTranslateV2(d);
    click('a');
    pressEnter();
    await flush();
    expect(isPageV2Active()).toBe(false);

    await runPageTranslateV2(d);
    expect(isMultiSelectActive()).toBe(true);
    click('b');
    release();
    await flush();
    expect(isPageV2Active()).toBe(true);
    expect(d.dispatch).toHaveBeenCalledTimes(1);

    pressEnter();
    await flush();
    // The second pick joins the first batch.
    expect(d.dispatch).toHaveBeenCalledTimes(2);
    expect(reads).toBe(3);
  });

  it('a pick fired while the first batch still reads settings does not start a second batch', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">二つ目の段落です。</p>';
    let reads = 0;
    let release!: () => void;
    let mounted = 0;
    const d = deps({
      getSettings: () => {
        reads += 1;
        if (reads !== 2) return Promise.resolve(SETTINGS);
        return new Promise<Settings>((resolve) => {
          release = () => resolve(SETTINGS);
        });
      },
      mountProgress: () => {
        mounted += 1;
        return progress().handle;
      },
    });
    await runPageTranslateV2(d);
    click('a');
    pressEnter();
    await flush();
    await runPageTranslateV2(d);
    click('b');
    pressEnter();
    await flush();
    release();
    await flush();
    expect(mounted).toBe(1);
    expect(d.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe('page-translate-v2 — the pill', () => {
  it('its Remove translation cancels the batch and puts the page text back', async () => {
    document.body.innerHTML = '<p id="a">これは最初の段落です。</p>';
    let remove: (() => void) | undefined;
    const p = progress();
    p.handle.setOnUndoAll = (h: () => void) => {
      remove = h;
    };
    await enterAndFire(deps({ mountProgress: () => p.handle }), ['a']);
    expect(document.querySelector('[data-ega-replaced]')).not.toBeNull();

    remove?.();
    await flush();

    expect(isPageV2Active()).toBe(false);
    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
    expect(document.getElementById('a')?.textContent).toBe('これは最初の段落です。');
  });

  it('areas chosen after a batch settled join it: one pill, and its Remove translation puts back both', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">二つ目の段落です。</p>';
    const before = document.body.innerHTML;
    const ids: string[] = [];
    let remove: (() => void) | undefined;
    const p = progress();
    p.handle.setOnUndoAll = (h: () => void) => {
      remove = h;
    };
    let mounted = 0;
    const d = deps({
      mountProgress: () => {
        mounted += 1;
        return p.handle;
      },
      dispatch: vi.fn((requestId: string) => {
        ids.push(requestId);
        return Promise.resolve();
      }),
    });
    await enterAndFire(d, ['a']);
    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: 'One.' });
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    await runPageTranslateV2(d);
    click('b');
    pressEnter();
    await flush();
    expect(ids).toHaveLength(2);
    expect(mounted).toBe(1);
    routePageV2Chunk({ type: 'delta', requestId: ids[1] ?? '', text: 'Two.' });
    routePageV2Chunk({ type: 'done', requestId: ids[1] ?? '', confidence: 1 });
    expect(p.settle).toHaveBeenCalledTimes(2);

    remove?.();
    await flush();
    expect(document.body.innerHTML).toBe(before);
  });

  it('hands its close and toggle handlers over once, however often the batch settles', async () => {
    document.body.innerHTML = '<p id="a">これは元の段落です。</p>';
    const seen: string[] = [];
    const p = progress();
    await enterAndFire(
      deps({
        mountProgress: () => p.handle,
        dispatch: vi.fn((requestId: string) => {
          seen.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['a'],
    );
    routePageV2Chunk({ type: 'error', requestId: seen[0] ?? '', code: 'UNKNOWN', message: 'no' });
    expect(p.settle).toHaveBeenCalledTimes(1);

    (retryButton() as HTMLButtonElement).click();
    await flush();
    routePageV2Chunk({ type: 'done', requestId: seen[1] ?? '', confidence: 1 });

    expect(p.settle).toHaveBeenCalledTimes(2);
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onToggle).toHaveBeenCalledTimes(1);
  });

  it('a closed batch does not leave the whole-page original view on for the next one', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">二つ目の段落です。</p>';
    const ids: string[] = [];
    const pills = [progress(), progress()];
    let mounted = 0;
    const d = deps({
      mountProgress: () => pills[mounted++]?.handle as ProgressHandle,
      dispatch: vi.fn((requestId: string) => {
        ids.push(requestId);
        return Promise.resolve();
      }),
    });
    await enterAndFire(d, ['a']);
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    pills[0]?.toggle?.(true);
    pills[0]?.close?.();

    await runPageTranslateV2(d);
    click('b');
    pressEnter();
    await flush();
    routePageV2Chunk({ type: 'delta', requestId: ids[1] ?? '', text: 'Two.' });
    routePageV2Chunk({ type: 'done', requestId: ids[1] ?? '', confidence: 1 });
    const wrapper = document.getElementById('b')?.querySelector('[data-ega-replaced]');
    expect(wrapper?.textContent).toBe('Two.');

    wrapper?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrapper?.textContent).toBe('二つ目の段落です。');
    wrapper?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(wrapper?.textContent).toBe('Two.');
  });
});
