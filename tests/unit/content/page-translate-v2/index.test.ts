// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  runPageTranslateV2,
  cancelPageTranslateV2,
  routePageV2Chunk,
  isPageV2Active,
  pageBackoffMs,
  pageRetryJitterMs,
  pageSettleMessage,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import { isMultiSelectActive } from '@/content/page-translate-v2/multi-select';
import { beginRequest, releaseRequest, rendererFor, rendererOwner } from '@/content/request-state';
import { CONTEXT_INVALIDATED_MESSAGE, SEND_FAILED_MESSAGE } from '@/content/context-guard';
import { deps, flush, enterAndFire } from '@tests/_helpers/page-translate';

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function pressEnter(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

function progressHandle(over: Partial<ProgressHandle> = {}): ProgressHandle {
  return {
    update: vi.fn(),
    settle: vi.fn(),
    setLiveMessage: vi.fn(),
    setOnClose: vi.fn(),
    setOnToggleOriginal: vi.fn(),
    dismiss: vi.fn(),
    ...over,
  };
}

beforeEach(async () => {
  document.body.innerHTML = '';
  rendererOwner.clear();
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
});

describe('page-translate-v2 entrypoint — translate-areas mode', () => {
  it('entering shows the toolbar and dispatches nothing until fire', async () => {
    document.body.innerHTML = '<p id="a">これは日本語の段落です。</p>';
    const dispatch = vi.fn(() => Promise.resolve());
    await runPageTranslateV2(deps({ dispatch }));
    expect(isMultiSelectActive()).toBe(true);
    expect(isPageV2Active()).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fires one request per selected block; unselected blocks stay untouched', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">これは二つ目の段落です。</p><p id="c">Untouched English.</p>';
    const dispatch = vi.fn((_r: string, _t: string) => Promise.resolve());
    await enterAndFire(deps({ dispatch }), ['a', 'b']);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(isMultiSelectActive()).toBe(false);
    expect(isPageV2Active()).toBe(true);
    const c = document.getElementById('c');
    expect(c?.querySelector('[data-ega-replaced]')).toBeNull();
    expect(c?.textContent).toBe('Untouched English.');
  });

  it('a second run while picking exits the mode instead of stacking', async () => {
    document.body.innerHTML = '<p id="a">これは日本語の段落です。</p>';
    const d = deps();
    await runPageTranslateV2(d);
    expect(isMultiSelectActive()).toBe(true);
    await runPageTranslateV2(d);
    expect(isMultiSelectActive()).toBe(false);
  });

  it('Esc exits the mode without firing a translate', async () => {
    document.body.innerHTML = '<p id="a">これは日本語の段落です。</p>';
    const dispatch = vi.fn(() => Promise.resolve());
    await runPageTranslateV2(deps({ dispatch }));
    click(document.getElementById('a') as Element);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(isMultiSelectActive()).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(document.getElementById('a')?.hasAttribute('data-ega-ms-selected')).toBe(false);
  });

  it('bilingual mode mounts a sibling per selected block', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    await enterAndFire(deps({}, { pageTranslateMode: 'bilingual' }), ['src']);
    const src = document.getElementById('src');
    expect(src?.nextElementSibling?.hasAttribute('data-ega-tx')).toBe(true);
  });

  it('the toolbar mode toggle persists the choice and drives the fired session', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    sendMessage.mockClear();
    await runPageTranslateV2(deps());
    const host = document.getElementById('ega-shadow-host');
    const modeBtn = host?.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-ega-ms-mode="bilingual"]',
    );
    expect(modeBtn).toBeTruthy();
    modeBtn?.click();
    expect(sendMessage).toHaveBeenCalledWith({
      kind: 'settings:update',
      patch: { pageTranslateMode: 'bilingual' },
    });
    click(document.getElementById('src') as Element);
    pressEnter();
    await flush();
    expect(document.getElementById('src')?.nextElementSibling?.hasAttribute('data-ega-tx')).toBe(
      true,
    );
  });

  it('registers requestIds with the content router and routes chunks', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const onRegister = vi.fn((requestId: string) => beginRequest(requestId, 'page-v2'));
    await enterAndFire(
      deps(
        { dispatch, onRegister, onUnregister: releaseRequest },
        { pageTranslateMode: 'bilingual' },
      ),
      ['src'],
    );
    expect(onRegister).toHaveBeenCalledWith(captured);

    rendererFor(captured)?.append(captured, '{"translation":"Done."}');
    rendererFor(captured)?.finish(captured, { confidence: 1 });
    expect(document.getElementById('src')?.nextElementSibling?.textContent).toContain('Done.');
  });

  it('a failed dispatch unregisters its requestId — no ghost page-v2 owner', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const onRegister = vi.fn();
    const onUnregister = vi.fn();
    const dispatch = vi.fn(() => Promise.reject(new Error('SW unreachable')));
    await enterAndFire(deps({ dispatch, onRegister, onUnregister }), ['src']);
    expect(onRegister.mock.calls.length).toBeGreaterThan(0);
    expect(onUnregister).toHaveBeenCalledTimes(onRegister.mock.calls.length);
  });

  it('cancel unregisters every in-flight request and reverts mounted blocks', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const onUnregister = vi.fn();
    await enterAndFire(deps({ onUnregister }, { pageTranslateMode: 'bilingual' }), ['src']);
    expect(isPageV2Active()).toBe(true);
    await cancelPageTranslateV2();
    expect(onUnregister).toHaveBeenCalled();
    expect(isPageV2Active()).toBe(false);
    expect(document.getElementById('src')?.nextElementSibling).toBeNull();
  });

  it('honors the concurrency setting: only N dispatches until a block settles', async () => {
    document.body.innerHTML =
      '<p id="a">これは一番目の段落です。</p><p id="b">これは二番目の段落です。</p><p id="c">これは三番目の段落です。</p>';
    const seen: string[] = [];
    const dispatch = vi.fn((requestId: string) => {
      seen.push(requestId);
      return Promise.resolve();
    });
    await enterAndFire(deps({ dispatch }, { batchConcurrency: 2 }), ['a', 'b', 'c']);
    expect(dispatch).toHaveBeenCalledTimes(2);
    const first = seen[0] ?? '';
    routePageV2Chunk({ type: 'delta', requestId: first, text: '{"translation":"x"}' });
    routePageV2Chunk({ type: 'done', requestId: first, confidence: 1 });
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
});

