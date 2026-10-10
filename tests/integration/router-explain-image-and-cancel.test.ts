import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter } from '@/background/router';
import { IMAGE_TIMED_OUT } from '@/background/router-chunks';
import type {
  TranslateCallArgs,
  TranslateImageArgs,
  TranslationBackend,
} from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { CANCEL_PRE_REG_CAP } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps, mkSettings } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);
const IMAGE_URL = 'https://i.redd.it/x.png';
const UNSUPPORTED_MSG =
  'No backend that reads images is set up. Open Settings → Backends and set up one that supports images.';

/** Vision manifest and the `translateImage` method are decoupled on purpose:
 *  L853's second operand only fires for a canVision backend WITHOUT the method. */
function mkVision(
  id: string,
  translateImage?: NonNullable<TranslationBackend['translateImage']>,
  canVision = true,
): TranslationBackend {
  const b: TranslationBackend = {
    id: bid(id),
    manifest: testManifest(id, canVision),
    isAvailable: async () => true,
    translate: async (a) => {
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: '{"translation":"ok","confidence":1}',
      });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
  };
  if (translateImage) b.translateImage = translateImage;
  return b;
}

function errOf(chunks: TranslationChunk[]): { code: string; message: string } | null {
  const e = chunks.find((c) => c.type === 'error');
  return e?.type === 'error' ? { code: e.code, message: e.message } : null;
}

function okPngFetch(bytes = new Uint8Array(10)): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } }),
    ),
  );
}

describe('router — explain chain trim and UNSUPPORTED guard', () => {
  beforeEach(() => okPngFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('trims the vision chain to maxAttempts — the 3rd backend is never reached', async () => {
    const rotatable =
      (msg: string) =>
      async (a: TranslateImageArgs): Promise<void> => {
        a.onChunk({ type: 'error', requestId: a.requestId, code: 'RATE_LIMIT', message: msg });
      };
    const aSpy = vi.fn(rotatable('a-429'));
    const bSpy = vi.fn(rotatable('b-429'));
    const cSpy = vi.fn(rotatable('c-429'));
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', aSpy), mkVision('openai', bSpy), mkVision('gemini', cSpy)],
        getSettings: async () =>
          mkSettings({
            backendOrder: ['anthropic', 'openai', 'gemini'].map(bid),
            // retryCount 1 → maxAttempts 2, chain of 3 must be cut to 2.
            advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 1 },
          }),
      }),
    );

    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: 'trim-1', imageUrl: IMAGE_URL, text: 'cap', targetLang: 'en' },
      (c) => chunks.push(c),
    );

    expect(aSpy).toHaveBeenCalledOnce();
    expect(bSpy).toHaveBeenCalledOnce();
    expect(cSpy).not.toHaveBeenCalled();
    expect(chunks.filter((c) => c.type === 'error')).toHaveLength(1);
    // The shared attempt summarizes an exhausted chain, the same as the text path.
    expect(errOf(chunks)).toEqual({
      code: 'RATE_LIMIT',
      message: 'b-429\nanthropic: Rate limit reached · openai: Rate limit reached',
    });
  });

  it('no vision-capable backend → exactly one UNSUPPORTED chunk with the exact message', async () => {
    const router = createRouter(baseDeps({ backends: [mkVision('anthropic', undefined, false)] }));
    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: 'none-1', imageUrl: IMAGE_URL, text: 'cap', targetLang: 'en' },
      (c) => chunks.push(c),
    );
    expect(chunks).toHaveLength(1);
    expect(errOf(chunks)).toEqual({ code: 'UNSUPPORTED', message: UNSUPPORTED_MSG });
  });

  it('canVision backend WITHOUT translateImage still emits UNSUPPORTED', async () => {
    const router = createRouter(baseDeps({ backends: [mkVision('anthropic', undefined, true)] }));
    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: 'nomethod-1', imageUrl: IMAGE_URL, text: 'cap', targetLang: 'en' },
      (c) => chunks.push(c),
    );
    expect(chunks).toHaveLength(1);
    expect(errOf(chunks)).toEqual({ code: 'UNSUPPORTED', message: UNSUPPORTED_MSG });
  });
});

