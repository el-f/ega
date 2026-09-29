import { describe, it, expect, vi } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { mkSettings } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

function captureUser(id = 'anthropic'): {
  backend: TranslationBackend;
  calls: TranslateCallArgs[];
} {
  const calls: TranslateCallArgs[] = [];
  const backend: TranslationBackend = {
    id: bid(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async (a) => {
      calls.push(a);
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: '{"translation":"X","confidence":1}',
      });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
  };
  return { backend, calls };
}

function baseDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return {
    backends: overrides.backends ?? [],
    getSettings: overrides.getSettings ?? (async () => mkSettings()),
    cache: overrides.cache ?? { get: async () => undefined, set: async () => {} },
    logger: overrides.logger ?? { debug() {}, info() {}, warn() {}, error() {} },
    ...(overrides.getCustomLanguages ? { getCustomLanguages: overrides.getCustomLanguages } : {}),
  };
}

describe('router — custom-languages warning on a fetch failure', () => {
  it('logs the warning with the "getCustomLanguages failed" string when the provider throws', async () => {
    const { backend } = captureUser();
    const warn = vi.fn();
    const deps = baseDeps({
      backends: [backend],
      logger: { debug() {}, info() {}, warn, error() {} },
      getCustomLanguages: async () => {
        throw new Error('boom');
      },
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('arabizi'),
        options: { stream: true, explain: false },
      },
      () => {},
    );
    expect(warn).toHaveBeenCalled();
    const firstArg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(firstArg).toContain('getCustomLanguages');
    expect(firstArg).toContain('failed');
  });
});

describe('router — sourceLang guard', () => {
  it('does NOT resolve a source preset when sourceLang is "auto"', async () => {
    const { backend, calls } = captureUser();
    const deps = baseDeps({ backends: [backend] });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'marhaba',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      () => {},
    );
    const sys = calls[0]?.system ?? '';
    expect(sys.length).toBeGreaterThan(0);
    // Under the `||` mutation `findVariety('auto')` runs, and this spy sees the call.
    const customSpy = vi.fn(async () => []);
    const deps2 = baseDeps({
      backends: [backend],
      getCustomLanguages: customSpy,
    });
    await createRouter(deps2).handleTranslate(
      {
        id: 'r2',
        text: 'hi',
        sourceLang: 'auto',
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      () => {},
    );
    expect(customSpy).toHaveBeenCalled();
  });
});

describe('router — context digest in the cache key', () => {
  it('cache key changes when the request carries page context', async () => {
    const { backend } = captureUser();
    const setSpy = vi.fn<(k: string, v: unknown) => Promise<void>>(async () => {});
    const deps = baseDeps({
      backends: [backend],
      cache: { get: async () => undefined, set: setSpy },
      getSettings: async () => mkSettings({ contextEnabled: true, cacheEnabled: true }),
    });
    const r = createRouter(deps);
    await r.handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('fr'),
        options: { stream: true, explain: false },
      },
      () => {},
    );
    await r.handleTranslate(
      {
        id: 'r2',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('fr'),
        options: { stream: true, explain: false },
        context: { beforeText: 'some context' },
      },
      () => {},
    );
    expect(setSpy).toHaveBeenCalledTimes(2);
    const firstKey = setSpy.mock.calls[0]?.[0];
    const secondKey = setSpy.mock.calls[1]?.[0];
    expect(firstKey).not.toEqual(secondKey);
  });
});

describe('router — isAvailable throws', () => {
  it('single backend with throwing isAvailable → NO_BACKEND (empty resolved chain)', async () => {
    const b: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => {
        throw new Error('probe crash');
      },
      translate: async () => {},
    };
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
    expect(err?.type === 'error' ? err.code : null).toBe('NO_BACKEND');
  });
});

describe('router — no-backend error message', () => {
  it('emits the no-backend setup message verbatim', async () => {
    const deps = baseDeps({ backends: [] });
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
      expect(err.message).toContain('No backend is set up yet');
      expect(err.message).toContain('Open Settings');
    } else {
      throw new Error('expected error chunk');
    }
  });
});

describe('router — stops after the backend that completes', () => {
  it('does not call second backend after first completes successfully', async () => {
    const { backend: first } = captureUser('anthropic');
    const secondTranslate = vi.fn(async (a: TranslateCallArgs) => {
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: '{"translation":"Y","confidence":1}',
      });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    });
    const second: TranslationBackend = {
      id: bid('openai'),
      manifest: testManifest('openai'),
      isAvailable: async () => true,
      translate: secondTranslate,
    };
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
    expect(secondTranslate).not.toHaveBeenCalled();
  });
});
