import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import { IMAGE_TIMED_OUT } from '@/background/router-chunks';
import type { TranslationBackend, TranslateImageArgs } from '@/shared/backends/base';
import type { Settings, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

// Captured before any test fakes timers: the fetch/base64 chain waits on real I/O, which fake ticks never drive.
const realSetTimeout = globalThis.setTimeout;

/** Flush the fake clock and yield 1ms of real time per turn until `done()` holds; the fake clock itself never moves. */
async function settleUntil(done: () => boolean, maxRealMs = 2_000): Promise<void> {
  for (let i = 0; i < maxRealMs && !done(); i++) {
    await vi.advanceTimersByTimeAsync(0);
    await new Promise((r) => realSetTimeout(r, 1));
  }
}

/** Image vision attempt loop (runImageVision) plus the handleImageTranslate chain trim and capability guard. */

type ImageImpl = NonNullable<TranslationBackend['translateImage']>;
type ErrorChunk = Extract<TranslationChunk, { type: 'error' }>;

function mkVision(id: string, translateImage: ImageImpl): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, true),
    isAvailable: async () => true,
    translate: async (a) => {
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
    translateImage,
  };
}

/** canVision manifest but no `translateImage` — passes chain resolution, fails
 *  the L811 capability guard. */
function mkVisionClaimOnly(id: string): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, true),
    isAvailable: async () => true,
    translate: async (a) => {
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
  };
}

function mkTextOnly(id: string): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, false),
    isAvailable: async () => true,
    translate: async (a) => {
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
  };
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    openaiApiKey: 'k',
    disabledBackends: [],
    ...patch,
  };
}

function baseDeps(patch: Partial<RouterDeps> = {}): RouterDeps {
  return {
    backends: [],
    getSettings: async () => mkSettings(),
    cache: { get: async () => undefined, set: async () => {} },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    ...patch,
  };
}

function errorsOf(chunks: TranslationChunk[]): ErrorChunk[] {
  return chunks.filter((c): c is ErrorChunk => c.type === 'error');
}

/** Backend double that ignores nothing: it waits for the wall-clock cancel,
 *  then emits whatever the case under test needs. */
function emitOnAbort(emit: (a: TranslateImageArgs) => void): ImageImpl {
  return async (a: TranslateImageArgs) => {
    if (a.cancel.signal.aborted) {
      emit(a);
      return;
    }
    await new Promise<void>((resolve) => {
      a.cancel.signal.addEventListener(
        'abort',
        () => {
          emit(a);
          resolve();
        },
        { once: true },
      );
    });
  };
}

