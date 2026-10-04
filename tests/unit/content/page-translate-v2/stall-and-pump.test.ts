// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cancelPageTranslateV2,
  pageBackoffMs,
  pageRetryJitterMs,
  routePageV2Chunk,
  type PageV2Deps,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import type { Settings } from '@/shared/types';
import { enterAndFire } from '@tests/_helpers/page-translate';

const TIMEOUT_MS = 1_000;
/** The session arms its stall at translateTimeoutMs + 60s. */
const STALL_MS = TIMEOUT_MS + 60_000;

function progress(): ProgressHandle {
  return {
    update: vi.fn(),
    settle: vi.fn(),
    setLiveMessage: vi.fn(),
    setOnClose: vi.fn(),
    setOnToggleOriginal: vi.fn(),
    dismiss: vi.fn(),
  };
}

function deps(over: Partial<PageV2Deps> = {}, batchConcurrency = 3): PageV2Deps {
  return {
    getSettings: () =>
      Promise.resolve({
        pageTranslateMode: 'inplace',
        batchConcurrency,
        translateTimeoutMs: TIMEOUT_MS,
      } as unknown as Settings),
    dispatch: vi.fn(() => Promise.resolve()),
    onRegister: vi.fn(),
    onUnregister: vi.fn(),
    mountProgress: () => progress(),
    ...over,
  };
}

function paragraphs(n: number): void {
  document.body.innerHTML = Array.from(
    { length: n },
    (_, i) => `<p id="p${String(i)}">これは${String(i)}番目の段落です。</p>`,
  ).join('');
}

async function flush(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

function errorChipText(): string {
  return document.body.textContent;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the stall timer', () => {
  it('gives up on a block that never answers, and offers a retry', async () => {
    vi.useFakeTimers();
    paragraphs(1);
    await enterAndFire(deps(), ['p0']);

    await vi.advanceTimersByTimeAsync(STALL_MS + 1);
    await flush();

    expect(errorChipText()).toContain('Timed out');
  });

  it('does not fire before the deadline', async () => {
    vi.useFakeTimers();
    paragraphs(1);
    await enterAndFire(deps(), ['p0']);

    await vi.advanceTimersByTimeAsync(STALL_MS - 1);
    await flush();
    expect(errorChipText()).not.toContain('Timed out');

    // Proves the timer was armed all along, rather than never having been set.
    await vi.advanceTimersByTimeAsync(2);
    await flush();
    expect(errorChipText()).toContain('Timed out');
  });

  it('a streaming delta re-arms it, so a slow answer is not called stalled', async () => {
    vi.useFakeTimers();
    paragraphs(1);
    const ids: string[] = [];
    await enterAndFire(
      deps({
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['p0'],
    );

    // Two deltas, each most of a stall window apart: total elapsed passes the deadline twice over.
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(STALL_MS - 100);
      routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: '{"translation":"x' });
      await flush();
    }

    expect(errorChipText()).not.toContain('Timed out');

    // And once the deltas stop, the re-armed timer still fires — it was live, not canceled.
    await vi.advanceTimersByTimeAsync(STALL_MS + 1);
    await flush();
    expect(errorChipText()).toContain('Timed out');
  });

  it('a finished block never stalls, however long the page stays open', async () => {
    vi.useFakeTimers();
    paragraphs(1);
    const ids: string[] = [];
    await enterAndFire(
      deps({
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['p0'],
    );

    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: '{"translation":"done"}' });
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    await flush();
    // The answer landed, so the block really did reach a terminal chunk.
    expect(document.querySelector('[data-ega-replaced]')?.textContent).toBe('done');

    await vi.advanceTimersByTimeAsync(STALL_MS * 3);
    await flush();

    expect(errorChipText()).not.toContain('Timed out');
  });
});

