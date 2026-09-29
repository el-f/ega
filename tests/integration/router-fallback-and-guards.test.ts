import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

// Each test pins one Stryker survivor on router.ts that the rest of the suite leaves alive.

function mkBackend(opts: {
  id: string;
  emit?: TranslationChunk[];
  translate?: (a: TranslateCallArgs) => Promise<void>;
  available?: boolean;
  translateImage?: TranslationBackend['translateImage'];
}): TranslationBackend {
  const backend: TranslationBackend = {
    id: bid(opts.id),
    manifest: testManifest(opts.id, Boolean(opts.translateImage)),
    isAvailable: async () => opts.available ?? true,
    translate:
      opts.translate ??
      (async ({ req, onChunk }) => {
        for (const c of opts.emit ?? []) onChunk({ ...c, requestId: req.id });
      }),
  };
  if (opts.translateImage) backend.translateImage = opts.translateImage;
  return backend;
}

function baseDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return {
    backends: overrides.backends ?? [],
    getSettings:
      overrides.getSettings ??
      (async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
      })),
    ...(overrides.getCustomLanguages ? { getCustomLanguages: overrides.getCustomLanguages } : {}),
    cache: overrides.cache ?? {
      get: async () => undefined,
      set: async () => {},
    },
    logger: overrides.logger ?? { debug() {}, info() {}, warn() {}, error() {} },
    ...(overrides.translateTimeoutMs !== undefined
      ? { translateTimeoutMs: overrides.translateTimeoutMs }
      : {}),
    ...(overrides.imageTranslateTimeoutMs !== undefined
      ? { imageTranslateTimeoutMs: overrides.imageTranslateTimeoutMs }
      : {}),
  };
}

const REQ = {
  id: 'r1',
  text: 'hi',
  sourceLang: sel('arabizi'),
  targetLang: sel('en'),
  options: { stream: true, explain: false },
};

describe('router — attempt order and fallback gates', () => {
  it('wall-clock timeout prevents fallthrough to the next chain entry', async () => {
    const bSpy = vi.fn(async ({ req, onChunk }: TranslateCallArgs) => {
      onChunk({ type: 'delta', requestId: req.id, text: 'should-not-run' });
      onChunk({ type: 'done', requestId: req.id, confidence: 1 });
    });
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk, cancel }) => {
        await new Promise<void>((resolve) => {
          cancel.signal.addEventListener(
            'abort',
            () => {
              onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'aborted' });
              resolve();
            },
            { once: true },
          );
        });
      },
    });
    const b = mkBackend({ id: 'openai', translate: bSpy });
    const deps = baseDeps({
      backends: [a, b],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        openaiApiKey: 'k',
        backendFallbackChain: ['anthropic', 'openai'].map(bid),
        disabledBackends: [],
      }),
      translateTimeoutMs: 40,
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(bSpy).not.toHaveBeenCalled();
    const terminal = chunks.find((c) => c.type === 'error' || c.type === 'done');
    expect(terminal?.type).toBe('error');
    if (terminal?.type === 'error') expect(terminal.code).toBe('TIMEOUT');
  });

  it('transient error on first backend + visible delta before failure → surfaces error, no fallthrough', async () => {
    const bSpy = vi.fn(async () => {});
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'delta', requestId: req.id, text: 'par' });
        onChunk({ type: 'error', requestId: req.id, code: 'RATE_LIMIT', message: '429' });
      },
    });
    const b = mkBackend({ id: 'openai', translate: bSpy });
    const deps = baseDeps({
      backends: [a, b],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        openaiApiKey: 'k',
        backendFallbackChain: ['anthropic', 'openai'].map(bid),
        disabledBackends: [],
      }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(bSpy).not.toHaveBeenCalled();
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('RATE_LIMIT');
  });

  it('transient error on LAST attempt surfaces the error (does not silently succeed)', async () => {
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'error', requestId: req.id, code: 'NETWORK', message: 'conn reset' });
      },
    });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        backendFallbackChain: ['anthropic'].map(bid),
        disabledBackends: [],
      }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('NETWORK');
  });

  it('backends whose isAvailable() throws are skipped (no translate call)', async () => {
    const translateSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic' });
    a.isAvailable = async () => {
      throw new Error('network');
    };
    a.translate = translateSpy;
    const b = mkBackend({
      id: 'openai',
      emit: [
        { type: 'delta', requestId: '', text: 'ok' },
        { type: 'done', requestId: '', confidence: 1 },
      ],
    });
    const deps = baseDeps({
      backends: [a, b],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: 'auto',
        openaiApiKey: 'k',
        anthropicApiKey: 'k',
        backendFallbackChain: ['anthropic', 'openai'].map(bid),
        disabledBackends: [],
      }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(translateSpy).not.toHaveBeenCalled();
    expect(chunks.find((c) => c.type === 'done')).toBeTruthy();
  });

  it('stream=false on request overrides stream=true on settings', async () => {
    // Streaming runs only when the request AND the settings both allow it.
    let sawStream: boolean | null = null;
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ stream, req, onChunk }) => {
        sawStream = stream;
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        streaming: true,
      }),
    });
    await createRouter(deps).handleTranslate(
      { ...REQ, options: { stream: false, explain: false } },
      () => {},
    );
    expect(sawStream).toBe(false);
  });

  it('settings.streaming=false forces stream=false regardless of request flag', async () => {
    let sawStream: boolean | null = null;
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ stream, req, onChunk }) => {
        sawStream = stream;
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        streaming: false,
      }),
    });
    await createRouter(deps).handleTranslate(
      { ...REQ, options: { stream: true, explain: false } },
      () => {},
    );
    expect(sawStream).toBe(false);
  });
});

