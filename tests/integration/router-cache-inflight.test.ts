import { describe, it, expect, vi } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import { TranslationCache } from '@/background/cache';
import type { TranslationBackend } from '@/shared/backends/base';
import { makeDoneChunk, parseJsonResponse } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Either request may reach the cache first; calls.n === 1 is when the second one is sure to wait. */
async function afterLeaderClaimedKey(calls: { n: number }): Promise<void> {
  await vi.waitFor(() => {
    expect(calls.n).toBe(1);
  });
}

/** One macrotask boundary drains every microtask, which is all the waiter needs to reach the join. */
async function afterWaiterParked(): Promise<void> {
  await sleep(0);
}

/** Poll until the lookup is called (the crypto.subtle digest is a threadpool trip, not a microtask), then drain once: the waiter registers in `inflight` only after that lookup resolves. */
async function afterWaiterRegistered(get: { mock: { calls: unknown[] } }): Promise<void> {
  await vi.waitFor(() => {
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  await afterWaiterParked();
}

function mkBackend(
  calls: { n: number },
  beforeAnswer: () => Promise<void> = async () => {},
): TranslationBackend {
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      calls.n += 1;
      await beforeAnswer();
      const body = JSON.stringify({ translation: 'hello there', confidence: 0.9 });
      onChunk({ type: 'delta', requestId: req.id, text: body });
      onChunk(makeDoneChunk(req.id, parseJsonResponse(body)));
    },
  };
}

function mkRouter(backend: TranslationBackend, cache: RouterDeps['cache']) {
  return createRouter({
    backends: [backend],
    getSettings: async () => ({ ...DEFAULT_SETTINGS, anthropicApiKey: 'k' }),
    cache,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });
}

function translate(
  router: ReturnType<typeof mkRouter>,
  id: string,
  sink: TranslationChunk[],
): Promise<void> {
  return router.handleTranslate(
    {
      id,
      text: 'marhaba',
      sourceLang: sel('auto'),
      targetLang: sel('en'),
      options: { stream: false, explain: false },
    },
    (c) => sink.push(c),
  );
}

function answerOf(chunks: TranslationChunk[]): string {
  return parseJsonResponse(
    chunks
      .filter((c) => c.type === 'delta')
      .map((c) => c.text)
      .join(''),
  ).translation;
}

describe("a cache flush mid-request drops that request's write", () => {
  it('does not persist an answer shaped by settings that were flushed while it ran', async () => {
    const cache = new TranslationCache();
    const calls = { n: 0 };
    const router = mkRouter(
      mkBackend(calls, () => cache.clear()),
      cache,
    );

    await translate(router, 'g1', []);
    await translate(router, 'g2', []);

    expect(calls.n).toBe(2);
  });

  it('still persists when nothing flushed the cache', async () => {
    const cache = new TranslationCache();
    const calls = { n: 0 };
    const router = mkRouter(mkBackend(calls), cache);

    await translate(router, 'g1', []);
    await translate(router, 'g2', []);

    expect(calls.n).toBe(1);
  });
});

