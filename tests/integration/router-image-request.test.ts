import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sel, preset as presetId } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import { makeDoneChunk, type BackendConfig, type TranslationBackend } from '@/shared/backends/base';
import type { Settings, TranslationChunk, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

/** An attached image must reach the vision path, and never the text cache, whose key cannot tell images apart. */
function visionBackend(): TranslationBackend & { ocrPrompts: string[] } {
  const ocrPrompts: string[] = [];
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic', true),
    isAvailable: async () => true,
    ocrPrompts,
    translate: async ({ req, onChunk }) => {
      onChunk({ type: 'delta', requestId: req.id, text: JSON.stringify({ translation: 'TEXT' }) });
      onChunk(makeDoneChunk(req.id, { translation: 'TEXT', confidence: 1 }));
    },
    translateImage: async ({ requestId, system, onChunk }) => {
      ocrPrompts.push(system ?? '');
      onChunk({ type: 'delta', requestId, text: JSON.stringify({ translation: 'OCR' }) });
      onChunk(makeDoneChunk(requestId, { translation: 'OCR', confidence: 1 }));
    },
  } as TranslationBackend & { ocrPrompts: string[] };
}

function imageReq(id: string): TranslationRequest {
  return {
    id,
    text: '[image]',
    sourceLang: sel('auto'),
    targetLang: sel('en'),
    options: { stream: true, explain: false, imageUrl: PNG },
  };
}

function settings(): Settings {
  return { ...DEFAULT_SETTINGS, cacheEnabled: true };
}

describe('router — translate:start carrying an image', () => {
  // The SW fetches a data: URL natively; the test env has no fetch handler.
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes to the vision path instead of translating the placeholder text', async () => {
    const b = visionBackend();
    const chunks: TranslationChunk[] = [];
    const router = createRouter({
      backends: [b],
      getSettings: async () => settings(),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });

    await router.handleTranslate(imageReq('img-1'), (c) => chunks.push(c));

    expect(b.ocrPrompts).toHaveLength(1);
    const delta = chunks.find((c) => c.type === 'delta');
    expect(delta?.type === 'delta' ? delta.text : '').toContain('OCR');
  });

  it('builds the OCR prompt for the picker language, not defaultTargetLang', async () => {
    const b = visionBackend();
    const router = createRouter({
      backends: [b],
      getSettings: async () => settings(),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });

    await router.handleTranslate({ ...imageReq('img-fr'), targetLang: sel('fr') }, () => {});

    // The label, never the bare id: "translate it to fr" reads as a code to the model.
    expect(b.ocrPrompts[0]).toContain('translate it to French');
  });

  it('names a custom language by its own label in the OCR prompt', async () => {
    const b = visionBackend();
    const router = createRouter({
      backends: [b],
      getSettings: async () => settings(),
      getCustomLanguages: async () => [
        { id: presetId('zztgt'), label: 'ZZ Target Label', hint: 'h', examples: [], createdAt: 1 },
      ],
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });

    await router.handleTranslate({ ...imageReq('img-zz'), targetLang: sel('zztgt') }, () => {});

    expect(b.ocrPrompts[0]).toContain('translate it to ZZ Target Label');
  });

  it('ignores a carried-over image on a non-translate task', async () => {
    const b = visionBackend();
    const chunks: TranslationChunk[] = [];
    const router = createRouter({
      backends: [b],
      getSettings: async () => ({ ...settings(), cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });

    const req = imageReq('img-sum');
    await router.handleTranslate(
      { ...req, text: 'hola', options: { ...req.options, task: 'summarize' } },
      (c) => chunks.push(c),
    );

    expect(b.ocrPrompts).toEqual([]);
    const delta = chunks.find((c) => c.type === 'delta');
    expect(delta?.type === 'delta' ? delta.text : '').toContain('TEXT');
  });

  it("uses the translate task's own reasoning effort on the OCR call", async () => {
    const configs: BackendConfig[] = [];
    const b: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic', true),
      isAvailable: async () => true,
      translate: async () => {},
      translateImage: async ({ requestId, config, onChunk }) => {
        configs.push(config);
        onChunk(makeDoneChunk(requestId, { translation: 'OCR', confidence: 1 }));
      },
    };
    const router = createRouter({
      backends: [b],
      getSettings: async () => ({
        ...settings(),
        cacheEnabled: false,
        taskOverrides: {
          translate: { effort: 'high' as const },
          explain: { effort: 'low' as const },
        },
      }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });

    await router.handleTranslate(imageReq('img-cfg'), () => {});

    expect(configs[0]?.advanced.effort).toBe('high');
  });

  it('never reads or writes the text cache — two images share the placeholder key', async () => {
    const b = visionBackend();
    const cache = { get: vi.fn(async () => undefined), set: vi.fn(async () => undefined) };
    const router = createRouter({
      backends: [b],
      getSettings: async () => settings(),
      cache,
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });

    await router.handleTranslate(imageReq('img-2'), () => {});

    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('falls back to the text path when no backend can do vision', async () => {
    const b: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: JSON.stringify({ translation: 'TEXT' }),
        });
        onChunk(makeDoneChunk(req.id, { translation: 'TEXT', confidence: 1 }));
      },
    };
    const chunks: TranslationChunk[] = [];
    const router = createRouter({
      backends: [b],
      getSettings: async () => ({ ...settings(), cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });

    // A caption gives the text path something real to translate; with none the router refuses.
    await router.handleTranslate({ ...imageReq('img-3'), text: 'look at this' }, (c) =>
      chunks.push(c),
    );

    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });
});
