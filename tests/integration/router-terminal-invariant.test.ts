import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

const okSettings = () => ({
  ...DEFAULT_SETTINGS,
  backend: bid('anthropic'),
  anthropicApiKey: 'k',
});

function terminals(chunks: TranslationChunk[]): TranslationChunk[] {
  return chunks.filter((c) => c.type === 'done' || c.type === 'error');
}

describe('every translate ends with exactly one terminal chunk', () => {
  it('emits a terminal when the cache read rejects', async () => {
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () => okSettings(),
      cache: {
        get: async () => {
          throw new Error('storage read blew up');
        },
        set: async () => {},
      },
      logger: silentLogger,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      {
        id: 'cache-boom',
        text: 'hi',
        sourceLang: sel('auto'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(terminals(chunks)).toHaveLength(1);
    expect(terminals(chunks)[0]?.type).toBe('error');
  });

  it('emits a terminal when settings cannot be read', async () => {
    const deps: RouterDeps = {
      backends: [],
      getSettings: async () => {
        throw new Error('settings unavailable');
      },
      cache: { get: async () => undefined, set: async () => {} },
      logger: silentLogger,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      {
        id: 'settings-boom',
        text: 'hi',
        sourceLang: sel('auto'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    expect(terminals(chunks)).toHaveLength(1);
    expect(terminals(chunks)[0]?.type).toBe('error');
  });

  it('drops backend chunks that arrive after the terminal', async () => {
    let late: ((c: TranslationChunk) => void) | undefined;
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        late = onChunk;
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () => okSettings(),
      cache: { get: async () => undefined, set: async () => {} },
      logger: silentLogger,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(
      {
        id: 'late-chunk',
        text: 'hi',
        sourceLang: sel('auto'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    late?.({ type: 'delta', requestId: 'late-chunk', text: 'zombie' });
    late?.({ type: 'done', requestId: 'late-chunk', confidence: 1 });

    expect(terminals(chunks)).toHaveLength(1);
    expect(chunks.some((c) => c.type === 'delta' && c.text === 'zombie')).toBe(false);
  });

  it('emits a terminal when the image path throws before any chunk', async () => {
    const deps: RouterDeps = {
      backends: [],
      getSettings: async () => {
        throw new Error('settings unavailable');
      },
      cache: { get: async () => undefined, set: async () => {} },
      logger: silentLogger,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-boom', imageUrl: 'https://example.com/a.png' },
      (c) => chunks.push(c),
    );
    expect(terminals(chunks)).toHaveLength(1);
    expect(terminals(chunks)[0]?.type).toBe('error');
  });

  it('emits a terminal when the image-explain path throws before any chunk', async () => {
    const deps: RouterDeps = {
      backends: [],
      getSettings: async () => {
        throw new Error('settings unavailable');
      },
      cache: { get: async () => undefined, set: async () => {} },
      logger: silentLogger,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageExplain(
      { id: 'img-explain-boom', imageUrl: 'https://example.com/a.png' },
      (c) => chunks.push(c),
    );
    expect(terminals(chunks)).toHaveLength(1);
    expect(terminals(chunks)[0]?.type).toBe('error');
  });
});