describe('identical requests in flight share one backend call', () => {
  it('the second request waits for the first and reads its answer', async () => {
    const cache = new TranslationCache();
    const calls = { n: 0 };
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const router = mkRouter(
      mkBackend(calls, () => gate),
      cache,
    );

    const firstChunks: TranslationChunk[] = [];
    const secondChunks: TranslationChunk[] = [];
    const first = translate(router, 'f1', firstChunks);
    await afterLeaderClaimedKey(calls);
    const second = translate(router, 'f2', secondChunks);
    await afterWaiterParked();
    release();
    await Promise.all([first, second]);

    expect(calls.n).toBe(1);
    expect(answerOf(firstChunks)).toBe('hello there');
    expect(answerOf(secondChunks)).toBe('hello there');
    expect(secondChunks.find((c) => c.type === 'done')).toBeDefined();
    expect(secondChunks.find((c) => c.type === 'error')).toBeUndefined();
  });

  it('cancel-all reaches the waiting request instead of answering it', async () => {
    const cache = new TranslationCache();
    const cacheGet = vi.spyOn(cache, 'get');
    const calls = { n: 0 };
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const router = mkRouter(
      mkBackend(calls, () => gate),
      cache,
    );

    const secondChunks: TranslationChunk[] = [];
    const first = translate(router, 'f1', []);
    await afterLeaderClaimedKey(calls);
    const second = translate(router, 'f2', secondChunks);
    await afterWaiterRegistered(cacheGet);
    expect(router.cancelAll()).toBe(2);
    release();
    await Promise.all([first, second]);

    const err = secondChunks.find((c) => c.type === 'error');
    expect(err && 'code' in err ? err.code : undefined).toBe('ABORTED');
  });

  it('canceling one parked waiter ends only that one, with a single terminal', async () => {
    const cache = new TranslationCache();
    const cacheGet = vi.spyOn(cache, 'get');
    const calls = { n: 0 };
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const router = mkRouter(
      mkBackend(calls, () => gate),
      cache,
    );

    const leaderChunks: TranslationChunk[] = [];
    const waiterChunks: TranslationChunk[] = [];
    const first = translate(router, 'c1', leaderChunks);
    await afterLeaderClaimedKey(calls);
    const second = translate(router, 'c2', waiterChunks);
    await afterWaiterRegistered(cacheGet);

    router.cancel('c2');
    release();
    await Promise.all([first, second]);

    const terminals = waiterChunks.filter((c) => c.type === 'done' || c.type === 'error');
    expect(terminals).toHaveLength(1);
    expect(terminals[0] && 'code' in terminals[0] ? terminals[0].code : undefined).toBe('ABORTED');
    // The leader was never canceled, so it still answers.
    expect(leaderChunks.some((c) => c.type === 'done')).toBe(true);
    expect(calls.n).toBe(1);
  });

  it('a third request parks on the waiter that took over the key', async () => {
    const cache = new TranslationCache();
    const cacheGet = vi.spyOn(cache, 'get');
    const calls = { n: 0 };
    let releaseLeader: () => void = () => {};
    let releaseWaiter: () => void = () => {};
    const leaderGate = new Promise<void>((r) => (releaseLeader = r));
    const waiterGate = new Promise<void>((r) => (releaseWaiter = r));
    const failing: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        calls.n += 1;
        if (calls.n === 1) {
          await leaderGate;
          onChunk({ type: 'error', requestId: req.id, code: 'AUTH', message: 'bad key' });
          return;
        }
        await waiterGate;
        const body = JSON.stringify({ translation: 'hello there', confidence: 0.9 });
        onChunk({ type: 'delta', requestId: req.id, text: body });
        onChunk(makeDoneChunk(req.id, parseJsonResponse(body)));
      },
    };
    const router = mkRouter(failing, cache);

    const thirdChunks: TranslationChunk[] = [];
    const first = translate(router, 'f1', []);
    await afterLeaderClaimedKey(calls);
    const second = translate(router, 'f2', []);
    await afterWaiterRegistered(cacheGet);
    releaseLeader();
    // The waiter now owns the key, so the third request must park instead of paying again.
    await vi.waitFor(() => {
      expect(calls.n).toBe(2);
    });
    const third = translate(router, 'f3', thirdChunks);
    await afterWaiterParked();
    releaseWaiter();
    await Promise.all([first, second, third]);

    expect(calls.n).toBe(2);
    expect(answerOf(thirdChunks)).toBe('hello there');
  });

  it('the waiter runs its own request when the leader answers nothing', async () => {
    const cache = new TranslationCache();
    const calls = { n: 0 };
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const failing: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        calls.n += 1;
        if (calls.n === 1) {
          await gate;
          onChunk({ type: 'error', requestId: req.id, code: 'AUTH', message: 'bad key' });
          return;
        }
        const body = JSON.stringify({ translation: 'hello there', confidence: 0.9 });
        onChunk({ type: 'delta', requestId: req.id, text: body });
        onChunk(makeDoneChunk(req.id, parseJsonResponse(body)));
      },
    };
    const router = mkRouter(failing, cache);

    const secondChunks: TranslationChunk[] = [];
    const first = translate(router, 'f1', []);
    await afterLeaderClaimedKey(calls);
    const second = translate(router, 'f2', secondChunks);
    await afterWaiterParked();
    release();
    await Promise.all([first, second]);

    expect(calls.n).toBe(2);
    expect(answerOf(secondChunks)).toBe('hello there');
  });
});

describe('cancel-all reaches a run that has not registered its controller yet', () => {
  it('aborts a request still reading settings, and never calls the backend', async () => {
    const calls = { n: 0 };
    let releaseSettings: () => void = () => {};
    const settingsGate = new Promise<void>((r) => (releaseSettings = r));
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, cancel, onChunk }) => {
        if (cancel.signal.aborted) {
          onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'cancelled' });
          return;
        }
        calls.n += 1;
        const body = JSON.stringify({ translation: 'hello there', confidence: 0.9 });
        onChunk({ type: 'delta', requestId: req.id, text: body });
        onChunk(makeDoneChunk(req.id, parseJsonResponse(body)));
      },
    };
    const router = createRouter({
      backends: [backend],
      getSettings: async () => {
        await settingsGate;
        return { ...DEFAULT_SETTINGS, anthropicApiKey: 'k' };
      },
      cache: new TranslationCache(),
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });

    const chunks: TranslationChunk[] = [];
    const run = translate(router, 'p1', chunks);
    await afterWaiterParked();

    expect(router.cancelAll()).toBe(1);
    releaseSettings();
    await run;

    const err = chunks.find((c) => c.type === 'error');
    expect(err && 'code' in err ? err.code : undefined).toBe('ABORTED');
    expect(calls.n).toBe(0);
  });
});