describe('the stall timer — guards', () => {
  it('the timeout chip says why, and its Retry sends the block again', async () => {
    vi.useFakeTimers();
    paragraphs(1);
    const dispatch = vi.fn(() => Promise.resolve());
    await enterAndFire(deps({ dispatch }), ['p0']);

    await vi.advanceTimersByTimeAsync(STALL_MS + 1);
    await flush();
    const retry = document.querySelector<HTMLButtonElement>('[data-ega-retry-block]');
    expect(retry?.title).toBe('Timed out: No reply in time. Try again.');

    retry?.click();
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('a stray delta after the answer landed arms no new stall timer', async () => {
    vi.useFakeTimers();
    paragraphs(1);
    const ids: string[] = [];
    await enterAndFire(
      deps({
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['p0'],
    );
    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: '{"translation":"ok"}' });
    // A live block keeps exactly one stall timer; the terminal chunk removes it.
    const live = vi.getTimerCount();
    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    expect(vi.getTimerCount()).toBe(live - 1);

    routePageV2Chunk({ type: 'delta', requestId: ids[0] ?? '', text: 'late' });
    expect(vi.getTimerCount()).toBe(live - 1);
  });

  it('a send that succeeds after the batch was canceled arms no stall timer', async () => {
    vi.useFakeTimers();
    paragraphs(1);
    const resolvers: (() => void)[] = [];
    const dispatch = vi.fn(() => new Promise<void>((resolve) => resolvers.push(resolve)));

    await enterAndFire(deps({ dispatch }), ['p0']);
    await cancelPageTranslateV2();
    const afterCancel = vi.getTimerCount();
    resolvers[0]?.();
    await flush();
    expect(vi.getTimerCount()).toBe(afterCancel);

    // Positive control: the same late resolve on a live batch does arm the timer.
    await enterAndFire(deps({ dispatch }), ['p0']);
    const beforeResolve = vi.getTimerCount();
    resolvers[1]?.();
    await flush();
    expect(vi.getTimerCount()).toBe(beforeResolve + 1);
  });
});

describe('the rate-limit cooldown', () => {
  it('sends the first block at once when the clock reads zero', async () => {
    vi.useFakeTimers({ now: 0 });
    paragraphs(1);
    const dispatch = vi.fn(() => Promise.resolve());

    await enterAndFire(deps({ dispatch }), ['p0']);

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('resumes the queue from its own timer when the retry timer fires just before the cooldown ends', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // A timer can fire a millisecond before the wall clock reaches the cooldown end.
    const fakeNow = Date.now.bind(Date);
    let skew = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow() + skew);
    paragraphs(2);
    const ids: string[] = [];
    const dispatch = vi.fn((requestId: string) => {
      ids.push(requestId);
      return Promise.resolve();
    });
    await enterAndFire(deps({ dispatch }, 1), ['p0', 'p1']);
    expect(dispatch).toHaveBeenCalledTimes(1);

    skew = 1;
    routePageV2Chunk({
      type: 'error',
      requestId: ids[0] ?? '',
      code: 'RATE_LIMIT',
      message: '429',
    });
    skew = 0;
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    // The retry timer fired, but the cooldown has one millisecond left.
    expect(dispatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});

describe('the worker pool', () => {
  it('keeps only `batchConcurrency` blocks in flight, and frees a slot on a terminal chunk', async () => {
    paragraphs(5);
    const ids: string[] = [];
    const d = deps(
      {
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      },
      2,
    );

    await enterAndFire(d, ['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(ids).toHaveLength(2);

    routePageV2Chunk({ type: 'done', requestId: ids[0] ?? '', confidence: 1 });
    await flush();
    expect(ids).toHaveLength(3);

    routePageV2Chunk({ type: 'done', requestId: ids[1] ?? '', confidence: 1 });
    routePageV2Chunk({ type: 'done', requestId: ids[2] ?? '', confidence: 1 });
    await flush();
    expect(ids).toHaveLength(5);
  });

  it('dispatches every block when the pool is wider than the batch', async () => {
    paragraphs(2);
    const ids: string[] = [];
    await enterAndFire(
      deps({
        dispatch: vi.fn((requestId: string) => {
          ids.push(requestId);
          return Promise.resolve();
        }),
      }),
      ['p0', 'p1'],
    );

    expect(ids).toHaveLength(2);
  });
});

describe('retry backoff', () => {
  it('doubles per attempt and stops at 8 seconds', () => {
    expect(pageBackoffMs(1)).toBe(800);
    expect(pageBackoffMs(2)).toBe(1600);
    expect(pageBackoffMs(3)).toBe(3200);
    expect(pageBackoffMs(10)).toBe(8000);
  });

  it('jitters inside a 400ms window, and is not always zero', () => {
    const samples = Array.from({ length: 200 }, () => pageRetryJitterMs());

    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(400);
    // A jitter stuck at 0 would let every retry in a batch thunder back together.
    expect(Math.max(...samples)).toBeGreaterThan(0);
    expect(samples.every(Number.isInteger)).toBe(true);
  });
});