describe('router — synthesized explain request', () => {
  beforeEach(() => okPngFetch());
  afterEach(() => vi.unstubAllGlobals());

  function captureRouter(seen: TranslateImageArgs[]): ReturnType<typeof createRouter> {
    const spy = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        seen.push(a);
        a.onChunk({
          type: 'delta',
          requestId: a.requestId,
          text: '{"translation":"An explanation","explain":"A note","confidence":1}',
        });
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
      },
    );
    return createRouter(baseDeps({ backends: [mkVision('anthropic', spy)] }));
  }

  it('omitted text renders an empty TEXT slot and still requests the explain field', async () => {
    const seen: TranslateImageArgs[] = [];
    const chunks: TranslationChunk[] = [];
    await captureRouter(seen).handleImageExplain(
      { id: 'notext-1', imageUrl: IMAGE_URL, targetLang: 'en' },
      (c) => chunks.push(c),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.user).toBe('TEXT:\n"""\n\n"""');
    expect(seen[0]?.system).toContain(', "explain": string');
    expect(seen[0]?.system).toContain('<role>You are a cultural-subtext analyst');
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
  });

  it('page context reaches the prompt when present and is absent when omitted', async () => {
    const withCtx: TranslateImageArgs[] = [];
    await captureRouter(withCtx).handleImageExplain(
      {
        id: 'ctx-1',
        imageUrl: IMAGE_URL,
        text: 'hello',
        targetLang: 'en',
        context: { pageTitle: 'Kitten News Daily', pageUrl: 'https://example.com/p' },
      },
      () => {},
    );
    expect(withCtx[0]?.user).toContain('PAGE CONTEXT:');
    expect(withCtx[0]?.user).toContain('Title: Kitten News Daily');
    expect(withCtx[0]?.user).toContain('URL: https://example.com/p');

    const noCtx: TranslateImageArgs[] = [];
    await captureRouter(noCtx).handleImageExplain(
      { id: 'ctx-2', imageUrl: IMAGE_URL, text: 'hello', targetLang: 'en' },
      () => {},
    );
    expect(noCtx[0]?.user).not.toContain('PAGE CONTEXT:');
    expect(noCtx[0]?.user).toBe('TEXT:\n"""\nhello\n"""');
  });
});

describe('router — explain timeout wording and ABORTED rewrite', () => {
  beforeEach(() => okPngFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('wallclock timeout synthesizes the image answer timeout message', async () => {
    // Emits nothing and ends only when the 5 ms wall clock aborts it.
    const stall = vi.fn<NonNullable<TranslationBackend['translateImage']>>(async ({ cancel }) => {
      await new Promise<void>((r) => cancel.signal.addEventListener('abort', () => r()));
    });
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', stall)],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 5 }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: 'to-1', imageUrl: IMAGE_URL, text: 'cap', targetLang: 'en' },
      (c) => chunks.push(c),
    );
    expect(errOf(chunks)).toEqual({ code: 'TIMEOUT', message: IMAGE_TIMED_OUT });
  });

  it('an ABORTED error after the wallclock is rewritten to TIMEOUT, once, with the explain wording', async () => {
    const onAbort = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        await new Promise<void>((resolve) => {
          if (a.cancel.signal.aborted) {
            resolve();
            return;
          }
          a.cancel.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        a.onChunk({
          type: 'error',
          requestId: a.requestId,
          code: 'ABORTED',
          message: 'user canceled',
        });
      },
    );
    const router = createRouter(
      baseDeps({
        backends: [mkVision('anthropic', onAbort)],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 5 }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: 'ab-1', imageUrl: IMAGE_URL, text: 'cap', targetLang: 'en' },
      (c) => chunks.push(c),
    );
    expect(chunks.filter((c) => c.type === 'error')).toHaveLength(1);
    expect(errOf(chunks)).toEqual({ code: 'TIMEOUT', message: IMAGE_TIMED_OUT });
  });
});

