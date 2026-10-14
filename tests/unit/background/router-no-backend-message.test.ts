import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { TranslationChunk, TranslationRequest } from '@/shared/types';
import type { TranslationBackend } from '@/shared/backends/base';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

// The empty chain is the fresh-profile state.
describe('router — nothing configured yet', () => {
  it('names the page and the action instead of "set up one in options"', async () => {
    const router = createRouter({
      backends: [],
      getSettings: async () => ({ ...DEFAULT_SETTINGS, cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    const req: TranslationRequest = {
      id: 'req-empty-chain',
      text: 'salam',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: true, explain: false },
    };
    await router.handleTranslate(req, (c) => chunks.push(c));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' && err.message).toBe(
      'No backend is set up yet. Open Settings → Backends and add an API key.',
    );
    // Its own code renders the "Setup needed" label, not "Unsupported".
    expect(err?.type === 'error' && err.code).toBe('NO_BACKEND');
  });
});

// The fresh-profile sentence is wrong for the user the README leads with: a local backend that is not running.
describe('router — a configured local backend that does not answer', () => {
  it('names the local backend instead of asking for an API key', async () => {
    const ollama = {
      id: 'ollama',
      manifest: testManifest('ollama', false),
      isAvailable: async () => false,
      translate: async () => {},
    } as unknown as TranslationBackend;
    const router = createRouter({
      backends: [ollama],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        cacheEnabled: false,
        disabledBackends: [],
        backendOrder: [asBackendIdUnsafe('ollama')],
        ollamaUrl: 'http://localhost:11434',
      }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'req-ollama-down',
        text: 'salam',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' && err.message).toBe(
      'No backend answered. Ollama at http://localhost:11434 did not respond — start it, or add an API key in Settings → Backends.',
    );
  });

  it('names a keyed provider that failed its check', async () => {
    const anthropic = {
      id: 'anthropic',
      manifest: { ...testManifest('anthropic', false), name: 'Anthropic' },
      isAvailable: async () => false,
      translate: async () => {},
    } as unknown as TranslationBackend;
    const router = createRouter({
      backends: [anthropic],
      getSettings: async () => ({
        ...DEFAULT_SETTINGS,
        cacheEnabled: false,
        disabledBackends: [],
        backendOrder: [asBackendIdUnsafe('anthropic')],
        anthropicApiKey: 'sk-ant-test',
      }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'req-anthropic-down',
        text: 'salam',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' && err.message).toMatch(
      /^No backend answered\. Anthropic failed the connection check\./,
    );
  });
});

// Native is enabled on a fresh profile, so the empty chain there is "nothing set up", not "your host is down".
describe('router — fresh profile with only the default native backend registered', () => {
  it('keeps the setup message and mentions the host as an option', async () => {
    const native = {
      id: 'native',
      manifest: testManifest('native', true),
      isAvailable: async () => false,
      translate: async () => {},
    } as unknown as TranslationBackend;
    const router = createRouter({
      backends: [native],
      getSettings: async () => ({ ...DEFAULT_SETTINGS, cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'req-fresh-native',
        text: 'salam',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' && err.message).toBe(
      'No backend is set up yet. Open Settings → Backends and add an API key, or install and start the native CLI host.',
    );
  });
});