const IMAGE_URL = 'https://example.com/x.png';
const NO_VISION_MSG =
  'No backend that reads images is set up. Open Settings → Backends and set up one that supports images.';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array(64), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('router — image attempt loop latches', () => {
  it('runs the single attempt and forwards exactly its chunks', async () => {
    const img = vi.fn<ImageImpl>(async (a: TranslateImageArgs) => {
      a.onChunk({ type: 'delta', requestId: a.requestId, text: 'hello' });
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const router = createRouter(baseDeps({ backends: [mkVision('anthropic', img)] }));
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i1', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    expect(img).toHaveBeenCalledTimes(1);
    expect(chunks.map((c) => c.type)).toEqual(['delta', 'done']);
  });

  it('a visible delta before a rotatable error blocks the fallthrough', async () => {
    const second = vi.fn<ImageImpl>(async () => {});
    const first: ImageImpl = async (a) => {
      a.onChunk({ type: 'delta', requestId: a.requestId, text: 'par' });
      a.onChunk({ type: 'error', requestId: a.requestId, code: 'RATE_LIMIT', message: '429' });
    };
    const router = createRouter(
      baseDeps({ backends: [mkVision('anthropic', first), mkVision('openai', second)] }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i2', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    expect(second).not.toHaveBeenCalled();
    expect(chunks.map((c) => c.type)).toEqual(['delta', 'error']);
    expect(errorsOf(chunks).map((e) => e.code)).toEqual(['RATE_LIMIT']);
  });

  it('a rotatable error with no delta falls through to the next attempt', async () => {
    const second = vi.fn<ImageImpl>(async (a: TranslateImageArgs) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const first: ImageImpl = async (a) => {
      a.onChunk({ type: 'error', requestId: a.requestId, code: 'NETWORK', message: 'reset' });
    };
    const router = createRouter(
      baseDeps({ backends: [mkVision('anthropic', first), mkVision('openai', second)] }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i3', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    expect(second).toHaveBeenCalledTimes(1);
    expect(chunks.map((c) => c.type)).toEqual(['done']);
    expect(errorsOf(chunks)).toHaveLength(0);
  });
});

describe('router — wall-clock rewrite and synthesis', () => {
  it('ABORTED after the wall-clock cancel becomes one TIMEOUT with the OCR wording', async () => {
    const img = emitOnAbort((a) => {
      a.onChunk({ type: 'error', requestId: a.requestId, code: 'ABORTED', message: 'aborted' });
    });
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', img)],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 5 }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i4', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('TIMEOUT');
    expect(errs[0]?.message).toBe(IMAGE_TIMED_OUT);
  });

  it('a NETWORK error after the wall-clock cancel is surfaced verbatim, once', async () => {
    const img = emitOnAbort((a) => {
      a.onChunk({ type: 'error', requestId: a.requestId, code: 'NETWORK', message: 'reset' });
    });
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', img)],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 5 }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i5', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('NETWORK');
    expect(errs[0]?.message).toBe('reset');
  });

  it('ABORTED without a wall-clock cancel stays ABORTED', async () => {
    const img: ImageImpl = async (a) => {
      a.onChunk({ type: 'error', requestId: a.requestId, code: 'ABORTED', message: 'cancelled' });
    };
    const router = createRouter(baseDeps({ backends: [mkVision('anthropic', img)] }));
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i6', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('ABORTED');
    expect(errs[0]?.message).toBe('cancelled');
  });

  it('a done that lands after the wall-clock cancel is not followed by a TIMEOUT', async () => {
    const img = emitOnAbort((a) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 0.9 });
    });
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', img)],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 5 }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i7', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    expect(chunks.map((c) => c.type)).toEqual(['done']);
    expect(errorsOf(chunks)).toHaveLength(0);
  });

  it('a silent attempt after the wall-clock cancel gets the synthesized TIMEOUT', async () => {
    const img = emitOnAbort(() => {});
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', img)],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 5 }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i8', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('TIMEOUT');
    expect(errs[0]?.message).toBe(IMAGE_TIMED_OUT);
  });

  it('image explain rewrites ABORTED after a wall-clock cancel to TIMEOUT with the image timeout wording', async () => {
    const img = emitOnAbort((a) => {
      a.onChunk({ type: 'error', requestId: a.requestId, code: 'ABORTED', message: 'aborted' });
    });
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', img)],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 5 }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain({ id: 'i9', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('TIMEOUT');
    expect(errs[0]?.message).toBe(IMAGE_TIMED_OUT);
  });
});

describe('router — lifecycle ceiling catch', () => {
  it('an attempt that ignores abort past the ceiling resolves with one TIMEOUT', async () => {
    vi.useFakeTimers();
    const img = vi.fn<ImageImpl>(async () => new Promise<never>(() => {}));
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', img)],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 1_000 }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    const run = router.handleImageTranslate({ id: 'i10', imageUrl: IMAGE_URL }, (c) =>
      chunks.push(c),
    );
    // Settle the fetch/base64 promise chain before moving the fake clock. A fixed
    // tick budget flakes: under load the chain needs more turns than it does idle.
    await settleUntil(() => img.mock.calls.length === 1);
    expect(img).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_001);
    await run;

    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('TIMEOUT');
    expect(errs[0]?.message).toBe(IMAGE_TIMED_OUT);
  });

  it('a non-ceiling throw from the attempt becomes one terminal error chunk', async () => {
    const img: ImageImpl = async () => {
      throw new Error('boom');
    };
    const router = createRouter(baseDeps({ backends: [mkVision('anthropic', img)] }));
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i11', imageUrl: IMAGE_URL }, (c) => chunks.push(c));
    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('UNKNOWN');
    expect(errs[0]?.message).toBe('boom');
  });
});

describe('router — attempt-chain trim and capability guard', () => {
  function threeRotatingBackends(): {
    backends: TranslationBackend[];
    spies: ReturnType<typeof vi.fn<ImageImpl>>[];
  } {
    const spies = ['anthropic', 'openai', 'gemini'].map(() =>
      vi.fn<ImageImpl>(async (a: TranslateImageArgs) => {
        a.onChunk({ type: 'error', requestId: a.requestId, code: 'NETWORK', message: 'reset' });
      }),
    );
    const backends = ['anthropic', 'openai', 'gemini'].map((id, i) =>
      mkVision(id, spies[i] as ImageImpl),
    );
    return { backends, spies };
  }

  it('trims the chain to maxImageAttempts (3 resolved, retryCount 1 → 2 tried)', async () => {
    const { backends, spies } = threeRotatingBackends();
    const router = createRouter(
      baseDeps({
        backends,
        getSettings: async () =>
          mkSettings({ advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 1 } }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i12', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    expect(spies[0]).toHaveBeenCalledTimes(1);
    expect(spies[1]).toHaveBeenCalledTimes(1);
    expect(spies[2]).not.toHaveBeenCalled();
    expect(errorsOf(chunks).map((e) => e.code)).toEqual(['NETWORK']);
  });

  it('keeps every attempt when the chain is exactly maxImageAttempts long', async () => {
    // 3 resolved with retryCount 2 must all run.
    const { backends, spies } = threeRotatingBackends();
    const router = createRouter(
      baseDeps({
        backends,
        getSettings: async () =>
          mkSettings({ advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 2 } }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i13', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(errorsOf(chunks).map((e) => e.code)).toEqual(['NETWORK']);
  });

  it('no vision-capable backend → the exact UNSUPPORTED OCR message', async () => {
    const router = createRouter(baseDeps({ backends: [mkTextOnly('anthropic')] }));
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i14', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('UNSUPPORTED');
    expect(errs[0]?.message).toBe(NO_VISION_MSG);
  });

  it('a canVision backend without translateImage is rejected by the guard', async () => {
    const router = createRouter(baseDeps({ backends: [mkVisionClaimOnly('anthropic')] }));
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'i15', imageUrl: IMAGE_URL }, (c) => chunks.push(c));

    const errs = errorsOf(chunks);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.code).toBe('UNSUPPORTED');
    expect(errs[0]?.message).toBe(NO_VISION_MSG);
  });
});
