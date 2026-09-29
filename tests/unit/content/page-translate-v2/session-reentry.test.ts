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
import { deps, flush, enterAndFire } from '@tests/_helpers/page-translate';

interface Captured {
  close?: () => void;
  toggle?: (showOriginal: boolean) => void;
  handle: ProgressHandle;
  settle: Mock;
  dismiss: Mock;
  update: Mock;
}

function progress(): Captured {
  const out: Partial<Captured> = {};
  const settle = vi.fn();
  const dismiss = vi.fn();
  const update = vi.fn();
  out.settle = settle;
  out.dismiss = dismiss;
  out.update = update;
  out.handle = {
    update,
    settle,
    setLiveMessage: vi.fn(),
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

beforeEach(async () => {
  document.body.innerHTML = '';
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
});

describe('page-translate-v2 — a second run over a settled batch', () => {
  it('closes the settled pill and re-enters translate-areas mode', async () => {
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
    routePageV2Chunk({ type: 'delta', requestId: captured, text: '{"translation":"One."}' });
    routePageV2Chunk({ type: 'done', requestId: captured, confidence: 1 });
    expect(p.settle).toHaveBeenCalled();
    expect(isPageV2Active()).toBe(true);

    await runPageTranslateV2(d);
    expect(p.dismiss).toHaveBeenCalledTimes(1);
    expect(isPageV2Active()).toBe(false);
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
    routePageV2Chunk({ type: 'error', requestId: captured, code: 'AUTH', message: 'bad key' });
    expect(document.querySelector('[data-ega-retry-block]')).not.toBeNull();

    p.close?.();
    expect(document.querySelector('[data-ega-retry-block]')).toBeNull();
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
    routePageV2Chunk({ type: 'error', requestId: seen[0] ?? '', code: 'AUTH', message: 'no' });
    p.toggle?.(true);

    (document.querySelector('[data-ega-retry-block]') as HTMLButtonElement).click();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
    const retryId = seen[1] ?? '';
    routePageV2Chunk({ type: 'delta', requestId: retryId, text: '{"translation":"Late."}' });
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
    routePageV2Chunk({ type: 'error', requestId: seen[0] ?? '', code: 'AUTH', message: 'no' });
    p.update.mockClear();

    (document.querySelector('[data-ega-retry-block]') as HTMLButtonElement).click();
    await flush();
    expect(p.update).toHaveBeenCalledWith(0);
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
      expect(document.querySelector('[data-ega-retry-block]')).not.toBeNull();
      expect(setLiveMessage).toHaveBeenCalledWith('Translated 0 of 1. 1 failed.');
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});
