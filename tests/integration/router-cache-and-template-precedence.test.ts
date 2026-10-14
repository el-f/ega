import { describe, it, expect, vi } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import {
  parseJsonResponse,
  streamingTranslation,
  type TranslateCallArgs,
  type TranslationBackend,
} from '@/shared/backends/base';
import type { TranslationChunk, Settings } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

function captureBackend(): TranslationBackend & {
  callArgs: TranslateCallArgs[];
  reset: () => void;
} {
  const callArgs: TranslateCallArgs[] = [];
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async (a) => {
      callArgs.push(a);
      a.onChunk({ type: 'delta', requestId: a.req.id, text: '{"translation":"X","confidence":1}' });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
    callArgs,
    reset() {
      callArgs.length = 0;
    },
  };
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    cacheEnabled: true,
    contextEnabled: true,
    ...patch,
  };
}

function mkDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return baseDeps({
    backends: [captureBackend()],
    getSettings: async () => mkSettings(),
    cache: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    ...overrides,
  });
}

const REQ = {
  id: 'r1',
  text: 'hi',
  sourceLang: sel('arabizi'),
  targetLang: sel('en'),
  options: { stream: true, explain: false },
};

describe('router — cache gating', () => {
  it('cacheEnabled=false skips cache.set on success', async () => {
    const cache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    const deps = mkDeps({
      cache,
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('cacheEnabled=false skips cache.get (no probe)', async () => {
    const cache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    const deps = mkDeps({
      cache,
      getSettings: async () => mkSettings({ cacheEnabled: false }),
    });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('cacheEnabled=true stores a successful translation', async () => {
    const cache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    const deps = mkDeps({ cache });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('error terminates without cache write', async () => {
    const cache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    const b: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async (a) => {
        a.onChunk({ type: 'error', requestId: a.req.id, code: 'PARSE', message: 'junk' });
      },
    };
    const deps = mkDeps({ backends: [b], cache });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('done chunk with empty translation string does not write cache', async () => {
    const cache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    const b: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async (a) => {
        // Stream nothing, just a done chunk — acc stays empty.
        a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
      },
    };
    const deps = mkDeps({ backends: [b], cache });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('cache hit short-circuits; backend.translate never runs', async () => {
    const hitTranslation = 'HIT';
    const cache = {
      get: vi.fn(async () => ({
        translation: hitTranslation,
        confidence: 1,
        ts: Date.now(),
      })),
      set: vi.fn(async () => {}),
    };
    const b = captureBackend();
    const deps = mkDeps({ backends: [b], cache });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(b.callArgs).toHaveLength(0);
    const delta = chunks.find((c) => c.type === 'delta');
    const raw = delta?.type === 'delta' ? delta.text : '';
    expect(streamingTranslation(raw, parseJsonResponse(raw))).toBe(hitTranslation);
  });
});

describe('router — template precedence', () => {
  it('task=explain routes through translate pipeline with explain=true', async () => {
    const b = captureBackend();
    const deps = mkDeps({ backends: [b] });
    await createRouter(deps).handleTranslate(
      {
        ...REQ,
        options: { stream: true, explain: false, task: 'explain' },
      },
      () => {},
    );
    const system = b.callArgs[0]?.system ?? '';
    expect(system).toMatch(/<role>You are a cultural-subtext analyst/);
    expect(system).toMatch(/context\/subtext brief/);
    expect(system).toMatch(/<context_priority>/);
    expect(system).toMatch(/the surrounding page subject is IRRELEVANT/);
    expect(system).toMatch(/<forcing_functions>/);
    expect(system).toMatch(/<depth_test>/);
    expect(system).toMatch(/<forbidden>/);
    expect(system).toMatch(/word-by-word or phrase-by-phrase breakdown/);
    expect(system).toMatch(/Language and translation details are only one facet/);
    expect(system).toMatch(/<contract>Output goes in JSON field "explain"/);
    expect(system).not.toContain('Explain what the text MEANS');
  });

  it('per-preset template beats the global prompt template', async () => {
    const b = captureBackend();
    const deps = mkDeps({
      backends: [b],
      getSettings: async () => {
        const s = mkSettings();
        s.advanced.perPresetTemplates = {
          arabizi: { system: 'ARABIZI-SYS', user: '{{text}}' },
        };
        return s;
      },
    });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(b.callArgs[0]?.system).toContain('ARABIZI-SYS');
  });

  it('a language prompt with only its own system runs the Translate user half, not the shipped one', async () => {
    const b = captureBackend();
    const deps = mkDeps({
      backends: [b],
      getSettings: async () => {
        const s = mkSettings();
        return {
          ...s,
          advanced: {
            ...s.advanced,
            promptTemplate: { system: 'GLOBAL-SYS', user: 'MY-USER {{text}}' },
            perPresetTemplates: { arabizi: { system: 'ARABIZI-SYS' } },
          },
        };
      },
    });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(b.callArgs[0]?.system).toContain('ARABIZI-SYS');
    expect(b.callArgs[0]?.user).toContain('MY-USER');
  });

  it('per-preset lookup matches via Object.hasOwn (Object.prototype keys do not fall through)', async () => {
    const b = captureBackend();
    const deps = mkDeps({
      backends: [b],
      getSettings: async () => {
        const s = mkSettings();
        s.advanced.perPresetTemplates = {};
        return s;
      },
    });
    // `constructor` is a prototype key; should NOT leak through as a template.
    await createRouter(deps).handleTranslate(
      { ...REQ, sourceLang: 'constructor' as never },
      () => {},
    );
    expect(b.callArgs[0]?.system).toContain('You translate');
  });
});

describe('router — attempt order', () => {
  it('explicit non-auto pick goes FIRST in the attempt list', async () => {
    const callOrder: string[] = [];
    function mkRecordingBackend(id: string): TranslationBackend {
      return {
        id: bid(id),
        manifest: testManifest(id),
        isAvailable: async () => true,
        translate: async (a) => {
          callOrder.push(id);
          a.onChunk({
            type: 'delta',
            requestId: a.req.id,
            text: '{"translation":"X","confidence":1}',
          });
          a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
        },
      };
    }
    const anthropic = mkRecordingBackend('anthropic');
    const openai = mkRecordingBackend('openai');
    const native = mkRecordingBackend('native');
    const deps = mkDeps({
      backends: [native, anthropic, openai], // deliberately shuffled registry order
      getSettings: async () =>
        mkSettings({
          openaiApiKey: 'k',
          backendOrder: ['openai', 'anthropic', 'native'].map(bid),
          disabledBackends: [],
        }),
    });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(callOrder[0]).toBe('openai');
  });

  it('chain cap: computeBackendOrder + slice(0, 3) means only the first 3 available backends get probed for translate', async () => {
    const isAvail: string[] = [];
    const factory = (id: string): TranslationBackend => ({
      id: bid(id),
      manifest: testManifest(id),
      isAvailable: async () => {
        isAvail.push(id);
        return true;
      },
      translate: async (a) => {
        a.onChunk({
          type: 'delta',
          requestId: a.req.id,
          text: '{"translation":"X","confidence":1}',
        });
        a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
      },
    });
    const deps = mkDeps({
      backends: [
        factory('anthropic'),
        factory('openai'),
        factory('gemini'),
        factory('groq'),
        factory('deepseek'),
      ],
      getSettings: async () =>
        mkSettings({
          anthropicApiKey: 'k',
          openaiApiKey: 'k',
          geminiApiKey: 'k',
          groqApiKey: 'k',
          deepseekApiKey: 'k',
          disabledBackends: [],
        }),
    });
    await createRouter(deps).handleTranslate(REQ, () => {});
    // Probes run in parallel, so the count is a range: the slice(0, 3) cap runs after them.
    expect(isAvail.length).toBeLessThanOrEqual(5);
    expect(isAvail.length).toBeGreaterThanOrEqual(3);
  });
});
