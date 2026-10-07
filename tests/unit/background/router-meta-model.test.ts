// The meta line and About name the model that answered, so the router records it on every live reply.
import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import { baseDeps } from '@tests/_helpers/router';
import { makeDoneChunk, type TranslationBackend } from '@/shared/backends/base';
import { TranslationCache } from '@/background/cache';
import type { Settings, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { resolveModelId } from '@/shared/settings-schema';

function backend(): TranslationBackend {
  return {
    id: asBackendIdUnsafe('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      onChunk({ type: 'delta', requestId: req.id, text: JSON.stringify({ translation: 'Hi' }) });
      onChunk(makeDoneChunk(req.id, { translation: 'Hi' }));
    },
  };
}

async function run(s: Settings, cache?: TranslationCache): Promise<TranslationChunk | undefined> {
  const router = createRouter(
    baseDeps({ backends: [backend()], getSettings: async () => s, ...(cache ? { cache } : {}) }),
  );
  const chunks: TranslationChunk[] = [];
  await router.handleTranslate(
    {
      id: `r-${Math.random()}`,
      text: 'hola',
      sourceLang: sel('es'),
      targetLang: sel('en'),
      options: { stream: true, explain: false },
    },
    (c) => chunks.push(c),
  );
  return chunks.find((c) => c.type === 'done');
}

describe('ResultMeta.modelId', () => {
  it('is the model the answering backend runs', async () => {
    const s: Settings = { ...DEFAULT_SETTINGS, cacheEnabled: false };
    const done = await run(s);
    const expected = resolveModelId(s.model, 'anthropic');
    expect(expected).not.toBe('');
    expect(done?.type === 'done' && done.meta?.modelId).toBe(expected);
  });

  it('follows the model picked in Settings', async () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      cacheEnabled: false,
      model: { ...DEFAULT_SETTINGS.model, anthropic: 'claude-sonnet-4-5' },
    };
    const done = await run(s);
    expect(done?.type === 'done' && done.meta?.modelId).toBe('claude-sonnet-4-5');
  });

  it('a cache hit names no model, so the meta line says "Saved answer" instead', async () => {
    const cache = new TranslationCache();
    const s: Settings = { ...DEFAULT_SETTINGS, cacheEnabled: true };
    await run(s, cache);
    const hit = await run(s, cache);
    expect(hit?.type === 'done' && hit.meta?.cacheHit).toBe(true);
    expect(hit?.type === 'done' && hit.meta !== undefined && 'modelId' in hit.meta).toBe(false);
  });
});
