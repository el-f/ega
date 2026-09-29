import { describe, it, expect } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import { TranslationCache } from '@/background/cache';
import type { TranslationBackend } from '@/shared/backends/base';
import { makeDoneChunk, parseJsonResponse } from '@/shared/backends/base';
import type { TranslationChunk, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkRouter(): ReturnType<typeof createRouter> {
  const backend: TranslationBackend = {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async ({ req, cancel, onChunk }) => {
      if (cancel.signal.aborted) {
        onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'cancelled' });
        return;
      }
      const body = JSON.stringify({ translation: 'ok', confidence: 0.9 });
      onChunk({ type: 'delta', requestId: req.id, text: body });
      onChunk(makeDoneChunk(req.id, parseJsonResponse(body)));
    },
  };
  const deps: RouterDeps = {
    backends: [backend],
    getSettings: async () => ({ ...DEFAULT_SETTINGS, anthropicApiKey: 'k' }),
    cache: new TranslationCache(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };
  return createRouter(deps);
}

const mkReq = (id: string, text: string): TranslationRequest => ({
  id,
  text,
  sourceLang: 'auto',
  targetLang: asLangIdUnsafe('en'),
  options: { stream: false, explain: false },
});

describe('a buffered cancel is dropped when its request ends', () => {
  it('does not abort a later request that reuses the id after a cache-hit run', async () => {
    const router = mkRouter();
    await router.handleTranslate(mkReq('seed', 'marhaba'), () => {});

    // Cancel lands before any controller exists, so it is buffered for the next registration.
    router.cancel('reused');
    // Served from cache: the run returns without ever registering a controller.
    await router.handleTranslate(mkReq('reused', 'marhaba'), () => {});

    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(mkReq('reused', 'a different phrase'), (c) => chunks.push(c));

    expect(chunks.find((c) => c.type === 'done')).toBeDefined();
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });

  it('still cancels the run the buffered id was meant for', async () => {
    const router = mkRouter();
    router.cancel('pending');

    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(mkReq('pending', 'marhaba'), (c) => chunks.push(c));

    const err = chunks.find((c) => c.type === 'error');
    expect(err && 'code' in err ? err.code : undefined).toBe('ABORTED');
  });
});
