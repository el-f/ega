import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import type {
  TranslateCallArgs,
  TranslateImageArgs,
  TranslationBackend,
} from '@/shared/backends/base';
import type { CacheEntry } from '@/background/cache';
import type { ResultMeta, Settings, TranslationChunk, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { readAuditLog } from '@/shared/audit-log';
import { getPerfEntries, clearPerfBuffer } from '@/shared/perf-history';
import type * as PerfHistoryModule from '@/shared/perf-history';
import type * as LoggerModule from '@/shared/logger';
import { baseDeps, mkSettings as mkRouterSettings } from '@tests/_helpers/router';

// Timing assertions pin an exact ms so an operator swap shows up.

const mocks = vi.hoisted(() => ({ perfThrows: false, debugCatch: vi.fn() }));

vi.mock('@/shared/perf-history', async (importOriginal) => {
  const orig = await importOriginal<typeof PerfHistoryModule>();
  return {
    ...orig,
    pushPerfEntry: (meta: ResultMeta) => {
      if (mocks.perfThrows) throw new Error('perf buffer exploded');
      orig.pushPerfEntry(meta);
    },
  };
});

vi.mock('@/shared/logger', async (importOriginal) => {
  const orig = await importOriginal<typeof LoggerModule>();
  return { ...orig, debugCatch: mocks.debugCatch };
});

const bid = (s: string) => asBackendIdUnsafe(s);

function mkBackend(opts: {
  id: string;
  translate?: (a: TranslateCallArgs) => Promise<void>;
  canVision?: boolean;
  translateImage?: TranslationBackend['translateImage'];
}): TranslationBackend {
  const backend: TranslationBackend = {
    id: bid(opts.id),
    manifest: testManifest(opts.id, opts.canVision ?? Boolean(opts.translateImage)),
    isAvailable: async () => true,
    translate:
      opts.translate ??
      (async ({ req, onChunk }) => {
        onChunk({ type: 'delta', requestId: req.id, text: 'OK' });
        onChunk({ type: 'done', requestId: req.id, confidence: 0.9 });
      }),
  };
  if (opts.translateImage) backend.translateImage = opts.translateImage;
  return backend;
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return mkRouterSettings({ openaiApiKey: 'k', geminiApiKey: 'k', ...patch });
}

const REQ: TranslationRequest = {
  id: 'r1',
  text: 'salam',
  sourceLang: sel('arabizi'),
  targetLang: sel('en'),
  options: { stream: true, explain: false },
};

interface Clock {
  perf: number;
  date: number;
}

/** performance.now() and Date.now() read the mutable clock, so a test can step
 *  either axis at an exact point in the router's flow. */
function fakeClock(perf: number, date: number): Clock {
  const c: Clock = { perf, date };
  vi.spyOn(performance, 'now').mockImplementation(() => c.perf);
  vi.spyOn(Date, 'now').mockImplementation(() => c.date);
  return c;
}

async function flushAudit(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

function doneMeta(chunks: TranslationChunk[]): ResultMeta {
  const done = chunks.find((c) => c.type === 'done');
  if (done?.type !== 'done' || !done.meta) throw new Error('no done chunk with meta');
  return done.meta;
}

function errChunk(chunks: TranslationChunk[]): Extract<TranslationChunk, { type: 'error' }> {
  const e = chunks.find((c) => c.type === 'error');
  if (e?.type !== 'error') throw new Error('no error chunk');
  return e;
}

beforeEach(() => {
  clearPerfBuffer();
  mocks.perfThrows = false;
  mocks.debugCatch.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('router — telemetry arithmetic', () => {
  it('audit + ResultMeta carry EXACT latency and firstToken offsets', async () => {
    const clock = fakeClock(1000, 5000);
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk }) => {
        clock.perf = 1040;
        onChunk({ type: 'delta', requestId: req.id, text: 'OK' });
        clock.perf = 1310;
        clock.date = 5250;
        onChunk({ type: 'done', requestId: req.id, confidence: 0.9 });
      },
    });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    await flushAudit();

    const meta = doneMeta(chunks);
    expect(meta.latencyMs).toBe(310);
    expect(meta.firstTokenMs).toBe(40);
    expect(meta.cacheHit).toBe(false);
    expect(meta.backendId).toBe('anthropic');

    const perf = getPerfEntries();
    expect(perf).toHaveLength(1);
    expect(perf[0]?.latencyMs).toBe(310);
    expect(perf[0]?.firstTokenMs).toBe(40);

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.latencyMs).toBe(250);
    expect(log[0]?.firstTokenMs).toBe(40);
  });

  it('perf-persist throw is swallowed and tagged "background.router.1"', async () => {
    mocks.perfThrows = true;
    const a = mkBackend({ id: 'anthropic' });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));

    expect(doneMeta(chunks).cacheHit).toBe(false);
    expect(mocks.debugCatch).toHaveBeenCalledTimes(1);
    expect(mocks.debugCatch.mock.calls[0]?.[1]).toBe('background.router.1');
    expect(mocks.debugCatch.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});

