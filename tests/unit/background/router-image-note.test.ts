import { describe, it, expect, afterEach, vi } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import { makeDoneChunk } from '@/shared/backends/base';
import type { TranslateImageArgs, TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk, TranslationRequest } from '@/shared/types';
import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { buildOcrPrompt } from '@/shared/ocr-prompt';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function visionBackend(seen: { user?: string; system?: string }): TranslationBackend {
  return {
    id: asBackendIdUnsafe('anthropic'),
    manifest: testManifest('anthropic', true),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      onChunk(makeDoneChunk(req.id, { translation: '', confidence: 0 }));
    },
    translateImage: async (args: TranslateImageArgs) => {
      if (args.user !== undefined) seen.user = args.user;
      if (args.system !== undefined) seen.system = args.system;
      args.onChunk(makeDoneChunk(args.requestId, { translation: 'HELLO', confidence: 0.9 }));
    },
  };
}

function imageRequest(text: string): TranslationRequest {
  return {
    id: `img-${text.length}`,
    text,
    sourceLang: sel('auto'),
    targetLang: sel('en'),
    options: { stream: false, explain: false, imageUrl: 'https://example.com/img.png' },
  };
}

async function runImage(text: string): Promise<{ user?: string; system?: string }> {
  const seen: { user?: string; system?: string } = {};
  const router = createRouter({
    backends: [visionBackend(seen)],
    getSettings: async () => ({ ...DEFAULT_SETTINGS, cacheEnabled: false }),
    cache: { get: async () => undefined, set: async () => undefined },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  });
  const chunks: TranslationChunk[] = [];
  await router.handleTranslate(imageRequest(text), (c) => chunks.push(c));
  return seen;
}

describe('router — notes typed beside an image reach the OCR prompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubImageFetch(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png', 'content-length': '4' }),
        body: null,
        arrayBuffer: async () => PNG_BYTES.buffer,
      } as unknown as Response),
    );
  }

  it('passes the note through as guidance', async () => {
    stubImageFetch();
    const seen = await runImage('only the red sign');
    expect(seen.user).toContain('only the red sign');
    expect(seen.user).toContain('guidance only');
  });

  it('never leaks the placeholder into the prompt', async () => {
    stubImageFetch();
    const seen = await runImage(IMAGE_TURN_PLACEHOLDER);
    expect(seen.user).not.toContain(IMAGE_TURN_PLACEHOLDER);
    expect(seen.user).toBe(buildOcrPrompt('English').user);
  });

  it('keeps the system prompt byte-identical so the prompt cache still hits', async () => {
    stubImageFetch();
    const withNote = await runImage('only the red sign');
    stubImageFetch();
    const without = await runImage(IMAGE_TURN_PLACEHOLDER);
    expect(withNote.system).toBe(without.system);
  });

  it('records 0 earlier messages: the image arm sends the model no history', async () => {
    stubImageFetch();
    const router = createRouter({
      backends: [visionBackend({})],
      getSettings: async () => ({ ...DEFAULT_SETTINGS, cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    const req = imageRequest('note');
    req.options.conversationHistory = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    await router.handleTranslate(req, (c) => chunks.push(c));
    const done = chunks.find((c) => c.type === 'done');
    if (done?.type !== 'done') throw new Error('no done chunk');
    expect(done.meta?.historyTurns).toBe(0);
  });

  it('records no page info for an image read with the OCR prompt, which takes none', async () => {
    stubImageFetch();
    const router = createRouter({
      backends: [visionBackend({})],
      getSettings: async () => ({ ...DEFAULT_SETTINGS, cacheEnabled: false }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    });
    const chunks: TranslationChunk[] = [];
    const req = imageRequest('note');
    req.context = { pageTitle: 'Forum' };
    await router.handleTranslate(req, (c) => chunks.push(c));
    const done = chunks.find((c) => c.type === 'done');
    if (done?.type !== 'done') throw new Error('no done chunk');
    expect(done.meta?.pageContextSent).toBe(false);
  });
});

describe('buildOcrPrompt', () => {
  it('appends the note to the user instruction only', () => {
    const noted = buildOcrPrompt('English', 'only the red sign');
    const plain = buildOcrPrompt('English');
    expect(noted.user).toContain('only the red sign');
    expect(noted.system).toBe(plain.system);
  });

  it('is unchanged with no note', () => {
    expect(buildOcrPrompt('English').user).toBe(buildOcrPrompt('English', undefined).user);
  });

  it('keeps the system prompt free of the note in every target language', () => {
    expect(buildOcrPrompt('French', 'note').system).toBe(buildOcrPrompt('French').system);
  });
});
