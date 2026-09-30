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
import { baseDeps as routerDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

// Tooltip Explain sends no task, so both requests carry task 'translate' and differ only by the flag.
function explainAwareBackend(calls: string[]): TranslationBackend {
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      const wantsExplain = Boolean(req.options.explain);
      calls.push(wantsExplain ? 'explain' : 'plain');
      const body = wantsExplain
        ? { translation: 'a curse meaning roughly "what a shame"', explain: 'CULTURAL BRIEF' }
        : { translation: 'what a shame' };
      const text = JSON.stringify(body);
      onChunk({ type: 'delta', requestId: req.id, text });
      onChunk(makeDoneChunk(req.id, parseJsonResponse(text)));
    },
  };
}

function mkDeps(cache: TranslationCache, backend: TranslationBackend): RouterDeps {
  return routerDeps({
    backends: [backend],
    getSettings: async () => ({
      ...DEFAULT_SETTINGS,
      backend: bid('anthropic'),
      anthropicApiKey: 'k',
    }),
    cache,
  });
}

const TEXT = 'kapara aleha';

function request(id: string, explain: boolean) {
  return {
    id,
    text: TEXT,
    sourceLang: sel('arabizi'),
    targetLang: sel('en'),
    options: { stream: true, explain },
  };
}

describe('explain and plain translate do not share a cache slot', () => {
  it('a plain re-translate after an Explain is not served the explain result', async () => {
    const calls: string[] = [];
    const router = createRouter(mkDeps(new TranslationCache(), explainAwareBackend(calls)));

    const run = async (id: string, explain: boolean) => {
      const chunks: TranslationChunk[] = [];
      await router.handleTranslate(request(id, explain), (c) => chunks.push(c));
      const deltas = chunks.filter((c) => c.type === 'delta').map((c) => c.text);
      return { done: chunks.find((c) => c.type === 'done'), body: deltas.join('') };
    };

    await run('r1', false);
    const explained = await run('r2', true);
    expect(explained.done?.explain).toBe('CULTURAL BRIEF');

    // Same text, same task, explain off — the user never asked for a cultural brief.
    const plainAgain = await run('r3', false);
    expect(plainAgain.done?.explain).toBeUndefined();
    expect(plainAgain.body).not.toContain('curse');
    expect(plainAgain.body).toContain('what a shame');
  });

  it('a repeated Explain still hits the cache', async () => {
    const calls: string[] = [];
    const router = createRouter(mkDeps(new TranslationCache(), explainAwareBackend(calls)));

    const run = async (id: string, explain: boolean) => {
      const chunks: TranslationChunk[] = [];
      await router.handleTranslate(request(id, explain), (c) => chunks.push(c));
      return chunks.find((c) => c.type === 'done');
    };

    await run('e1', true);
    const second = await run('e2', true);
    expect(second?.explain).toBe('CULTURAL BRIEF');
    expect(calls).toEqual(['explain']);
  });
});