describe('router — token usage on the audit row', () => {
  function usageBackend(): TranslationBackend {
    return mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'delta', requestId: req.id, text: 'OK' });
        onChunk({
          type: 'done',
          requestId: req.id,
          confidence: 0.9,
          usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 5 },
        });
      },
    });
  }

  it.each([true, false])(
    'records the input and output tokens the backend reported (captureResultMeta %s)',
    async (captureResultMeta) => {
      const deps = baseDeps({
        backends: [usageBackend()],
        getSettings: async () => mkSettings({ cacheEnabled: false, captureResultMeta }),
      });
      await createRouter(deps).handleTranslate(REQ, () => {});
      await flushAudit();
      const log = await readAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0]?.inputTokens).toBe(120);
      expect(log[0]?.outputTokens).toBe(30);
    },
  );

  it('leaves the token fields out when the backend reports no usage', async () => {
    const deps = baseDeps({
      backends: [mkBackend({ id: 'anthropic' })],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    await createRouter(deps).handleTranslate(REQ, () => {});
    await flushAudit();
    const log = await readAuditLog();
    expect(log[0]).not.toHaveProperty('inputTokens');
    expect(log[0]).not.toHaveProperty('outputTokens');
  });
});

describe('router — attempts key boundary', () => {
  it('one attempt → `attempts` key is ABSENT from meta', async () => {
    const a = mkBackend({ id: 'anthropic' });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    const meta = doneMeta(chunks);
    expect('attempts' in meta).toBe(false);
  });

  it('two attempts → `attempts` holds BOTH entries in order', async () => {
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'error', requestId: req.id, code: 'RATE_LIMIT', message: '429' });
      },
    });
    const b = mkBackend({ id: 'openai' });
    const deps = baseDeps({
      backends: [a, b],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    const meta = doneMeta(chunks);
    expect(meta.attempts).toHaveLength(2);
    expect(meta.attempts?.[0]?.backendId).toBe('anthropic');
    expect(meta.attempts?.[0]?.status).toBe('error');
    expect(meta.attempts?.[0]?.code).toBe('RATE_LIMIT');
    expect(meta.attempts?.[1]?.backendId).toBe('openai');
    expect(meta.attempts?.[1]?.status).toBe('ok');
  });
});

describe('router — cache-hit envelope', () => {
  const hit: CacheEntry = { translation: 'cached', confidence: 0.77, ts: 0 };

  it('serves the hit: exact delta payload, cacheHit true, empty prompts, no attempts', async () => {
    const clock = fakeClock(1000, 5000);
    const translateSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic' });
    a.translate = translateSpy;
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: true }),
      cache: {
        get: async () => {
          clock.perf = 1090;
          clock.date = 5170;
          return hit;
        },
        set: async () => {},
      },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    await flushAudit();

    expect(translateSpy).not.toHaveBeenCalled();
    const delta = chunks.find((c) => c.type === 'delta');
    expect(delta?.type === 'delta' ? delta.text : null).toBe('cached');

    const meta = doneMeta(chunks);
    expect(meta.cacheHit).toBe(true);
    expect(meta.latencyMs).toBe(90);
    expect('attempts' in meta).toBe(false);
    expect('firstTokenMs' in meta).toBe(false);

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.systemPrompt).toBe('');
    expect(log[0]?.userPrompt).toBe('');
    expect(log[0]?.cacheHit).toBe(true);
    expect(log[0]?.response).toBe('cached');
    expect(log[0]?.confidence).toBe(0.77);
    expect(log[0]?.latencyMs).toBe(170);
    expect(log[0]).not.toHaveProperty('inputTokens');
    expect(log[0]).not.toHaveProperty('outputTokens');
  });

  it('explain wanted + hit WITHOUT explain → treated as a miss, backend runs', async () => {
    const translateSpy = vi.fn(async ({ req, onChunk }: TranslateCallArgs) => {
      onChunk({ type: 'delta', requestId: req.id, text: 'fresh' });
      onChunk({ type: 'done', requestId: req.id, confidence: 0.5 });
    });
    const a = mkBackend({ id: 'anthropic', translate: translateSpy });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: true }),
      cache: { get: async () => hit, set: async () => {} },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      { ...REQ, options: { stream: true, explain: true } },
      (c) => chunks.push(c),
    );
    await flushAudit();

    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(doneMeta(chunks).cacheHit).toBe(false);
    const log = await readAuditLog();
    expect(log[0]?.cacheHit).toBe(false);
  });

  it('explain wanted + hit WITH explain → served from cache, backend never runs', async () => {
    const translateSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic' });
    a.translate = translateSpy;
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: true }),
      cache: { get: async () => ({ ...hit, explain: 'why it lands' }), set: async () => {} },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      { ...REQ, options: { stream: true, explain: true } },
      (c) => chunks.push(c),
    );
    await flushAudit();

    expect(translateSpy).not.toHaveBeenCalled();
    expect(doneMeta(chunks).cacheHit).toBe(true);
    const log = await readAuditLog();
    expect(log[0]?.cacheHit).toBe(true);
  });
});