describe('page-translate-v2 — settle, close and the Show original toggle', () => {
  it('close puts the page text back on a block whose retry is still in flight', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const original = document.getElementById('src')?.textContent ?? '';
    let closeHandler: (() => void) | undefined;
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const p = progressHandle({
      setOnClose: vi.fn((h: () => void) => {
        closeHandler = h;
      }),
    });
    await enterAndFire(
      deps({ mountProgress: () => p, dispatch }, { pageTranslateMode: 'inplace' }),
      ['src'],
    );
    routePageV2Chunk({ type: 'error', requestId: captured, code: 'AUTH', message: 'bad key' });
    await flush();

    const retry = document.querySelector('[data-ega-retry-block]');
    expect(retry).not.toBeNull();
    click(retry as Element);
    await flush();
    // Mid-retry the block shows the streaming placeholder, not its own text.
    expect(document.getElementById('src')?.textContent).not.toBe(original);

    closeHandler?.();
    expect(document.getElementById('src')?.textContent).toBe(original);
    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
  });

  it('settles complete and close keeps the translations', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    let closeHandler: (() => void) | undefined;
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const settle = vi.fn();
    const dismiss = vi.fn();
    const p = progressHandle({
      settle,
      dismiss,
      setOnClose: vi.fn((h: () => void) => {
        closeHandler = h;
      }),
    });
    const mountProgress = vi.fn(() => p);
    await enterAndFire(deps({ mountProgress, dispatch }, { pageTranslateMode: 'bilingual' }), [
      'src',
    ]);
    expect(mountProgress).toHaveBeenCalledWith(1, expect.any(Function));

    routePageV2Chunk({ type: 'delta', requestId: captured, text: '{"translation":"x"}' });
    routePageV2Chunk({ type: 'done', requestId: captured, confidence: 1 });

    expect(settle).toHaveBeenCalledWith({ done: 1, total: 1, complete: true, failed: 0 });
    expect(closeHandler).toBeDefined();
    expect(dismiss).not.toHaveBeenCalled();

    closeHandler?.();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(isPageV2Active()).toBe(false);
    expect(document.getElementById('src')?.nextElementSibling?.hasAttribute('data-ega-tx')).toBe(
      true,
    );
  });

  it('the pill toggle hides bilingual siblings and brings them back', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    let toggle: ((showOriginal: boolean) => void) | undefined;
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const p = progressHandle({
      setOnToggleOriginal: vi.fn((h: (showOriginal: boolean) => void) => {
        toggle = h;
      }),
    });
    await enterAndFire(
      deps({ mountProgress: () => p, dispatch }, { pageTranslateMode: 'bilingual' }),
      ['src'],
    );
    routePageV2Chunk({ type: 'delta', requestId: captured, text: '{"translation":"x"}' });
    routePageV2Chunk({ type: 'done', requestId: captured, confidence: 1 });
    expect(toggle).toBeDefined();

    const sibling = document.getElementById('src')?.nextElementSibling as HTMLElement;
    toggle?.(true);
    expect(sibling.style.display).toBe('none');
    toggle?.(false);
    expect(sibling.style.display).toBe('');
  });

  it('in-place global Show original survives mouse movement over the wrappers', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    let toggle: ((showOriginal: boolean) => void) | undefined;
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const p = progressHandle({
      setOnToggleOriginal: vi.fn((h: (showOriginal: boolean) => void) => {
        toggle = h;
      }),
    });
    await enterAndFire(deps({ mountProgress: () => p, dispatch }), ['src']);
    routePageV2Chunk({ type: 'delta', requestId: captured, text: '{"translation":"Hello"}' });
    routePageV2Chunk({ type: 'done', requestId: captured, confidence: 1 });

    const wrapper = document.querySelector('[data-ega-replaced]') as HTMLElement;
    expect(wrapper.textContent).toBe('Hello');

    toggle?.(true);
    expect(wrapper.textContent).toContain('これは翻訳すべき');
    // The peek listeners must not flip this block back while the global view is on.
    wrapper.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    wrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(wrapper.textContent).toContain('これは翻訳すべき');

    toggle?.(false);
    expect(wrapper.textContent).toBe('Hello');
    // With the global view off, press-and-peek works again.
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrapper.textContent).toContain('これは翻訳すべき');
    wrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(wrapper.textContent).toBe('Hello');
  });

  it('closing the pill while showing originals returns the page to the translated view', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    let toggle: ((showOriginal: boolean) => void) | undefined;
    let closeHandler: (() => void) | undefined;
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const p = progressHandle({
      setOnToggleOriginal: vi.fn((h: (showOriginal: boolean) => void) => {
        toggle = h;
      }),
      setOnClose: vi.fn((h: () => void) => {
        closeHandler = h;
      }),
    });
    await enterAndFire(deps({ mountProgress: () => p, dispatch }), ['src']);
    routePageV2Chunk({ type: 'delta', requestId: captured, text: '{"translation":"Hello"}' });
    routePageV2Chunk({ type: 'done', requestId: captured, confidence: 1 });

    const wrapper = document.querySelector('[data-ega-replaced]') as HTMLElement;
    toggle?.(true);
    expect(wrapper.textContent).not.toBe('Hello');
    closeHandler?.();
    // Close keeps translations — never a page stuck on originals with no toggle left.
    expect(wrapper.textContent).toBe('Hello');
    expect(isPageV2Active()).toBe(false);
  });
});