describe('router — cancel and duplicate-id handling', () => {
  it('cancel() before handleTranslate pre-aborts the freshly-registered signal', async () => {
    let sawSignalAborted: boolean | null = null;
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, cancel, onChunk }) => {
        sawSignalAborted = cancel.signal.aborted;
        onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'cancelled' });
      },
    });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
      }),
    });
    const router = createRouter(deps);
    router.cancel('r1'); // pre-registered cancel
    await router.handleTranslate(REQ, () => {});
    expect(sawSignalAborted).toBe(true);
  });

  it('calling handleTranslate twice with the same id aborts the first signal', async () => {
    // The cast widens the literal `null` inference — the read site would narrow to `never`.
    let firstSignal: AbortSignal | null = null as AbortSignal | null;
    let firstStarted: (() => void) | null = null;
    const started = new Promise<void>((r) => {
      firstStarted = r;
    });
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, cancel, onChunk }) => {
        // First call hangs until abort; the second returns right away.
        if (!firstSignal) {
          firstSignal = cancel.signal;
          firstStarted?.();
          await new Promise<void>((resolve) => {
            cancel.signal.addEventListener(
              'abort',
              () => {
                onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'x' });
                resolve();
              },
              { once: true },
            );
          });
        } else {
          onChunk({ type: 'done', requestId: req.id, confidence: 1 });
        }
      },
    });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
      }),
    });
    const router = createRouter(deps);
    const firstCall = router.handleTranslate({ ...REQ, id: 'collide' }, () => {});
    await started;
    await router.handleTranslate({ ...REQ, id: 'collide' }, () => {});
    await firstCall;
    expect(firstSignal).not.toBeNull();
    expect(firstSignal?.aborted).toBe(true);
  });
});

describe('router — image translate', () => {
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('oversized blob rejects with UNSUPPORTED — backend.translateImage never runs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(5 * 1024 * 1024), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
    const imgSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic', translateImage: imgSpy });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        disabledBackends: [],
      }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/big.png' },
      (c) => chunks.push(c),
    );
    expect(imgSpy).not.toHaveBeenCalled();
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
    expect(err?.type === 'error' ? err.message : '').toContain('4 MB');
  });

  it('image router widens in auto mode to pick a vision-capable backend past the chain', async () => {
    // The image router must pass registeredIds, else a vision backend outside the chain is skipped.
    const imgA = vi.fn(async ({ requestId, onChunk }) => {
      onChunk({ type: 'delta', requestId, text: 'OK' });
      onChunk({ type: 'done', requestId, confidence: 1 });
    });
    const a = mkBackend({ id: 'anthropic', translateImage: imgA });
    const b = mkBackend({ id: 'openai' });
    const deps = baseDeps({
      backends: [b, a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: 'auto',
        anthropicApiKey: 'k',
        openaiApiKey: 'k',
        // Chain holds openai only (no translateImage), so widening must find anthropic.
        backendFallbackChain: ['openai'].map(bid),
        disabledBackends: [],
      }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/ok.png' },
      (c) => chunks.push(c),
    );
    expect(imgA).toHaveBeenCalled();
    expect(chunks.find((c) => c.type === 'done')).toBeTruthy();
  });
});

describe('router — getCustomLanguages error path', () => {
  it('throwing getCustomLanguages does not break handleTranslate for built-in varieties', async () => {
    const warnSpy = vi.fn();
    const a = mkBackend({
      id: 'anthropic',
      emit: [
        { type: 'delta', requestId: '', text: 'x' },
        { type: 'done', requestId: '', confidence: 1 },
      ],
    });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
      }),
      getCustomLanguages: async () => {
        throw new Error('storage unavailable');
      },
      logger: {
        debug() {},
        info() {},
        warn: warnSpy,
        error() {},
      },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(chunks.find((c) => c.type === 'done')).toBeTruthy();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('router — image URL and Content-Type guards (SSRF)', () => {
  it('rejects non-http(s) schemes', async () => {
    const imgSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic', translateImage: imgSpy });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        disabledBackends: [],
      }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'file:///etc/passwd' },
      (c) => chunks.push(c),
    );
    expect(imgSpy).not.toHaveBeenCalled();
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it('rejects AWS metadata endpoint 169.254.169.254', async () => {
    const imgSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic', translateImage: imgSpy });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        disabledBackends: [],
      }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'http://169.254.169.254/latest/meta-data/' },
      (c) => chunks.push(c),
    );
    expect(imgSpy).not.toHaveBeenCalled();
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it('rejects responses whose Content-Type is not image/*', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    );
    const imgSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic', translateImage: imgSpy });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        backend: bid('anthropic'),
        anthropicApiKey: 'k',
        disabledBackends: [],
      }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/page.html' },
      (c) => chunks.push(c),
    );
    expect(imgSpy).not.toHaveBeenCalled();
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });
});