describe('router — chain trim and no-backend envelope', () => {
  it('retryCount=0 trims a 3-entry chain to 1 — backends 2 and 3 never run', async () => {
    const bSpy = vi.fn();
    const cSpy = vi.fn();
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'error', requestId: req.id, code: 'RATE_LIMIT', message: '429' });
      },
    });
    const b = mkBackend({ id: 'openai' });
    b.translate = bSpy;
    const c = mkBackend({ id: 'gemini' });
    c.translate = cSpy;
    const deps = baseDeps({
      backends: [a, b, c],
      getSettings: async () =>
        mkSettings({
          cacheEnabled: false,
          advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 0 },
        }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (ch) => chunks.push(ch));

    expect(bSpy).not.toHaveBeenCalled();
    expect(cSpy).not.toHaveBeenCalled();
    expect(errChunk(chunks).code).toBe('RATE_LIMIT');
  });

  it('empty chain emits the exact NO_BACKEND envelope in chunk AND audit', async () => {
    const deps = baseDeps({
      backends: [],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    await flushAudit();

    const err = errChunk(chunks);
    expect(err.code).toBe('NO_BACKEND');
    expect(err.message).toBe(
      'No backend is set up yet. Open Settings → Backends and add an API key.',
    );

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.systemPrompt).toBe('');
    expect(log[0]?.userPrompt).toBe('');
    expect(log[0]?.response).toBe('');
    expect(log[0]?.cacheHit).toBe(false);
    expect(log[0]?.error).toEqual({
      code: 'NO_BACKEND',
      message: 'No backend is set up yet. Open Settings → Backends and add an API key.',
    });
  });
});

describe('router — vision-chain gate and explain fork', () => {
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

  const IMG = 'https://example.com/pic.png';

  function visionSpy(): ReturnType<
    typeof vi.fn<NonNullable<TranslationBackend['translateImage']>>
  > {
    return vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        a.onChunk({ type: 'delta', requestId: a.requestId, text: 'IMG' });
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
      },
    );
  }

  it('vision-capable backend takes the image path — text translate never runs', async () => {
    const imgSpy = visionSpy();
    const translateSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic', translateImage: imgSpy });
    a.translate = translateSpy;
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      { ...REQ, options: { stream: true, explain: false, imageUrl: IMG } },
      (c) => chunks.push(c),
    );

    expect(imgSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy).not.toHaveBeenCalled();
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' ? done.usedImage : 'missing').toBeUndefined();
  });

  it('canVision backend WITHOUT translateImage falls through to the text path', async () => {
    const translateSpy = vi.fn(async ({ req, onChunk }: TranslateCallArgs) => {
      onChunk({ type: 'delta', requestId: req.id, text: 'TEXT' });
      onChunk({ type: 'done', requestId: req.id, confidence: 0.4 });
    });
    const a = mkBackend({ id: 'anthropic', canVision: true, translate: translateSpy });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      { ...REQ, options: { stream: true, explain: false, imageUrl: IMG } },
      (c) => chunks.push(c),
    );

    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    expect(doneMeta(chunks).backendId).toBe('anthropic');
  });

  // With no caption the text path had nothing but the "[image]" marker, and answered a translation of it.
  it('an image turn with no text and no vision backend fails instead of translating the marker', async () => {
    const translateSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic', canVision: false, translate: translateSpy });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      { ...REQ, text: '[image]', options: { stream: true, explain: false, imageUrl: IMG } },
      (c) => chunks.push(c),
    );

    expect(translateSpy).not.toHaveBeenCalled();
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : 'none').toBe('UNSUPPORTED');
  });

  it('explain + image routes to handleImageExplain and forwards page context', async () => {
    const imgSpy = visionSpy();
    const a = mkBackend({ id: 'anthropic', translateImage: imgSpy });
    const deps = baseDeps({
      backends: [a],
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      {
        ...REQ,
        context: { pageTitle: 'EGA Sample Page', pageUrl: 'https://example.com/post' },
        options: { stream: true, explain: true, imageUrl: IMG },
      },
      (c) => chunks.push(c),
    );

    expect(imgSpy).toHaveBeenCalledTimes(1);
    const args = imgSpy.mock.calls[0]?.[0];
    if (!args) throw new Error('translateImage never received args');
    const prompt = `${args.system}\n${args.user}`;
    expect(prompt).toContain('PAGE CONTEXT:');
    expect(prompt).toContain('EGA Sample Page');
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' ? done.usedImage : undefined).toBe(true);
  });
});