describe('router — cancel, cancelAll and the pre-registration cap', () => {
  const REQ = {
    text: 'hi',
    sourceLang: 'auto' as const,
    targetLang: asLangIdUnsafe('en'),
    options: { stream: false, explain: false },
  };

  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('cancel() aborts the inflight controller and cancelAll counts only the not-yet-aborted', async () => {
    const gates = new Map<string, { promise: Promise<void>; resolve: () => void }>();
    const starts = new Map<string, { promise: Promise<void>; resolve: () => void }>();
    for (const id of ['ca-a', 'ca-b']) {
      gates.set(id, deferred());
      starts.set(id, deferred());
    }
    const signals = new Map<string, AbortSignal>();
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', false),
      isAvailable: async () => true,
      // Never settles on abort, so both controllers stay in `inflight` for cancelAll.
      translate: async ({ req, cancel, onChunk }: TranslateCallArgs) => {
        signals.set(req.id, cancel.signal);
        starts.get(req.id)?.resolve();
        await gates.get(req.id)?.promise;
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"ok","confidence":1}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const router = createRouter(baseDeps({ backends: [backend] }));

    // Distinct text keeps both runs on the wire: identical text would park the second on the first.
    const runA = router.handleTranslate({ ...REQ, id: 'ca-a', text: 'first text' }, () => {});
    const runB = router.handleTranslate({ ...REQ, id: 'ca-b', text: 'second text' }, () => {});
    await starts.get('ca-a')?.promise;
    await starts.get('ca-b')?.promise;

    router.cancel('ca-a');
    expect(signals.get('ca-a')?.aborted).toBe(true);
    expect(signals.get('ca-b')?.aborted).toBe(false);

    expect(router.cancelAll()).toBe(1);
    expect(signals.get('ca-b')?.aborted).toBe(true);

    gates.get('ca-a')?.resolve();
    gates.get('ca-b')?.resolve();
    await Promise.all([runA, runB]);
  });

  function capRouter(seen: Record<string, boolean>): ReturnType<typeof createRouter> {
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', false),
      isAvailable: async () => true,
      translate: async ({ req, cancel, onChunk }: TranslateCallArgs) => {
        seen[req.id] = cancel.signal.aborted;
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"hi","confidence":1}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    return createRouter(baseDeps({ backends: [backend] }));
  }

  it('holds exactly CANCEL_PRE_REG_CAP pre-registered cancels — the oldest still fires', async () => {
    const seen: Record<string, boolean> = {};
    const router = capRouter(seen);
    for (let i = 0; i < CANCEL_PRE_REG_CAP; i++) router.cancel(`pre-${i}`);
    await router.handleTranslate({ ...REQ, id: 'pre-0' }, () => {});
    expect(seen['pre-0']).toBe(true);
  });

  it('one over the cap evicts the OLDEST id and keeps the newest', async () => {
    const seen: Record<string, boolean> = {};
    const router = capRouter(seen);
    for (let i = 0; i <= CANCEL_PRE_REG_CAP; i++) router.cancel(`pre-${i}`);
    await router.handleTranslate({ ...REQ, id: 'pre-0' }, () => {});
    expect(seen['pre-0']).toBe(false);
    await router.handleTranslate({ ...REQ, id: `pre-${CANCEL_PRE_REG_CAP}` }, () => {});
    expect(seen[`pre-${CANCEL_PRE_REG_CAP}`]).toBe(true);
  });

  it('clearProbes() busts the probe cache so the next translate re-probes', async () => {
    const probe = vi.fn(async () => true);
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', false),
      isAvailable: probe,
      translate: async ({ req, onChunk }: TranslateCallArgs) => {
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"hi","confidence":1}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const router = createRouter(baseDeps({ backends: [backend] }));

    await router.handleTranslate({ ...REQ, id: 'pc-1' }, () => {});
    const perRun = probe.mock.calls.length;
    expect(perRun).toBeGreaterThan(0);

    await router.handleTranslate({ ...REQ, id: 'pc-2' }, () => {});
    expect(probe.mock.calls.length).toBe(perRun);

    router.clearProbes();
    await router.handleTranslate({ ...REQ, id: 'pc-3' }, () => {});
    expect(probe.mock.calls.length).toBe(perRun * 2);
  });
});

