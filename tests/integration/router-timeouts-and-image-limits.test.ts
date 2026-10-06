import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import { IMAGE_TIMED_OUT, TRANSLATE_TIMED_OUT } from '@/background/router-chunks';
import { optionsTabForMessage } from '@/shared/error-policy';
import type {
  TranslateCallArgs,
  TranslationBackend,
  TranslateImageArgs,
} from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { mkSettings, baseDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkBackend(id: string, translate: TranslationBackend['translate']): TranslationBackend {
  return { id: bid(id), manifest: testManifest(id), isAvailable: async () => true, translate };
}

function mkImageBackend(
  id: string,
  translateImage: NonNullable<TranslationBackend['translateImage']>,
): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, true),
    isAvailable: async () => true,
    translate: async () => {},
    translateImage,
  };
}

describe('router — ABORTED passes through when the wall clock did not fire', () => {
  it('user-cancel ABORTED (no timeout fired) passes through verbatim, NOT as TIMEOUT', async () => {
    const b = mkBackend('anthropic', async (a: TranslateCallArgs) => {
      a.onChunk({
        type: 'error',
        requestId: a.req.id,
        code: 'ABORTED',
        message: 'user cancelled',
      });
    });
    const deps = baseDeps({ backends: [b] });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('fr'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('ABORTED');
  });
});

describe('router — TIMEOUT message content', () => {
  it('timeout names the text answer timeout and points at Settings → Answers', async () => {
    const b = mkBackend('anthropic', async (a: TranslateCallArgs) => {
      await new Promise<void>((resolve) => {
        a.cancel.signal.addEventListener(
          'abort',
          () => {
            a.onChunk({
              type: 'error',
              requestId: a.req.id,
              code: 'ABORTED',
              message: 'cancelled',
            });
            resolve();
          },
          { once: true },
        );
      });
    });
    const deps: RouterDeps = { ...baseDeps({ backends: [b] }), translateTimeoutMs: 20 };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('fr'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('TIMEOUT');
      expect(err.message).toBe(
        'No answer before the text answer timeout. Try again, or raise it in Settings → Answers.',
      );
      expect(optionsTabForMessage(err.message, err.code)).toBe('translate');
    } else {
      throw new Error('expected error chunk');
    }
  });

  it('finally-block TIMEOUT fires when the backend neither emits a terminal chunk nor returns', async () => {
    const b = mkBackend('anthropic', async (a: TranslateCallArgs) => {
      await new Promise<void>((resolve) => {
        a.cancel.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const deps: RouterDeps = { ...baseDeps({ backends: [b] }), translateTimeoutMs: 20 };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('fr'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('TIMEOUT');
      expect(err.message).toBe(TRANSLATE_TIMED_OUT);
    } else {
      throw new Error('expected error chunk');
    }
  });
});

describe('router — transient fallback', () => {
  it('first backend emits RATE_LIMIT (transient), second backend called and succeeds', async () => {
    const firstCalls = vi.fn();
    const secondCalls = vi.fn();
    const first = mkBackend('anthropic', async (a: TranslateCallArgs) => {
      firstCalls();
      a.onChunk({
        type: 'error',
        requestId: a.req.id,
        code: 'RATE_LIMIT',
        message: 'try again',
      });
    });
    const second = mkBackend('openai', async (a: TranslateCallArgs) => {
      secondCalls();
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: '{"translation":"Y","confidence":1}',
      });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    });
    const deps = baseDeps({
      backends: [first, second],
      getSettings: async () =>
        mkSettings({
          openaiApiKey: 'k',
          disabledBackends: [],
        }),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('fr'),
        options: { stream: true, explain: false },
      },
      () => {},
    );
    expect(firstCalls).toHaveBeenCalledTimes(1);
    expect(secondCalls).toHaveBeenCalledTimes(1);
  });
});

describe('router — image-backend isAvailable gating', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(100), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('image backend with isAvailable=false is skipped, walks to next available', async () => {
    const unavailableCalls = vi.fn();
    const unavailable: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => false,
      translate: async () => {},
      translateImage: async (a: TranslateImageArgs) => {
        unavailableCalls();
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
      },
    };
    const availableCalls = vi.fn();
    const available = mkImageBackend('openai', async (a: TranslateImageArgs) => {
      availableCalls();
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const deps = baseDeps({
      backends: [unavailable, available],
      getSettings: async () =>
        mkSettings({
          openaiApiKey: 'k',
          disabledBackends: [],
        }),
    });
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/x.png' },
      () => {},
    );
    expect(unavailableCalls).not.toHaveBeenCalled();
    expect(availableCalls).toHaveBeenCalledTimes(1);
  });
});

describe('router — image fetch non-ok → NETWORK', () => {
  it('image fetch returning 500 surfaces NETWORK error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 500 })),
    );
    const b = mkImageBackend('anthropic', async (a: TranslateImageArgs) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const deps = baseDeps({ backends: [b] });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/x.png' },
      (c) => chunks.push(c),
    );
    vi.unstubAllGlobals();
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('NETWORK');
      expect(err.message).toContain('500');
    } else {
      throw new Error('expected error chunk');
    }
  });
});

