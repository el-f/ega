import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import { makeDoneChunk, type TranslationBackend } from '@/shared/backends/base';
import type { Settings } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function visionBackend(probes: { n: number }): TranslationBackend {
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic', true),
    isAvailable: async () => {
      probes.n += 1;
      return true;
    },
    translate: async ({ req, onChunk }) => {
      onChunk(makeDoneChunk(req.id, { translation: 'TEXT', confidence: 1 }));
    },
    translateImage: async ({ requestId, onChunk }) => {
      onChunk(makeDoneChunk(requestId, { translation: 'OCR', confidence: 1 }));
    },
  } as TranslationBackend;
}

function settings(ttlMs: number): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    advanced: { ...DEFAULT_SETTINGS.advanced, backendProbeTtlMs: ttlMs },
  };
}

describe('backendProbeTtlMs applies on the image path too', () => {
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

  it('re-probes once the configured TTL has passed, with no text translate first', async () => {
    const probes = { n: 0 };
    const deps: RouterDeps = {
      backends: [visionBackend(probes)],
      getSettings: async () => settings(1),
      cache: { get: async () => undefined, set: async () => {} },
      logger: silentLogger,
    };
    const router = createRouter(deps);

    await router.handleImageTranslate({ id: 'p1', imageUrl: PNG }, () => {});
    const afterFirst = probes.n;
    await new Promise((r) => setTimeout(r, 10));
    await router.handleImageTranslate({ id: 'p2', imageUrl: PNG }, () => {});

    expect(afterFirst).toBeGreaterThan(0);
    expect(probes.n).toBeGreaterThan(afterFirst);
  });
});
