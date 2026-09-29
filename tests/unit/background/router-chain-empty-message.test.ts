// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createChainResolver, describeEmptyChain } from '@/background/router-chain';
import type { BackendConfig, TranslationBackend } from '@/shared/backends/base';
import type { Settings } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_OLLAMA_URL } from '@/shared/constants';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { buildBackendConfig } from '@/shared/backends/build-config';
import { instantiateAll } from '@/shared/backends/registry';

function backend(id: string): TranslationBackend {
  return {
    id: asBackendIdUnsafe(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async () => {},
  };
}

function settings(order: string[]): Settings {
  return {
    ...DEFAULT_SETTINGS,
    backendOrder: order.map(asBackendIdUnsafe),
    disabledBackends: [],
  };
}

function config(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return { apiKeys: {}, ...overrides } as BackendConfig;
}

describe('the sentence shown when no backend answered', () => {
  it('names the configured Ollama URL', () => {
    const msg = describeEmptyChain(
      settings(['ollama']),
      'translate',
      config({ ollamaUrl: 'http://box.local:11434' } as Partial<BackendConfig>),
      [backend('ollama')],
    );

    expect(msg).toContain('http://box.local:11434');
    expect(msg).not.toContain(DEFAULT_OLLAMA_URL);
  });

  it('falls back to the default URL when none is configured', () => {
    const msg = describeEmptyChain(settings(['ollama']), 'translate', config(), [
      backend('ollama'),
    ]);

    expect(msg).toContain(DEFAULT_OLLAMA_URL);
  });

  it('adds the local half only when a local backend was in the chain', () => {
    const backends = [backend('anthropic'), backend('ollama')];

    const withLocal = describeEmptyChain(
      settings(['anthropic', 'ollama']),
      'translate',
      config({ apiKeys: { anthropic: 'sk-x' } } as Partial<BackendConfig>),
      backends,
    );
    const keyedOnly = describeEmptyChain(
      settings(['anthropic']),
      'translate',
      config({ apiKeys: { anthropic: 'sk-x' } } as Partial<BackendConfig>),
      backends,
    );

    expect(withLocal).toContain('did not respond');
    expect(keyedOnly).not.toContain('did not respond');
    expect(keyedOnly).toContain('failed the connection check');
  });

  it('names a backend that has a key but is turned off, on a fresh profile', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, openaiApiKey: 'sk-x' };

    const msg = describeEmptyChain(s, 'translate', buildBackendConfig(s), instantiateAll());

    expect(msg).toBe(
      'OpenAI has an API key but is turned off. Press Enable on its card in Settings → Backends, or install and start the native CLI host.',
    );
  });

  it('names the turned-off keyed backend when no local backend is in the chain either', () => {
    const s: Settings = {
      ...settings(['anthropic']),
      disabledBackends: [asBackendIdUnsafe('gemini')],
    };

    const msg = describeEmptyChain(
      s,
      'translate',
      config({ apiKeys: { gemini: 'g-key' } } as Partial<BackendConfig>),
      [backend('anthropic'), backend('gemini')],
    );

    expect(msg).toBe(
      'Test gemini has an API key but is turned off. Press Enable on its card in Settings → Backends.',
    );
  });
});

describe('a probe that throws', () => {
  it('drops that backend instead of rejecting the whole wave', async () => {
    const good = backend('anthropic');
    const bad = backend('ollama');
    const resolve = createChainResolver([bad, good], {
      probe: async (b) => {
        if (b.id === bad.id) throw new Error('socket closed');
        return true;
      },
      clear: () => {},
      setTtl: () => {},
    });

    const out = await resolve(
      settings(['ollama', 'anthropic']),
      'translate',
      config(),
      'translate',
    );

    expect(out.map((b) => String(b.id))).toEqual(['anthropic']);
  });
});
