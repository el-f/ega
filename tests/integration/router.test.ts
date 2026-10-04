import { describe, it, expect, vi } from 'vitest';
import { preset, sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslationBackend } from '@/shared/backends/base';
import { parseJsonResponse, streamingTranslation } from '@/shared/backends/base';
import type { Settings, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkBackend(
  id: 'anthropic' | 'native' | 'openai',
  emit: TranslationChunk[],
): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      for (const c of emit) onChunk({ ...c, requestId: req.id });
    },
  };
}

describe('router translate flow', () => {
  it('emits delta + done to sender', async () => {
    const backend = mkBackend('anthropic', [
      { type: 'delta', requestId: '', text: 'hello' },
      { type: 'done', requestId: '', confidence: 0.9 },
    ]);
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      cache: {
        get: async () => undefined,
        set: async () => {},
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(chunks.find((c) => c.type === 'delta')?.type).toBe('delta');
    expect(chunks.find((c) => c.type === 'done')?.type).toBe('done');
  });

  it('redacts secrets in page context even when redactContext is off (always-on floor)', async () => {
    let seenUser = '';
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ user, onChunk, req }) => {
        seenUser = user;
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"ok","confidence":1}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
          contextEnabled: true,
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const secret = 'sk-abcDEF0123456789abcDEF01';
    await router.handleTranslate(
      {
        id: 'redact-floor',
        text: 'hola',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: false, explain: false },
        context: { beforeText: `leaked ${secret} here` },
      },
      () => {},
    );
    expect(seenUser).not.toContain(secret);
    expect(seenUser).toContain('[REDACTED]');
  });

  it('returns cache hit without invoking backend', async () => {
    const backend = mkBackend('anthropic', []);
    const translateSpy = vi.spyOn(backend, 'translate');
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      cache: {
        get: async () => ({
          translation: 'CACHED',
          confidence: 1,
          ts: Date.now(),
        }),
        set: async () => {},
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'r2',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(translateSpy).not.toHaveBeenCalled();
    const rawAcc = chunks
      .filter((c): c is Extract<TranslationChunk, { type: 'delta' }> => c.type === 'delta')
      .map((c) => c.text)
      .join('');
    expect(streamingTranslation(rawAcc, parseJsonResponse(rawAcc))).toBe('CACHED');
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('does NOT cache when backend emits error after partial delta', async () => {
    const backend = mkBackend('anthropic', [
      { type: 'delta', requestId: '', text: '{"translation":"hel' },
      { type: 'error', requestId: '', code: 'RATE_LIMIT', message: 'slow down' },
    ]);
    const cacheSet = vi.fn();
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      cache: { get: async () => undefined, set: cacheSet },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'r-err',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(chunks.some((c) => c.type === 'delta')).toBe(true);
    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('uses per-preset prompt template override when set', async () => {
    const seenSystems: string[] = [];
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ system, onChunk, req }) => {
        seenSystems.push(system);
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"x","confidence":1}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
          advanced: {
            ...DEFAULT_SETTINGS.advanced,
            perPresetTemplates: {
              arabizi: { system: 'OVERRIDE_SYS_FOR_ARABIZI', user: '{{text}}' },
            },
          },
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'override1',
        text: 'mar7aba',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      () => {},
    );
    expect(seenSystems[0]).toContain('OVERRIDE_SYS_FOR_ARABIZI');
  });

  it('custom language: lookup goes through getCustomLanguages and drives the prompt', async () => {
    const seenSystems: string[] = [];
    const seenUsers: string[] = [];
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ system, user, onChunk, req }) => {
        seenSystems.push(system);
        seenUsers.push(user);
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"ok","confidence":1}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      getCustomLanguages: async () => [
        {
          id: preset('wow-jargon'),
          label: 'WoW Jargon',
          hint: 'World of Warcraft raid-speak',
          examples: [{ src: 'gank', tgt: 'ambush' }],
          createdAt: 0,
        },
      ],
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'c1',
        text: 'gank mid',
        sourceLang: sel('wow-jargon'),
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      () => {},
    );
    expect(seenSystems[0]).toMatch(/World of Warcraft raid-speak/);
    expect(seenSystems[0]).toMatch(/gank.*ambush/);
    expect(seenSystems[0]).toMatch(/WoW Jargon/);
  });

  it('disabled custom language is NOT in auto-mode candidates', async () => {
    // disabledVarieties is the authoritative mute list — disabledPresets is a legacy shadow copy.
    let seenSystem = '';
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ system, onChunk, req }) => {
        seenSystem = system;
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"x","confidence":1}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
          disabledVarieties: ['wow-jargon'],
        }) satisfies Settings,
      getCustomLanguages: async () => [
        {
          id: preset('wow-jargon'),
          label: 'WoW Jargon',
          hint: 'should not appear as a candidate',
          examples: [],
          createdAt: 0,
        },
        {
          id: preset('startup-bro'),
          label: 'Startup Bro',
          hint: 'should appear as a candidate',
          examples: [],
          createdAt: 0,
        },
      ],
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'cand1',
        text: 'stuff',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      () => {},
    );
    expect(seenSystem).not.toMatch(/wow-jargon/);
    expect(seenSystem).toMatch(/startup-bro/);
  });

  it('cancel-before-register: a cancel that arrives before handleTranslate registers still aborts', async () => {
    let observedAbort = false;
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ cancel, onChunk, req }) => {
        // Read the signal synchronously — the router must abort before it calls us.
        if (cancel.signal.aborted) observedAbort = true;
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    router.cancel('race1');
    await router.handleTranslate(
      {
        id: 'race1',
        text: 'x',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      () => {},
    );
    expect(observedAbort).toBe(true);
  });

  it('translate wall-clock timeout: a backend that never resolves emits TIMEOUT and stops spinning', async () => {
    // Real timers on purpose: fake timers tangle with SubtleCrypto's microtask scheduling in node.
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: ({ cancel }) =>
        new Promise<void>((resolve) => {
          cancel.signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      translateTimeoutMs: 25,
    };
    const router = createRouter(deps);
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'timeout1',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('TIMEOUT');
    }
  });

  it('translateImage wall-clock timeout: a hung image call emits TIMEOUT', async () => {
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: ({ cancel }) =>
        new Promise<void>((resolve) => {
          cancel.signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })) as unknown as typeof fetch;
    try {
      const deps: RouterDeps = {
        backends: [backend],
        getSettings: async () =>
          ({
            ...DEFAULT_SETTINGS,
            anthropicApiKey: 'k',
          }) satisfies Settings,
        cache: { get: async () => undefined, set: async () => {} },
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        imageTranslateTimeoutMs: 25,
      };
      const router = createRouter(deps);
      const chunks: TranslationChunk[] = [];
      await router.handleImageTranslate(
        { id: 'img-timeout', imageUrl: 'https://example.com/x.png' },
        (c) => chunks.push(c),
      );
      const err = chunks.find((c) => c.type === 'error');
      expect(err).toBeDefined();
      if (err?.type === 'error') expect(err.code).toBe('TIMEOUT');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('options.task=summarize routes through buildTaskTemplate, NOT the translate template', async () => {
    let seenSystem = '';
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ system, onChunk, req }) => {
        seenSystem = system;
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"ok","confidence":1}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'tsk-sum',
        text: 'long story about a cat',
        sourceLang: sel('en'),
        targetLang: sel('en'),
        options: { stream: false, explain: false, task: 'summarize' },
      },
      () => {},
    );
    expect(seenSystem).toMatch(/Summarize the text/i);
    // "You translate" only appears if routing fell through to the translate template.
    expect(seenSystem).not.toMatch(/You translate/);
  });

  it('options.task=reword + tone=blunt hands the blunt phrasing to the backend', async () => {
    let seenSystem = '';
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ system, onChunk, req }) => {
        seenSystem = system;
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"ok","confidence":1}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'tsk-reword',
        text: 'please consider revising',
        sourceLang: sel('en'),
        targetLang: sel('en'),
        options: { stream: false, explain: false, task: 'reword', tone: 'blunt' },
      },
      () => {},
    );
    expect(seenSystem).toMatch(/direct and blunt/);
    expect(seenSystem).toMatch(/Rewrite the text/i);
  });

  it('absent options.task defaults to translate', async () => {
    let seenSystem = '';
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ system, onChunk, req }) => {
        seenSystem = system;
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"ok","confidence":1}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'tsk-default',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('fr'),
        options: { stream: false, explain: false },
      },
      () => {},
    );
    expect(seenSystem).toMatch(/You translate/);
    expect(seenSystem).not.toMatch(/Summarize the text/i);
  });

  it('emits backend-unavailable error when no backend matches', async () => {
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => false,
      translate: async () => {},
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () => ({ ...DEFAULT_SETTINGS }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'r3',
        text: 'x',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(chunks.find((c) => c.type === 'error')?.type).toBe('error');
  });

  it('cacheEnabled=false skips cache.get AND cache.set — identical request hits backend twice', async () => {
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ onChunk, req }) => {
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"hello","confidence":1}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const translateSpy = vi.spyOn(backend, 'translate');
    const cacheGet = vi.fn(async () => undefined);
    const cacheSet = vi.fn(async () => {});
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
          cacheEnabled: false,
        }) satisfies Settings,
      cache: { get: cacheGet, set: cacheSet },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const req = {
      text: 'hi',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: false, explain: false },
    };
    await router.handleTranslate({ id: 'a', ...req }, () => {});
    await router.handleTranslate({ id: 'b', ...req }, () => {});
    expect(translateSpy).toHaveBeenCalledTimes(2);
    expect(cacheGet).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('falls through the fallback chain when the explicit backend is unavailable', async () => {
    const unavailable: TranslationBackend = {
      id: bid('legacy-ghost'),
      manifest: testManifest('legacy-ghost'),
      isAvailable: async () => false,
      translate: async () => {
        throw new Error('should not be called');
      },
    };
    let usedNative = false;
    const native: TranslationBackend = {
      id: bid('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async ({ onChunk, req }) => {
        usedNative = true;
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"ok","confidence":1}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [unavailable, native],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          disabledBackends: ['gemini'].map(bid),
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'fallback1',
        text: 'hi',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(usedNative).toBe(true);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    expect(chunks.find((c) => c.type === 'done')?.type).toBe('done');
  });

  it('returns NO_BACKEND only when the entire chain is exhausted', async () => {
    const failing = (id: string): TranslationBackend => ({
      id: bid(id),
      manifest: testManifest(id),
      isAvailable: async () => false,
      translate: async () => {
        throw new Error('never');
      },
    });
    const chunks: TranslationChunk[] = [];
    const deps: RouterDeps = {
      backends: [failing('legacy-ghost'), failing('gemini'), failing('native')],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          disabledBackends: [],
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'fallback2',
        text: 'hi',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('NO_BACKEND');
  });

  it('auto mode widens to registered backends not listed in the chain', async () => {
    let usedNative = false;
    const anthropic: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => false,
      translate: async () => {
        throw new Error('should not be called');
      },
    };
    const openai: TranslationBackend = {
      id: bid('openai'),
      manifest: testManifest('openai'),
      isAvailable: async () => false,
      translate: async () => {
        throw new Error('should not be called');
      },
    };
    const native: TranslationBackend = {
      id: bid('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async ({ onChunk, req }) => {
        usedNative = true;
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"ok","confidence":1}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      // Native is REGISTERED but NOT in the fallback chain.
      backends: [anthropic, openai, native],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          disabledBackends: [],
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'auto-widen',
        text: 'hi',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(usedNative).toBe(true);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });

  it('auto mode widen respects disabledBackends — disabled registered ids are not appended', async () => {
    const anthropic: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => false,
      translate: async () => {
        throw new Error('should not be called');
      },
    };
    let nativeProbed = false;
    const native: TranslationBackend = {
      id: bid('native'),
      manifest: testManifest('native'),
      isAvailable: async () => {
        nativeProbed = true;
        return true;
      },
      translate: async () => {
        throw new Error('should not be called — disabled');
      },
    };
    const chunks: TranslationChunk[] = [];
    const deps: RouterDeps = {
      backends: [anthropic, native],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          disabledBackends: ['native'].map(bid),
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'auto-widen-disabled',
        text: 'hi',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(nativeProbed).toBe(false);
    expect(chunks.find((c) => c.type === 'error')?.type).toBe('error');
  });

  it('respects disabledBackends on the explicit pick: skips it and walks the chain', async () => {
    // Inconsistent state the sanitizer still accepts: the explicit pick is also disabled.
    let usedNative = false;
    const chromeT: TranslationBackend = {
      id: bid('legacy-ghost'),
      manifest: testManifest('legacy-ghost'),
      isAvailable: async () => true,
      translate: async () => {
        throw new Error('should not be called - disabled');
      },
    };
    const native: TranslationBackend = {
      id: bid('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async ({ onChunk, req }) => {
        usedNative = true;
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"ok","confidence":1}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [chromeT, native],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          disabledBackends: ['legacy-ghost'].map(bid),
        }) satisfies Settings,
      cache: { get: async () => undefined, set: async () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    await router.handleTranslate(
      {
        id: 'fallback3',
        text: 'hi',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      () => {},
    );
    expect(usedNative).toBe(true);
  });

  it('image translate falls through past text-only backend at top of order (unbounded walk)', async () => {
    let anthropicImageCalled = false;
    const textOnly = (id: string): TranslationBackend => ({
      id: bid(id),
      manifest: testManifest(id),
      isAvailable: async () => true,
      translate: async () => {},
      // no translateImage
    });
    const anthropic: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        anthropicImageCalled = true;
        onChunk({ type: 'delta', requestId, text: '{"translation":"hi","confidence":1}' });
        onChunk({ type: 'done', requestId, confidence: 1 });
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })) as unknown as typeof fetch;
    try {
      const deps: RouterDeps = {
        backends: [textOnly('groq'), textOnly('native'), textOnly('gemini'), anthropic],
        getSettings: async () =>
          ({
            ...DEFAULT_SETTINGS,
            backendOrder: ['groq', 'native', 'gemini', 'anthropic'].map(bid),
            disabledBackends: [],
          }) satisfies Settings,
        cache: { get: async () => undefined, set: async () => {} },
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      };
      const router = createRouter(deps);
      const chunks: TranslationChunk[] = [];
      await router.handleImageTranslate(
        { id: 'img-fallthrough', imageUrl: 'https://example.com/x.png' },
        (c) => chunks.push(c),
      );
      expect(anthropicImageCalled).toBe(true);
      expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('image translate: first backend NETWORK error falls through to next (chain retry)', async () => {
    let firstCalls = 0;
    let secondCalls = 0;
    const first: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        firstCalls++;
        onChunk({ type: 'error', requestId, code: 'NETWORK', message: 'connect refused' });
      },
    };
    const second: TranslationBackend = {
      id: bid('openai'),
      manifest: testManifest('openai', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        secondCalls++;
        onChunk({ type: 'delta', requestId, text: '{"translation":"ok","confidence":1}' });
        onChunk({ type: 'done', requestId, confidence: 1 });
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })) as unknown as typeof fetch;
    try {
      const deps: RouterDeps = {
        backends: [first, second],
        getSettings: async () =>
          ({
            ...DEFAULT_SETTINGS,
            backendOrder: ['anthropic', 'openai'].map(bid),
            disabledBackends: [],
          }) satisfies Settings,
        cache: { get: async () => undefined, set: async () => {} },
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      };
      const router = createRouter(deps);
      const chunks: TranslationChunk[] = [];
      await router.handleImageTranslate(
        { id: 'img-retry', imageUrl: 'https://example.com/x.png' },
        (c) => chunks.push(c),
      );
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(1);
      const terminals = chunks.filter((c) => c.type === 'done' || c.type === 'error');
      expect(terminals.length).toBe(1);
      expect(terminals[0]?.type).toBe('done');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('image translate: ALL backends NETWORK error → last error surfaces (chain exhausted)', async () => {
    let firstCalls = 0;
    let secondCalls = 0;
    const first: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        firstCalls++;
        onChunk({ type: 'error', requestId, code: 'NETWORK', message: 'first refused' });
      },
    };
    const second: TranslationBackend = {
      id: bid('openai'),
      manifest: testManifest('openai', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        secondCalls++;
        onChunk({ type: 'error', requestId, code: 'NETWORK', message: 'second refused' });
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })) as unknown as typeof fetch;
    try {
      const deps: RouterDeps = {
        backends: [first, second],
        getSettings: async () =>
          ({
            ...DEFAULT_SETTINGS,
            backendOrder: ['anthropic', 'openai'].map(bid),
            disabledBackends: [],
          }) satisfies Settings,
        cache: { get: async () => undefined, set: async () => {} },
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      };
      const router = createRouter(deps);
      const chunks: TranslationChunk[] = [];
      await router.handleImageTranslate(
        { id: 'img-exhaust', imageUrl: 'https://example.com/x.png' },
        (c) => chunks.push(c),
      );
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(1);
      const terminals = chunks.filter((c) => c.type === 'done' || c.type === 'error');
      expect(terminals.length).toBe(1);
      expect(terminals[0]?.type).toBe('error');
      if (terminals[0]?.type === 'error') {
        // The shared attempt summarizes an exhausted chain, the same as the text path.
        expect(terminals[0].message).toBe(
          'second refused\nanthropic: Network issue · openai: Network issue',
        );
      }
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('image translate: AUTH on first attempt rotates to the next backend', async () => {
    // AUTH rotates but never retries the same backend — the next key may work.
    let firstCalls = 0;
    let secondCalls = 0;
    const first: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        firstCalls++;
        onChunk({ type: 'error', requestId, code: 'AUTH', message: 'bad key' });
      },
    };
    const second: TranslationBackend = {
      id: bid('openai'),
      manifest: testManifest('openai', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        secondCalls++;
        onChunk({ type: 'done', requestId, confidence: 1 });
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })) as unknown as typeof fetch;
    try {
      const deps: RouterDeps = {
        backends: [first, second],
        getSettings: async () =>
          ({
            ...DEFAULT_SETTINGS,
            backendOrder: ['anthropic', 'openai'].map(bid),
            disabledBackends: [],
          }) satisfies Settings,
        cache: { get: async () => undefined, set: async () => {} },
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      };
      const router = createRouter(deps);
      const chunks: TranslationChunk[] = [];
      await router.handleImageTranslate(
        { id: 'img-auth', imageUrl: 'https://example.com/x.png' },
        (c) => chunks.push(c),
      );
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(1);
      const terminals = chunks.filter((c) => c.type === 'done' || c.type === 'error');
      expect(terminals.length).toBe(1);
      expect(terminals[0]?.type).toBe('done');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('image translate: REQUEST on first attempt does NOT rotate (same prompt re-fails)', async () => {
    let firstCalls = 0;
    let secondCalls = 0;
    const first: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        firstCalls++;
        onChunk({ type: 'error', requestId, code: 'REQUEST', message: 'bad request' });
      },
    };
    const second: TranslationBackend = {
      id: bid('openai'),
      manifest: testManifest('openai', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ onChunk, requestId }) => {
        secondCalls++;
        onChunk({ type: 'done', requestId, confidence: 1 });
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })) as unknown as typeof fetch;
    try {
      const deps: RouterDeps = {
        backends: [first, second],
        getSettings: async () =>
          ({
            ...DEFAULT_SETTINGS,
            backendOrder: ['anthropic', 'openai'].map(bid),
            disabledBackends: [],
          }) satisfies Settings,
        cache: { get: async () => undefined, set: async () => {} },
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      };
      const router = createRouter(deps);
      const chunks: TranslationChunk[] = [];
      await router.handleImageTranslate(
        { id: 'img-request', imageUrl: 'https://example.com/x.png' },
        (c) => chunks.push(c),
      );
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(0);
      const terminals = chunks.filter((c) => c.type === 'done' || c.type === 'error');
      expect(terminals.length).toBe(1);
      expect(terminals[0]?.type).toBe('error');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('cacheEnabled=true (default) — second identical request hits the cache', async () => {
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ onChunk, req }) => {
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"hello","confidence":1}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const translateSpy = vi.spyOn(backend, 'translate');
    const store = new Map<string, { translation: string; confidence?: number; ts: number }>();
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () =>
        ({
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'k',
          cacheEnabled: true,
        }) satisfies Settings,
      cache: {
        get: async (k) => store.get(k),
        set: async (k, v) => {
          store.set(k, { ...v, ts: Date.now() });
        },
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);
    const req = {
      text: 'hi',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: false, explain: false },
    };
    await router.handleTranslate({ id: 'a', ...req }, () => {});
    await router.handleTranslate({ id: 'b', ...req }, () => {});
    expect(translateSpy).toHaveBeenCalledTimes(1);
  });
});
