// I1-I3: a reply records the system prompt it was sent with, cut at 6,000 characters, and only where it is shown.
import { describe, it, expect, beforeEach } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, cutAtCodePoint } from '@/background/router';
import { baseDeps } from '@tests/_helpers/router';
import { makeDoneChunk, type TranslationBackend } from '@/shared/backends/base';
import { TranslationCache } from '@/background/cache';
import type { Settings, TranslationChunk, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { clearPerfBuffer, getPerfEntries } from '@/shared/perf-history';
import { MAX_INSTRUCTIONS_CHARS } from '@/shared/constants';

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