describe('page-translate-v2 — errors and retry', () => {
  it('a terminal error mounts a retry chip and counts as failed in the settle message', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const setLiveMessage = vi.fn();
    const p = progressHandle({ setLiveMessage });
    await enterAndFire(deps({ mountProgress: () => p, dispatch }), ['src']);
    routePageV2Chunk({ type: 'error', requestId: captured, code: 'AUTH', message: 'bad key' });
    expect(document.querySelector('[data-ega-retry-block]')).not.toBeNull();
    expect(setLiveMessage).toHaveBeenCalledWith('Translated 0 of 1. 1 failed.');
  });

  it('a transient error re-dispatches after the backoff delay', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
      const seen: string[] = [];
      const dispatch = vi.fn((requestId: string) => {
        seen.push(requestId);
        return Promise.resolve();
      });
      await enterAndFire(deps({ dispatch }), ['src']);
      expect(dispatch).toHaveBeenCalledTimes(1);
      routePageV2Chunk({
        type: 'error',
        requestId: seen[0] ?? '',
        code: 'RATE_LIMIT',
        message: '429',
      });
      // First attempt made → 800ms backoff floor, no jitter (random=0).
      await vi.advanceTimersByTimeAsync(799);
      expect(dispatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2);
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('a PARSE error gets one automatic retry, not two: its own ceiling is two attempts', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
      const seen: string[] = [];
      const dispatch = vi.fn((requestId: string) => {
        seen.push(requestId);
        return Promise.resolve();
      });
      await enterAndFire(deps({ dispatch }), ['src']);
      const fail = (i: number) =>
        routePageV2Chunk({ type: 'error', requestId: seen[i] ?? '', code: 'PARSE', message: 'x' });
      fail(0);
      await vi.advanceTimersByTimeAsync(60_000);
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(2);
      fail(1);
      await vi.advanceTimersByTimeAsync(60_000);
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(document.querySelector('[data-ega-retry-block]')).not.toBeNull();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('honors a Retry-After hint as the backoff floor', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
      const seen: string[] = [];
      const dispatch = vi.fn((requestId: string) => {
        seen.push(requestId);
        return Promise.resolve();
      });
      await enterAndFire(deps({ dispatch }), ['src']);
      routePageV2Chunk({
        type: 'error',
        requestId: seen[0] ?? '',
        code: 'RATE_LIMIT',
        message: '429',
        retryAfterMs: 5_000,
      });
      await vi.advanceTimersByTimeAsync(4_999);
      expect(dispatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2);
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('a rate limit holds every queued block for the backoff, not just the one that failed', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      document.body.innerHTML =
        '<p id="a">これは一番目の段落です。</p><p id="b">これは二番目の段落です。</p><p id="c">これは三番目の段落です。</p>';
      const seen: string[] = [];
      const dispatch = vi.fn((requestId: string) => {
        seen.push(requestId);
        return Promise.resolve();
      });
      await enterAndFire(deps({ dispatch }, { batchConcurrency: 2 }), ['a', 'b', 'c']);
      expect(dispatch).toHaveBeenCalledTimes(2);

      routePageV2Chunk({
        type: 'error',
        requestId: seen[0] ?? '',
        code: 'RATE_LIMIT',
        message: '429',
      });
      await flush();
      // The freed slot must not send the next block straight into the same limit.
      expect(dispatch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(799);
      expect(dispatch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2);
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('a Retry-After hint sets how long the queue waits', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      document.body.innerHTML =
        '<p id="a">これは一番目の段落です。</p><p id="b">これは二番目の段落です。</p>';
      const seen: string[] = [];
      const dispatch = vi.fn((requestId: string) => {
        seen.push(requestId);
        return Promise.resolve();
      });
      await enterAndFire(deps({ dispatch }, { batchConcurrency: 1 }), ['a', 'b']);
      routePageV2Chunk({
        type: 'error',
        requestId: seen[0] ?? '',
        code: 'RATE_LIMIT',
        message: '429',
        retryAfterMs: 5_000,
      });
      await vi.advanceTimersByTimeAsync(4_999);
      expect(dispatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2);
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('another transient error frees the slot for the next block at once', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      document.body.innerHTML =
        '<p id="a">これは一番目の段落です。</p><p id="b">これは二番目の段落です。</p>';
      const seen: string[] = [];
      const dispatch = vi.fn((requestId: string) => {
        seen.push(requestId);
        return Promise.resolve();
      });
      await enterAndFire(deps({ dispatch }, { batchConcurrency: 1 }), ['a', 'b']);
      routePageV2Chunk({ type: 'error', requestId: seen[0] ?? '', code: 'NETWORK', message: 'x' });
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('a stalled block flips to TIMEOUT with a retry chip once the stall budget passes', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
      const dispatch = vi.fn(() => Promise.resolve());
      await enterAndFire(deps({ dispatch }, { translateTimeoutMs: 1_000 }), ['src']);
      // Budget = translateTimeoutMs + 60s grace.
      await vi.advanceTimersByTimeAsync(61_001);
      const wrapper = document.querySelector('[data-ega-replaced]') as HTMLElement;
      expect(wrapper.querySelector('[data-ega-retry-block]')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('page-translate-v2 — SPA navigation abort', () => {
  it('a back/forward navigation to a new path triggers cancel', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const startPath = location.pathname + location.search;
    await enterAndFire(deps(), ['src']);
    expect(isPageV2Active()).toBe(true);

    history.pushState(null, '', '/new-path');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(isPageV2Active()).toBe(false);
    history.pushState(null, '', startPath);
  });

  it('a same-path navigation does NOT cancel', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    await enterAndFire(deps(), ['src']);
    expect(isPageV2Active()).toBe(true);

    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(isPageV2Active()).toBe(true);
  });

  // An isolated-world patch on `history` is invisible to the page's own router; jsdom shares one world and would pass it.
  it('a router pushState alone is invisible to the content script', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const startPath = location.pathname + location.search;
    await enterAndFire(deps(), ['src']);

    history.pushState(null, '', '/new-path');
    await flush();
    expect(isPageV2Active()).toBe(true);
    history.pushState(null, '', startPath);
    await cancelPageTranslateV2();
  });

  it('cancel unhooks the popstate listener', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const startPath = location.pathname + location.search;
    await enterAndFire(deps(), ['src']);
    await cancelPageTranslateV2();

    history.pushState(null, '', '/completely-different');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(isPageV2Active()).toBe(false);
    history.pushState(null, '', startPath);
  });
});

describe('pageBackoffMs — pure exponential backoff (jitter lives in pageRetryJitterMs)', () => {
  it('doubles the base per attempt: 800, 1600, 3200', () => {
    expect(pageBackoffMs(1)).toBe(800);
    expect(pageBackoffMs(2)).toBe(1600);
    expect(pageBackoffMs(3)).toBe(3200);
  });

  it('caps the base at 8000ms', () => {
    expect(pageBackoffMs(10)).toBe(8000);
  });
});

describe('pageRetryJitterMs — destagger term', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is 0 at random=0 and stays below 400 at random→1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pageRetryJitterMs()).toBe(0);
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    const j = pageRetryJitterMs();
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThan(400);
  });
});

describe('pageSettleMessage', () => {
  it('says done when nothing failed', () => {
    expect(pageSettleMessage(4, 4, 0)).toBe('Page translated.');
  });

  it('counts failures', () => {
    expect(pageSettleMessage(4, 4, 1)).toBe('Translated 3 of 4. 1 failed.');
  });

  it('a stop names the kept areas and the failed ones', () => {
    expect(pageSettleMessage(2, 2, 0, 3)).toBe('Stopped. Translated 2 of 5.');
    expect(pageSettleMessage(3, 3, 1, 2)).toBe('Stopped. Translated 2 of 5. 1 failed.');
  });
});

describe('page-translate-v2 — a dispatch that never reached the worker', () => {
  it('says the same thing the tooltip says when the extension was updated mid-run', async () => {
    document.body.innerHTML = '<p id="a">これは日本語の段落です。</p>';
    const dispatch = vi.fn(() => Promise.reject(new Error('Extension context invalidated.')));
    await enterAndFire(deps({ dispatch }), ['a']);

    const chip = document.querySelector('[data-ega-tx-error]');
    expect(chip?.getAttribute('title')).toContain(CONTEXT_INVALIDATED_MESSAGE);
  });

  it('uses the one send-failure sentence for any other transport error', async () => {
    document.body.innerHTML = '<p id="a">これは日本語の段落です。</p>';
    const dispatch = vi.fn(() => Promise.reject(new Error('port closed')));
    await enterAndFire(deps({ dispatch }), ['a']);

    const chip = document.querySelector('[data-ega-tx-error]');
    expect(chip?.getAttribute('title')).toContain(SEND_FAILED_MESSAGE);
  });

  it('still mints a request id where the platform withholds crypto.randomUUID', async () => {
    const real = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      document.body.innerHTML = '<p id="a">これは日本語の段落です。</p>';
      const dispatch = vi.fn((_requestId: string, _text: string) => Promise.resolve());
      await enterAndFire(deps({ dispatch }), ['a']);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0]?.[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: real, configurable: true });
    }
  });
});

