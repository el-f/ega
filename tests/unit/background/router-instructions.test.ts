// I1-I3: a reply records the system prompt it was sent with, cut at 6,000 characters, and only where it is shown.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, cutAtCodePoint } from '@/background/router';
import { baseDeps } from '@tests/_helpers/router';
import {
  makeDoneChunk,
  type TranslateImageArgs,
  type TranslationBackend,
} from '@/shared/backends/base';
import { TranslationCache } from '@/background/cache';
import type { Settings, TranslationChunk, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { clearPerfBuffer, getPerfEntries } from '@/shared/perf-history';
import { MAX_INSTRUCTIONS_CHARS } from '@/shared/reply-instructions';

const sent: string[] = [];

function recordingBackend(): TranslationBackend {
  return {
    id: asBackendIdUnsafe('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async ({ req, system, onChunk }) => {
      sent.push(system);
      onChunk({ type: 'delta', requestId: req.id, text: JSON.stringify({ translation: 'Hi' }) });
      onChunk(makeDoneChunk(req.id, { translation: 'Hi' }));
    },
  };
}

function settings(over: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, cacheEnabled: false, ...over };
}

/** A source-language prompt this long goes out whole and is cut only for the record. */
const longPrompt = (n: number): Partial<Settings> => ({
  advanced: {
    ...DEFAULT_SETTINGS.advanced,
    perPresetTemplates: { arabizi: { system: 'S'.repeat(n) } },
  },
});

async function run(
  s: Settings,
  opts: Partial<TranslationRequest['options']> = {},
  cache?: TranslationCache,
): Promise<TranslationChunk | undefined> {
  const router = createRouter(
    baseDeps({
      backends: [recordingBackend()],
      getSettings: async () => s,
      ...(cache ? { cache } : {}),
    }),
  );
  const chunks: TranslationChunk[] = [];
  await router.handleTranslate(
    {
      id: `r-${Math.random()}`,
      text: 'salam',
      sourceLang: sel('arabizi'),
      targetLang: sel('en'),
      options: { stream: true, explain: false, ...opts },
    },
    (c) => chunks.push(c),
  );
  return chunks.find((c) => c.type === 'done');
}

beforeEach(() => {
  sent.length = 0;
  clearPerfBuffer();
});

describe('ResultMeta.instructions', () => {
  it('is the system prompt the backend got, with no length when it fits (I1)', async () => {
    const done = await run(settings());
    expect(done?.type === 'done' && done.meta?.instructions).toBe(sent[0]);
    expect(sent[0]?.length).toBeGreaterThan(0);
    expect(done?.type === 'done' && 'instructionsLength' in (done.meta ?? {})).toBe(false);
  });

  it('is cut at 6,000 characters and keeps the full length (I1)', async () => {
    const done = await run(settings(longPrompt(9000)));
    const meta = done?.type === 'done' ? done.meta : undefined;
    expect(sent[0]?.length).toBeGreaterThan(MAX_INSTRUCTIONS_CHARS);
    expect(meta?.instructions).toBe(sent[0]?.slice(0, MAX_INSTRUCTIONS_CHARS));
    expect(meta?.instructionsLength).toBe(sent[0]?.length);
  });

  it('a cache hit carries the prompt its answer was made with (I2)', async () => {
    const cache = new TranslationCache();
    const s = settings({ cacheEnabled: true });
    await run(s, {}, cache);
    const hit = await run(s, {}, cache);
    expect(sent).toHaveLength(1);
    expect(hit?.type === 'done' && hit.meta?.cacheHit).toBe(true);
    expect(hit?.type === 'done' && hit.meta?.instructions).toBe(sent[0]);
  });

  it('page blocks and a switched-off record carry none (I2)', async () => {
    const batch = await run(settings(), { batch: true });
    expect(batch?.type === 'done' && batch.meta?.instructions).toBeUndefined();
    const off = await run(settings({ captureResultMeta: false }));
    expect(off?.type === 'done' && off.meta).toBeUndefined();
  });

  it('an image request records the system prompt the vision call got, not the text prompt (I2)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png', 'content-length': '4' }),
        body: null,
        arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
      } as unknown as Response),
    );
    const seen: { system?: string } = {};
    const vision: TranslationBackend = {
      ...recordingBackend(),
      manifest: testManifest('anthropic', true),
      translateImage: async (args: TranslateImageArgs) => {
        if (args.system !== undefined) seen.system = args.system;
        args.onChunk({
          type: 'delta',
          requestId: args.requestId,
          text: '{"translation":"HELLO","confidence":0.9}',
        });
        args.onChunk(makeDoneChunk(args.requestId, { translation: 'HELLO', confidence: 0.9 }));
      },
    };
    const router = createRouter(
      baseDeps({ backends: [vision], getSettings: async () => settings() }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'img-1',
        text: 'salam',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: false, explain: false, imageUrl: 'https://example.com/img.png' },
      },
      (c) => chunks.push(c),
    );
    vi.unstubAllGlobals();
    const done = chunks.find((c) => c.type === 'done');
    const textSystem = (await run(settings())) && sent.at(-1);

    expect(seen.system).toBeTruthy();
    expect(done?.type === 'done' && done.meta?.instructions).toBe(seen.system);
    expect(seen.system).not.toBe(textSystem);
  });

  it('never reaches the performance buffer (I3)', async () => {
    await run(settings(longPrompt(7000)));
    expect(getPerfEntries().length).toBeGreaterThan(0);
    expect(getPerfEntries().some((e) => 'instructions' in e)).toBe(false);
  });
});

describe('cutAtCodePoint', () => {
  it('never ends inside a surrogate pair', () => {
    expect(cutAtCodePoint('ab😀cd', 3)).toBe('ab');
    expect(cutAtCodePoint('ab😀cd', 4)).toBe('ab😀');
    expect(cutAtCodePoint('abc', 10)).toBe('abc');
  });
});