describe('router — fetchImageForVision media type, base64 and error classes', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function runFetch(
    fetchImpl: () => Promise<Response>,
    seen: TranslateImageArgs[],
  ): Promise<TranslationChunk[]> {
    vi.stubGlobal('fetch', vi.fn(fetchImpl));
    const spy = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        seen.push(a);
        a.onChunk({
          type: 'delta',
          requestId: a.requestId,
          text: '{"translation":"An explanation","explain":"A note","confidence":1}',
        });
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
      },
    );
    const router = createRouter(baseDeps({ backends: [mkVision('anthropic', spy)] }));
    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: `fi-${Math.random()}`, imageUrl: IMAGE_URL, text: 'cap', targetLang: 'en' },
      (c) => chunks.push(c),
    );
    return chunks;
  }

  it('no content-type: the magic bytes decide, and the base64 is the exact encoding', async () => {
    const seen: TranslateImageArgs[] = [];
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = await runFetch(async () => new Response(png, { status: 200 }), seen);
    expect(errOf(chunks)).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.mediaType).toBe('image/png');
    expect(seen[0]?.imageBase64).toBe(btoa(String.fromCharCode(...png)));
  });

  it('no content-type over bytes that are not an image is refused, not sent as PNG', async () => {
    const seen: TranslateImageArgs[] = [];
    const chunks = await runFetch(
      async () => new Response(new Uint8Array([72, 101, 108, 108, 111]), { status: 200 }),
      seen,
    );
    expect(seen).toHaveLength(0);
    expect(errOf(chunks)?.code).toBe('IMAGE_UNSUPPORTED');
  });

  it('a DOMException AbortError classifies as ABORTED with the exact "cancelled" message', async () => {
    const seen: TranslateImageArgs[] = [];
    const chunks = await runFetch(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }, seen);
    expect(seen).toHaveLength(0);
    expect(chunks).toHaveLength(1);
    expect(errOf(chunks)).toEqual({ code: 'ABORTED', message: 'cancelled' });
  });

  it('a plain Error classifies as NETWORK with the exact wrapped message', async () => {
    const seen: TranslateImageArgs[] = [];
    const chunks = await runFetch(async () => {
      throw new Error('boom');
    }, seen);
    expect(seen).toHaveLength(0);
    expect(chunks).toHaveLength(1);
    expect(errOf(chunks)).toEqual({ code: 'NETWORK', message: 'Failed to fetch image: boom' });
  });

  it('a non-DOMException named AbortError is NOT treated as a cancel', async () => {
    const seen: TranslateImageArgs[] = [];
    const chunks = await runFetch(async () => {
      throw Object.assign(new Error('nope'), { name: 'AbortError' });
    }, seen);
    expect(chunks).toHaveLength(1);
    expect(errOf(chunks)).toEqual({ code: 'NETWORK', message: 'Failed to fetch image: nope' });
  });

  it('a DOMException with a different name classifies as NETWORK', async () => {
    const seen: TranslateImageArgs[] = [];
    const chunks = await runFetch(async () => {
      throw new DOMException('blocked by policy', 'NotAllowedError');
    }, seen);
    expect(chunks).toHaveLength(1);
    expect(errOf(chunks)).toEqual({
      code: 'NETWORK',
      message: 'Failed to fetch image: blocked by policy',
    });
  });
});