describe('page-translate-v2 — retry guards and backoff jitter', () => {
  it('adds the jitter on top of the backoff, so a retry never comes early', async () => {
    vi.useFakeTimers();
    // floor(0.5 * 400) = 200ms of jitter on the 800ms base.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
      const seen: string[] = [];
      const dispatch = vi.fn((requestId: string) => {
        seen.push(requestId);
        return Promise.resolve();
      });
      await enterAndFire(deps({ dispatch }), ['src']);
      routePageV2Chunk({ type: 'error', requestId: seen[0] ?? '', code: 'NETWORK', message: 'x' });

      await vi.advanceTimersByTimeAsync(900);
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(101);
      await flush();
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('a double click on Retry sends the block once', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const seen: string[] = [];
    const dispatch = vi.fn((requestId: string) => {
      seen.push(requestId);
      return Promise.resolve();
    });
    await enterAndFire(deps({ dispatch }), ['src']);
    routePageV2Chunk({ type: 'error', requestId: seen[0] ?? '', code: 'AUTH', message: 'no' });

    const retry = document.querySelector<HTMLButtonElement>('[data-ega-retry-block]');
    retry?.click();
    retry?.click();
    await flush();

    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('the Retry on a failed-send chip sends the block again', async () => {
    document.body.innerHTML = '<p id="a">これは日本語の段落です。</p>';
    const dispatch = vi
      .fn<(requestId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('port closed'))
      .mockResolvedValue(undefined);
    await enterAndFire(deps({ dispatch }), ['a']);

    document.querySelector<HTMLButtonElement>('[data-ega-retry-block]')?.click();
    await flush();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-ega-retry-block]')).toBeNull();
  });

  it('the router adapter settles the block on a done call', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const onRegister = vi.fn((requestId: string) => beginRequest(requestId, 'page-v2'));
    const settle = vi.fn();
    const p = progressHandle({ settle });
    await enterAndFire(
      deps({ dispatch, onRegister, onUnregister: releaseRequest, mountProgress: () => p }),
      ['src'],
    );
    expect(settle).not.toHaveBeenCalled();

    rendererFor(captured)?.finish(captured, { confidence: 1 });

    expect(settle).toHaveBeenCalledWith({ done: 1, total: 1, complete: true, failed: 0 });
  });

  it('the router adapter turns an error chunk into the block error chip', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    let captured = '';
    const dispatch = vi.fn((requestId: string) => {
      captured = requestId;
      return Promise.resolve();
    });
    const onRegister = vi.fn((requestId: string) => beginRequest(requestId, 'page-v2'));
    await enterAndFire(deps({ dispatch, onRegister, onUnregister: releaseRequest }), ['src']);

    const renderer = rendererFor(captured);
    expect(renderer).toBeDefined();
    renderer?.error(captured, { code: 'AUTH', message: 'bad key' });

    expect(document.querySelector('[data-ega-tx-error]')?.textContent).toContain('Authentication');
    expect(document.querySelector('[data-ega-retry-block]')).not.toBeNull();
  });
});

describe('page-translate-v2 — the detected source language', () => {
  it('sends each block with its detected language, and keeps it on a retry', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const calls: { id: string; lang: string | undefined }[] = [];
    const dispatch = vi.fn((requestId: string, _text: string, detectedLang?: string) => {
      calls.push({ id: requestId, lang: detectedLang });
      return Promise.resolve();
    });
    await enterAndFire(deps({ dispatch, detectLang: () => 'ja' }), ['src']);
    expect(calls.map((c) => c.lang)).toEqual(['ja']);

    routePageV2Chunk({ type: 'error', requestId: calls[0]?.id ?? '', code: 'AUTH', message: 'no' });
    document.querySelector<HTMLButtonElement>('[data-ega-retry-block]')?.click();
    await flush();

    expect(calls.map((c) => c.lang)).toEqual(['ja', 'ja']);
  });

  it('sends no language when the detector has no answer', async () => {
    document.body.innerHTML = '<p id="src">これは翻訳すべき日本語の段落です。</p>';
    const dispatch = vi.fn((_r: string, _t: string, _lang?: string) => Promise.resolve());
    await enterAndFire(deps({ dispatch, detectLang: () => undefined }), ['src']);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[2]).toBeUndefined();
  });
});
