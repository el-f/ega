import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import { TranslationCache } from '@/background/cache';
import type { TranslationBackend } from '@/shared/backends/base';
import { makeDoneChunk, parseJsonResponse } from '@/shared/backends/base';
import type { PageContext, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

/** Answers with whatever the prompt contains, so a cross-context cache hit is visible in the result. */
function echoingBackend(calls: { n: number }): TranslationBackend {
  return {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async ({ req, system, user, onChunk }) => {
      calls.n += 1;
      const answer = (system + user).includes('Before: "paragraph two"') ? 'second' : 'first';
      const body = JSON.stringify({ translation: answer, confidence: 0.9 });
      onChunk({ type: 'delta', requestId: req.id, text: body });
      onChunk(makeDoneChunk(req.id, parseJsonResponse(body)));
    },
  };
}

function mkRouter(calls: { n: number }) {
  const deps: RouterDeps = {
    backends: [echoingBackend(calls)],
    getSettings: async () => ({ ...DEFAULT_SETTINGS, anthropicApiKey: 'k' }),
    cache: new TranslationCache(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };
  return createRouter(deps);
}

async function translateWith(
  router: ReturnType<typeof mkRouter>,
  id: string,
  context: PageContext | undefined,
): Promise<string | undefined> {
  const chunks: TranslationChunk[] = [];
  await router.handleTranslate(
    {
      id,
      text: 'ya salam',
      sourceLang: sel('auto'),
      targetLang: sel('en'),
      ...(context ? { context } : {}),
      options: { stream: false, explain: false },
    },
    (c) => chunks.push(c),
  );
  // Both the live and the cache-hit path carry the answer in the delta envelope.
  const body = chunks
    .filter((c) => c.type === 'delta')
    .map((c) => c.text)
    .join('');
  return parseJsonResponse(body).translation;
}

describe('the cache key carries the page context bytes, not a presence flag', () => {
  it('the same phrase in two paragraphs gets two slots', async () => {
    const calls = { n: 0 };
    const router = mkRouter(calls);

    const first = await translateWith(router, 'c1', { beforeText: 'paragraph one' });
    const second = await translateWith(router, 'c2', { beforeText: 'paragraph two' });

    expect(first).toBe('first');
    expect(second).toBe('second');
    expect(calls.n).toBe(2);
  });

  it('the same phrase in the same paragraph still shares one slot', async () => {
    const calls = { n: 0 };
    const router = mkRouter(calls);
    const ctx: PageContext = { pageTitle: 'A page', beforeText: 'paragraph one' };

    const first = await translateWith(router, 'c1', ctx);
    const second = await translateWith(router, 'c2', { ...ctx });

    expect(first).toBe('first');
    expect(second).toBe('first');
    expect(calls.n).toBe(1);
  });

  it('two pages of one site get two slots — the URL is rendered into the prompt', async () => {
    const calls = { n: 0 };
    const router = mkRouter(calls);

    await translateWith(router, 'c1', { pageUrl: 'https://example.com/a' });
    await translateWith(router, 'c2', { pageUrl: 'https://example.com/b' });

    expect(calls.n).toBe(2);
  });

  it('a request with no context keeps its own slot', async () => {
    const calls = { n: 0 };
    const router = mkRouter(calls);

    await translateWith(router, 'c1', { beforeText: 'paragraph one' });
    await translateWith(router, 'c2', undefined);

    expect(calls.n).toBe(2);
  });
});
