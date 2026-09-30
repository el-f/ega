import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import type { TranslationBackend } from '@/shared/backends/base';
import { makeDoneChunk, parseJsonResponse, streamingTranslation } from '@/shared/backends/base';
import { TranslationCache } from '@/background/cache';
import type { Settings, TranslationChunk, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

function fakeBackend(): TranslationBackend {
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      // Emit a single delta + done so the router's `completed` branch fires.
      onChunk({
        type: 'delta',
        requestId: req.id,
        text: JSON.stringify({ translation: 'Welcome', confidence: 0.9 }),
      });
      onChunk(makeDoneChunk(req.id, { translation: 'Welcome', confidence: 0.9 }));
    },
  };
}

function mkSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('router — ResultMeta capture', () => {
  it('attaches ResultMeta to the forwarded done chunk by default', async () => {
    const router = createRouter({
      backends: [fakeBackend()],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    const req: TranslationRequest = {
      id: 'req-m1',
      text: 'salam',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: true, explain: false },
    };
    await router.handleTranslate(req, (c) => chunks.push(c));
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    // Done chunks MUST carry meta by default (captureResultMeta default true).
    if (done?.type === 'done') {
      expect(done.meta).toBeDefined();
      expect(done.meta?.backendId).toBe('anthropic');
      expect(done.meta?.cacheHit).toBe(false);
      expect(typeof done.meta?.latencyMs).toBe('number');
    }
  });

  it('omits meta when captureResultMeta=false', async () => {
    const router = createRouter({
      backends: [fakeBackend()],
      getSettings: async () =>
        mkSettings({
          cacheEnabled: false,
          captureResultMeta: false,
        }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    const req: TranslationRequest = {
      id: 'req-m2',
      text: 'salam',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: true, explain: false },
    };
    await router.handleTranslate(req, (c) => chunks.push(c));
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.meta).toBeUndefined();
    }
  });
});

describe('router — token usage on ResultMeta', () => {
  function usageBackend(): TranslationBackend {
    return {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: JSON.stringify({ translation: 'Welcome', confidence: 0.9 }),
        });
        onChunk(
          makeDoneChunk(
            req.id,
            { translation: 'Welcome', confidence: 0.9 },
            { inputTokens: 120, outputTokens: 42, cacheReadTokens: 80 },
          ),
        );
      },
    };
  }

  it('copies the done chunk usage onto meta when captureResultMeta is on', async () => {
    const router = createRouter({
      backends: [usageBackend()],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    const req: TranslationRequest = {
      id: 'req-usage',
      text: 'salam',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: true, explain: false },
    };
    await router.handleTranslate(req, (c) => chunks.push(c));
    const done = chunks.find((c) => c.type === 'done');
    if (done?.type === 'done') {
      expect(done.meta?.inputTokens).toBe(120);
      expect(done.meta?.outputTokens).toBe(42);
      expect(done.meta?.cacheReadTokens).toBe(80);
    }
  });

  it('leaves token fields absent on a cache hit', async () => {
    const router = createRouter({
      backends: [usageBackend()],
      getSettings: async () => mkSettings({ cacheEnabled: true }),
      cache: {
        get: async () => ({ translation: 'Welcome', confidence: 0.9, ts: Date.now() }),
        set: async () => undefined,
      },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    const req: TranslationRequest = {
      id: 'req-cache-usage',
      text: 'salam',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: true, explain: false },
    };
    await router.handleTranslate(req, (c) => chunks.push(c));
    const done = chunks.find((c) => c.type === 'done');
    if (done?.type === 'done') {
      expect(done.meta?.cacheHit).toBe(true);
      expect(done.meta?.inputTokens).toBeUndefined();
      expect(done.meta?.outputTokens).toBeUndefined();
      expect(done.meta?.cacheReadTokens).toBeUndefined();
    }
  });
});