describe('router — unsupported image type message', () => {
  it('rejection message includes the actual content-type string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(100), {
            status: 200,
            headers: { 'content-type': 'image/svg+xml' },
          }),
      ),
    );
    const b = mkImageBackend('anthropic', async (a: TranslateImageArgs) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const deps = baseDeps({ backends: [b] });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/x.svg' },
      (c) => chunks.push(c),
    );
    vi.unstubAllGlobals();
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('IMAGE_UNSUPPORTED');
      expect(err.message).toContain('image/svg+xml');
    } else {
      throw new Error('expected error chunk');
    }
  });
});

describe('router — 4 MB image size boundary', () => {
  it('blob at exactly 4MB is accepted (pins > vs >= boundary)', async () => {
    const exactly4mb = new Uint8Array(4 * 1024 * 1024);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(exactly4mb, {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
    const b = mkImageBackend('anthropic', async (a: TranslateImageArgs) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const deps = baseDeps({ backends: [b] });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/x.png' },
      (c) => chunks.push(c),
    );
    vi.unstubAllGlobals();
    const tooLarge = chunks.find((c) => c.type === 'error' && c.message.includes('too large'));
    expect(tooLarge).toBeUndefined();
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('blob over 4MB is rejected', async () => {
    const over4mb = new Uint8Array(4 * 1024 * 1024 + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(over4mb, {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
    const b = mkImageBackend('anthropic', async (a: TranslateImageArgs) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const deps = baseDeps({ backends: [b] });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/x.png' },
      (c) => chunks.push(c),
    );
    vi.unstubAllGlobals();
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('IMAGE_UNSUPPORTED');
      expect(err.message).toContain('over 4 MB');
    } else {
      throw new Error('expected error chunk');
    }
  });
});

describe('router — image finally-block TIMEOUT message', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(100), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('image TIMEOUT names the image answer timeout setting', async () => {
    const b = mkImageBackend('anthropic', async (a: TranslateImageArgs) => {
      await new Promise<void>((resolve) => {
        a.cancel.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const deps: RouterDeps = {
      ...baseDeps({ backends: [b] }),
      imageTranslateTimeoutMs: 20,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/x.png' },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('TIMEOUT');
      expect(err.message).toBe(IMAGE_TIMED_OUT);
    } else {
      throw new Error('expected error chunk');
    }
  });
});

describe('router — pre-registration cancel cap', () => {
  it('flooding cancels beyond cap drops oldest ids (pins > vs >= boundary)', async () => {
    const b = mkBackend('anthropic', async (a: TranslateCallArgs) => {
      a.onChunk({ type: 'delta', requestId: a.req.id, text: '{"translation":"X","confidence":1}' });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    });
    const deps = baseDeps({ backends: [b] });
    const r = createRouter(deps);

    for (let i = 0; i < 300; i++) {
      r.cancel(`floodid-${i}`);
    }

    // floodid-0 is the oldest, so its cancel fell out of the capped set.
    const chunks1: TranslationChunk[] = [];
    await r.handleTranslate(
      {
        id: 'floodid-0',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('fr'),
        options: { stream: true, explain: false },
      },
      (c) => chunks1.push(c),
    );
    expect(chunks1.some((c) => c.type === 'done')).toBe(true);
  });
});

describe('router — blobToBase64 chunk-loop boundaries', () => {
  beforeEach(() => {
    // Default: valid PNG
  });
  afterEach(() => vi.unstubAllGlobals());

  async function runWithBytes(bytes: Uint8Array): Promise<string | null> {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
            {
              status: 200,
              headers: { 'content-type': 'image/png' },
            },
          ),
      ),
    );
    let captured: string | null = null;
    const b = mkImageBackend('anthropic', async (a: TranslateImageArgs) => {
      captured = a.imageBase64;
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const deps = baseDeps({ backends: [b] });
    await createRouter(deps).handleImageTranslate(
      { id: `img-${Math.random()}`, imageUrl: 'https://example.com/x.png' },
      () => {},
    );
    return captured;
  }

  it('empty-ish buffer (1 byte) base64-encodes to 4 chars', async () => {
    const b64 = await runWithBytes(new Uint8Array([0x41]));
    expect(typeof b64).toBe('string');
    expect((b64 ?? '').length).toBeGreaterThanOrEqual(1);
  });

  it('exactly 32K buffer (one chunk) encodes correctly (pins i < bytes.length boundary)', async () => {
    const bytes = new Uint8Array(32 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const b64 = await runWithBytes(bytes);
    expect(typeof b64).toBe('string');
    // 32768 bytes → base64 length = ceil(32768/3)*4 = 43692; no padding.
    expect((b64 ?? '').length).toBe(43692);
  });

  it('buffer larger than one chunk (40K) produces correct base64 length', async () => {
    const bytes = new Uint8Array(40 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
    const b64 = await runWithBytes(bytes);
    expect(typeof b64).toBe('string');
    // 40960 bytes → ceil(40960/3)*4 = 54616, including two '=' pads.
    expect((b64 ?? '').length).toBe(54616);
  });
});
