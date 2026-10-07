// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boundedChain, createChainResolver } from '@/background/router-chain';
import type { BackendConfig, TranslationBackend } from '@/shared/backends/base';
import { buildBackendConfig } from '@/shared/backends/build-config';
import { resetOllamaModelCapsForTest } from '@/shared/backends/ollama-show';
import { getRegisteredBackendIds, instantiateAll } from '@/shared/backends/registry';
import { computeBackendOrder } from '@/shared/backends/select';
import { asBackendIdUnsafe } from '@/shared/brands';
import { routePlan } from '@/shared/route-plan';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { liveImageAbility } from '@/options/route-state.svelte';
import { clearFetchHandler, setFetchHandler } from '../../mocks/fetch';

const probeCache = {
  probe: (b: TranslationBackend, c: BackendConfig) => b.isAvailable(c),
  clear: () => {},
  setTtl: () => {},
};

beforeEach(() => resetOllamaModelCapsForTest());
afterEach(() => clearFetchHandler());

describe('route plan image row on the Backends tab', () => {
  it('a text-only Ollama model is not first for images, as in the router', async () => {
    // Ollama runs a model /api/show says reads no images; Gemini has a key.
    setFetchHandler((url) =>
      url.endsWith('/api/show')
        ? new Response(JSON.stringify({ capabilities: ['completion'] }), { status: 200 })
        : new Response(JSON.stringify({ models: [] }), { status: 200 }),
    );
    const s = {
      ...DEFAULT_SETTINGS,
      backendOrder: ['ollama', 'gemini'].map(asBackendIdUnsafe),
      disabledBackends: [],
      geminiApiKey: 'k',
      model: { ...DEFAULT_SETTINGS.model, ollama: 'qwen2.5:7b' },
      advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 1 },
    } as Settings;
    const ids = getRegisteredBackendIds();
    const backends = instantiateAll();
    const routerImage = boundedChain(
      await createChainResolver(backends, probeCache)(s, buildBackendConfig(s), 'translateImage'),
      s,
    ).map((b) => b.id)[0];
    expect(routerImage).toBe('gemini');

    const order = computeBackendOrder(s, ids);
    const ready = new Map(order.map((id) => [id, 'ready' as const]));
    let image: ReturnType<typeof liveImageAbility> = () => ({
      inImageChain: false,
      answersImages: false,
    });
    const stop = $effect.root(() => {
      image = liveImageAbility(() => s);
    });
    // Until /api/show answers, Ollama's place in the image chain is not known.
    expect(image(asBackendIdUnsafe('ollama')).inImageChain).toBe('unknown');
    await vi.waitFor(() => expect(image(asBackendIdUnsafe('ollama')).inImageChain).toBe(false));
    const plan = routePlan(order, ready, 1 + s.advanced.retryCount, image);
    expect(plan.firstForImages).toBe(routerImage);
    stop();
  });
});