describe('router — caller request immutability', () => {
  it('does not mutate the caller request options object on explain rewrite', async () => {
    const router = createRouter({
      backends: [fakeBackend()],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const options = { stream: true, explain: false, task: 'explain' as const };
    const req: TranslationRequest = {
      id: 'req-immut',
      text: 'salam',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options,
    };
    const before = req.options;
    await router.handleTranslate(req, () => {});
    expect(req.options).toBe(before);
    expect(req.options.task).toBe('explain');
    expect(req.options.explain).toBe(false);
  });
});

describe('router — wallclock timeout emits exactly one terminal', () => {
  it('does not double-emit TIMEOUT when the backend surfaces ABORTED on abort', async () => {
    // The attempt rewrites ABORTED to TIMEOUT; the router must not add a second TIMEOUT while 'erroring'.
    const abortingBackend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk, cancel }) =>
        new Promise<void>((resolve) => {
          if (cancel.signal.aborted) return resolve();
          cancel.signal.addEventListener(
            'abort',
            () => {
              onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'aborted' });
              resolve();
            },
            { once: true },
          );
        }),
    };
    const router = createRouter({
      backends: [abortingBackend],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      translateTimeoutMs: 10,
    });
    const chunks: TranslationChunk[] = [];
    const req: TranslationRequest = {
      id: 'req-timeout',
      text: 'salam',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: true, explain: false },
    };
    await router.handleTranslate(req, (c) => chunks.push(c));
    const errs = chunks.filter((c) => c.type === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]?.type === 'error' && errs[0].code).toBe('TIMEOUT');
  });
});

describe('router — site-scoped rules split the cache slot', () => {
  function siteRuleSettings(): Settings {
    return mkSettings({
      cacheEnabled: true,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        rules: [
          {
            id: 'r-site',
            body: 'Never use contractions',
            category: 'never',
            scope: { tasks: [], sites: ['example.com'] },
            source: 'manual',
            addedAt: '2026-01-01T00:00:00.000Z',
            enabled: true,
          },
        ],
      },
    });
  }

  it('the same text on two hosts does not share a cached result', async () => {
    let calls = 0;
    const backend: TranslationBackend = {
      ...fakeBackend(),
      translate: async ({ req, onChunk }) => {
        calls += 1;
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: JSON.stringify({ translation: 'Welcome', confidence: 0.9 }),
        });
        onChunk(makeDoneChunk(req.id, { translation: 'Welcome', confidence: 0.9 }));
      },
    };
    const cache = new TranslationCache();
    const router = createRouter({
      backends: [backend],
      getSettings: async () => siteRuleSettings(),
      cache,
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const mkReq = (id: string, pageUrl: string): TranslationRequest => ({
      id,
      text: 'hola',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      context: { pageUrl },
      options: { stream: true, explain: false },
    });

    await router.handleTranslate(mkReq('r1', 'https://example.com/a'), () => {});
    await router.handleTranslate(mkReq('r2', 'https://other.com/a'), () => {});
    expect(calls).toBe(2);

    // Same page, so both the rules block and the rendered PAGE CONTEXT match r1 — this one hits.
    await router.handleTranslate(mkReq('r3', 'https://example.com/a'), () => {});
    expect(calls).toBe(2);
  });
});

describe('router — cache hit renders a `{`-leading translation', () => {
  it('emits the delta as the same JSON envelope the live path produces', async () => {
    const cached = '{"error": "Not found"}';
    const router = createRouter({
      backends: [fakeBackend()],
      getSettings: async () => mkSettings({ cacheEnabled: true }),
      cache: {
        get: async () => ({ translation: cached, confidence: 0.9, ts: Date.now() }),
        set: async () => undefined,
      },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'req-json-hit',
        text: '{"error": "Not found"}',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const rawAcc = chunks
      .filter((c): c is Extract<TranslationChunk, { type: 'delta' }> => c.type === 'delta')
      .map((c) => c.text)
      .join('');
    expect(streamingTranslation(rawAcc, parseJsonResponse(rawAcc))).toBe(cached);
  });
});
