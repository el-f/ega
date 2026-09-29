import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import { TranslationCache } from '@/background/cache';
import type { TranslationBackend } from '@/shared/backends/base';
import { makeDoneChunk, parseJsonResponse } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

const BODY = JSON.stringify({
  translation: 'what a shame, my friend',
  confidence: 0.9,
  detectedLang: 'arabizi',
  detectedDetail: 'Levantine',
  detectedLangs: [{ id: 'arabizi', detail: 'Levantine' }, { id: 'hebrew-slang' }],
});

function countingBackend(calls: { n: number }): TranslationBackend {
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      calls.n += 1;
      onChunk({ type: 'delta', requestId: req.id, text: BODY });
      onChunk(makeDoneChunk(req.id, parseJsonResponse(BODY)));
    },
  };
}

function mkRouter(calls: { n: number }) {
  const deps: RouterDeps = {
    backends: [countingBackend(calls)],
    getSettings: async () => ({
      ...DEFAULT_SETTINGS,
      backend: bid('anthropic'),
      anthropicApiKey: 'k',
    }),
    cache: new TranslationCache(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };
  return createRouter(deps);
}

describe('a cache hit returns the same result fields as the live run', () => {
  it('keeps the multi-variety detectedLangs cluster on the second request', async () => {
    const calls = { n: 0 };
    const router = mkRouter(calls);

    const run = async (id: string) => {
      const chunks: TranslationChunk[] = [];
      await router.handleTranslate(
        {
          id,
          text: 'kapara aleha ya zalame',
          sourceLang: sel('auto'),
          targetLang: sel('en'),
          options: { stream: true, explain: false },
        },
        (c) => chunks.push(c),
      );
      return chunks.find((c) => c.type === 'done');
    };

    const live = await run('c1');
    expect(live?.detectedLangs).toHaveLength(2);

    const cached = await run('c2');
    expect(calls.n).toBe(1);
    expect(cached?.detectedLang).toBe('arabizi');
    expect(cached?.detectedDetail).toBe('Levantine');
    expect(cached?.detectedLangs).toEqual(live?.detectedLangs);
  });
});
