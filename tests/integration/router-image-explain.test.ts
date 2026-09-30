import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import type {
  TranslateCallArgs,
  TranslateImageArgs,
  TranslationBackend,
} from '@/shared/backends/base';
import type { Settings, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps as routerDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    ...patch,
  };
}

function baseDeps(patch: Partial<RouterDeps> = {}): RouterDeps {
  return routerDeps({ getSettings: async () => mkSettings(), ...patch });
}

const IMAGE_URL = 'https://i.redd.it/x.png';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array(10), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('handleImageExplain', () => {
  it('sends the image + caption to a vision backend with the EXPLAIN prompt and emits explain', async () => {
    const seenArgs: TranslateImageArgs[] = [];
    const visionBackend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: vi.fn(async (a: TranslateImageArgs) => {
        seenArgs.push(a);
        a.onChunk({
          type: 'delta',
          requestId: a.requestId,
          text: '{"translation":"","confidence":0.4,"explain":"Refers to the Steam Machines tweet shown in the image."}',
        });
        a.onChunk({
          type: 'done',
          requestId: a.requestId,
          confidence: 0.4,
          explain: 'Refers to the Steam Machines tweet shown in the image.',
        });
      }),
    };
    const router = createRouter(baseDeps({ backends: [visionBackend] }));

    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: 'r1', imageUrl: IMAGE_URL, text: 'Literally 1753', targetLang: 'en' },
      (c) => chunks.push(c),
    );

    expect(seenArgs).toHaveLength(1);
    expect(seenArgs[0]?.system).toContain('<role>You are a cultural-subtext analyst');
    expect(seenArgs[0]?.user).toContain('Literally 1753');
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' ? done.explain : undefined).toContain('Steam Machines');
    // Provenance: only the vision path stamps usedImage on the terminal chunk.
    expect(done?.type === 'done' ? done.usedImage : undefined).toBe(true);
  });

  it("uses the explain task's own temperature and token budget, not the translate task's", async () => {
    const seenArgs: TranslateImageArgs[] = [];
    const visionBackend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: vi.fn(async (a: TranslateImageArgs) => {
        seenArgs.push(a);
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 0.4 });
      }),
    };
    const router = createRouter(
      baseDeps({
        backends: [visionBackend],
        getSettings: async () =>
          mkSettings({
            taskTemperatures: { explain: 0.9, translate: 0.1 },
            taskMaxTokens: { explain: 4096, translate: 256 },
          }),
      }),
    );

    await router.handleImageExplain(
      { id: 'r-cfg', imageUrl: IMAGE_URL, text: 'caption', targetLang: 'en' },
      () => {},
    );

    expect(seenArgs[0]?.config.advanced.temperature).toBe(0.9);
    expect(seenArgs[0]?.config.advanced.maxTokens).toBe(4096);
  });

  it("the tooltip explain-with-image gets the explain task's config, like the menu path", async () => {
    const seenArgs: TranslateImageArgs[] = [];
    const visionBackend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: vi.fn(async (a: TranslateImageArgs) => {
        seenArgs.push(a);
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 0.4 });
      }),
    };
    const router = createRouter(
      baseDeps({
        backends: [visionBackend],
        getSettings: async () =>
          mkSettings({
            taskTemperatures: { explain: 0.9, translate: 0.1 },
            taskMaxTokens: { explain: 4096, translate: 256 },
            taskReasoningEfforts: { explain: 'high', translate: 'low' },
          }),
      }),
    );

    // The tooltip sends explain as a flag and never names the task.
    await router.handleTranslate(
      {
        id: 'r-tooltip-cfg',
        text: 'Literally 1753',
        sourceLang: 'auto',
        targetLang: asLangIdUnsafe('en'),
        options: { stream: false, explain: true, imageUrl: IMAGE_URL },
      },
      () => {},
    );

    expect(seenArgs[0]?.config.advanced.temperature).toBe(0.9);
    expect(seenArgs[0]?.config.advanced.maxTokens).toBe(4096);
    expect(seenArgs[0]?.config.advanced.reasoningEffort).toBe('high');
  });

  // Same button, no image on the page: the task must still be explain, or its rules, its
  // backend pin and its audit row all read as a translate.
  it('a tooltip explain with no image still runs as the explain task', async () => {
    const seen: Array<{ temperature?: number; maxTokens?: number }> = [];
    const textBackend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', false),
      isAvailable: async () => true,
      translate: async (a) => {
        seen.push({
          temperature: a.config.advanced.temperature,
          maxTokens: a.config.advanced.maxTokens,
        });
        a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
      },
    };
    const router = createRouter(
      baseDeps({
        backends: [textBackend],
        getSettings: async () =>
          mkSettings({
            taskTemperatures: { explain: 0.9, translate: 0.1 },
            taskMaxTokens: { explain: 4096, translate: 256 },
          }),
      }),
    );

    await router.handleTranslate(
      {
        id: 'r-tooltip-text-explain',
        text: 'Literally 1753',
        sourceLang: 'auto',
        targetLang: asLangIdUnsafe('en'),
        options: { stream: false, explain: true },
      },
      () => {},
    );

    expect(seen[0]?.temperature).toBe(0.9);
    expect(seen[0]?.maxTokens).toBe(4096);
  });

  it('rotates to the next vision backend when the first returns a transient error with no visible delta', async () => {
    const firstTry = vi.fn(async (a: TranslateImageArgs) => {
      // Transient, rotatable error, no delta emitted yet — should fall through.
      a.onChunk({
        type: 'error',
        requestId: a.requestId,
        code: 'RATE_LIMIT',
        message: 'slow down',
      });
    });
    const secondTry = vi.fn(async (a: TranslateImageArgs) => {
      a.onChunk({
        type: 'delta',
        requestId: a.requestId,
        text: '{"translation":"","confidence":0.6,"explain":"second backend explained it"}',
      });
      a.onChunk({
        type: 'done',
        requestId: a.requestId,
        confidence: 0.6,
        explain: 'second backend explained it',
      });
    });
    const visionA: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: firstTry,
    };
    const visionB: TranslationBackend = {
      id: bid('openai'),
      manifest: testManifest('openai', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: secondTry,
    };
    const router = createRouter(
      baseDeps({
        backends: [visionA, visionB],
        getSettings: async () =>
          mkSettings({
            openaiApiKey: 'k2',
            backendOrder: [bid('anthropic'), bid('openai')],
            disabledBackends: [],
            advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 1 },
          }),
      }),
    );

    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: 'r-rotate', imageUrl: IMAGE_URL, text: 'caption', targetLang: 'en' },
      (c) => chunks.push(c),
    );

    expect(firstTry).toHaveBeenCalledOnce();
    expect(secondTry).toHaveBeenCalledOnce();
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' ? done.explain : undefined).toContain('second backend');
    // The first backend's rotatable error must NOT surface as a terminal.
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
  });

  it('synthesizes a terminal TIMEOUT chunk when the backend never emits one before the wallclock fires', async () => {
    const visionBackend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      // Resolves without ever emitting a done/error chunk — the wallclock timer
      // (imageTranslateTimeoutMs) fires first and must synthesize the terminal.
      translateImage: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 50));
      }),
    };
    const router = createRouter(
      baseDeps({
        backends: [visionBackend],
        getSettings: async () => mkSettings({ imageTranslateTimeoutMs: 5 }),
      }),
    );

    const chunks: TranslationChunk[] = [];
    await router.handleImageExplain(
      { id: 'r-timeout', imageUrl: IMAGE_URL, text: 'Literally 1753', targetLang: 'en' },
      (c) => chunks.push(c),
    );

    const terminal = chunks.find((c) => c.type === 'done' || c.type === 'error');
    expect(terminal?.type).toBe('error');
    expect(terminal?.type === 'error' ? terminal.code : undefined).toBe('TIMEOUT');
  });

  it('handleTranslate(explain+imageUrl) falls back to text-only explain when no vision backend is configured', async () => {
    const translate = vi.fn(async (a: TranslateCallArgs) => {
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: '{"translation":"hi","confidence":0.9}',
      });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 0.9 });
    });
    const translateImage = vi.fn();
    const textBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', false),
      isAvailable: async () => true,
      translate,
      // No translateImage — not vision-capable. (manifest.canVision=false also
      // keeps it out of the translateImage chain.)
    } as unknown as TranslationBackend;
    const router = createRouter(baseDeps({ backends: [textBackend] }));

    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'r2',
        text: 'Literally 1753',
        sourceLang: 'auto',
        targetLang: asLangIdUnsafe('en'),
        options: { stream: false, explain: true, imageUrl: IMAGE_URL },
      },
      (c) => chunks.push(c),
    );

    expect(translate).toHaveBeenCalledOnce();
    expect(translateImage).not.toHaveBeenCalled();
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    // Text-only fallback never ran the vision path — the marker must NOT show.
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' ? done.usedImage : undefined).toBeUndefined();
  });
});
