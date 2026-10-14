import { readBackendAnswer } from '@tests/_helpers/backend';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GeminiBackend } from '@/shared/backends/gemini';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, '..', '..', 'fixtures', 'gemini-stream.txt'), 'utf8');

const baseConfig = {
  apiKeys: { gemini: 'test-key' },
  model: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-1.5-flash',
    groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-chat',
    together: '',
    mistral: '',
    xai: '',
    fireworks: '',
    openrouter: '',
    ollama: 'llama3.2',
    localserver: '',
    native: '',
  },
  advanced: {
    promptTemplate: { system: 's', user: 'u' },
    perPresetTemplates: {},
    temperature: 0.2,
    maxTokens: 1024,
  },
};

const mkArgs = (over: Partial<TranslateCallArgs> = {}): TranslateCallArgs => ({
  req: {
    id: 'r1',
    text: 'hi',
    sourceLang: sel('arabizi'),
    targetLang: sel('en'),
    options: { stream: true, explain: false },
  },
  system: 'SYS',
  user: 'USER',
  stream: true,
  cancel: noopCancel(),
  onChunk: () => {},
  config: baseConfig,
  ...over,
});

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('GeminiBackend', () => {
  it('isAvailable true with key, false without', async () => {
    const b = new GeminiBackend();
    expect(await b.isAvailable(baseConfig)).toBe(true);
    expect(await b.isAvailable({ ...baseConfig, apiKeys: {} })).toBe(false);
  });

  it('concatenates ALL text-bearing parts in a multi-part SSE frame', async () => {
    // Synthetic Gemini SSE frame with two text parts in one candidate.
    const multipart = [
      `data: ${JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: 'first ' }, { text: 'second' }],
            },
          },
        ],
      })}`,
      '',
      `data: ${JSON.stringify({
        candidates: [{ content: { parts: [{ text: ' tail' }] }, finishReason: 'STOP' }],
      })}`,
      '',
      '',
    ].join('\n');
    setFetchHandler(async () => sseResponse(multipart));
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const combined = chunks
      .filter((c) => c.type === 'delta')
      .map((c) => c.text)
      .join('');
    expect(combined).toBe('first second tail');
  });

  it('parses captured SSE fixture into deltas + done with raw answer text', async () => {
    setFetchHandler(async () => sseResponse(FIXTURE));
    const chunks: TranslationChunk[] = [];
    const b = new GeminiBackend();
    await b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));

    const deltas = chunks.filter((c) => c.type === 'delta');
    const done = chunks.find((c) => c.type === 'done');
    expect(deltas.length).toBeGreaterThan(0);
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(readBackendAnswer(chunks)['confidence']).toBeCloseTo(0.82, 2);
      expect(readBackendAnswer(chunks)['detectedLang']).toBe('arabizi');
    }
  });

  it('hits the streamGenerateContent endpoint with alt=sse and sends the key in the x-goog-api-key header (not the URL)', async () => {
    let hitUrl = '';
    let hitHeaders: Record<string, string> = {};
    setFetchHandler(async (url, init) => {
      hitUrl = url;
      const h = init?.headers ?? {};
      if (h instanceof Headers) {
        hitHeaders = Object.fromEntries(h.entries());
      } else if (Array.isArray(h)) {
        hitHeaders = Object.fromEntries(h);
      } else {
        hitHeaders = { ...(h as Record<string, string>) };
      }
      return sseResponse(FIXTURE);
    });
    await new GeminiBackend().translate(mkArgs());
    expect(hitUrl).toContain('generativelanguage.googleapis.com');
    expect(hitUrl).toContain(':streamGenerateContent');
    expect(hitUrl).toContain('alt=sse');
    // The API key must not appear in the URL (DevTools Network panel,
    // crash dumps, proxy URL logs) — it belongs in the header.
    expect(hitUrl).not.toContain('key=');
    expect(hitUrl).not.toContain('test-key');
    const headerKey =
      hitHeaders['x-goog-api-key'] ?? hitHeaders['X-Goog-Api-Key'] ?? hitHeaders['X-goog-api-key'];
    expect(headerKey).toBe('test-key');
  });

  it('translateImage also sends the key in the x-goog-api-key header', async () => {
    let hitUrl = '';
    let hitHeaders: Record<string, string> = {};
    setFetchHandler(async (url, init) => {
      hitUrl = url;
      const h = init?.headers ?? {};
      if (h instanceof Headers) {
        hitHeaders = Object.fromEntries(h.entries());
      } else if (Array.isArray(h)) {
        hitHeaders = Object.fromEntries(h);
      } else {
        hitHeaders = { ...(h as Record<string, string>) };
      }
      return sseResponse(FIXTURE);
    });
    await new GeminiBackend().translateImage({
      requestId: 'img-1',
      imageBase64: 'aGVsbG8=',
      mediaType: 'image/png',
      cancel: noopCancel(),
      onChunk: () => {},
      config: baseConfig,
    });
    expect(hitUrl).not.toContain('key=');
    expect(hitUrl).not.toContain('test-key');
    const headerKey =
      hitHeaders['x-goog-api-key'] ?? hitHeaders['X-Goog-Api-Key'] ?? hitHeaders['X-goog-api-key'];
    expect(headerKey).toBe('test-key');
  });

  it('maps 401/403 to AUTH and 429 to RATE_LIMIT', async () => {
    setFetchHandler(async () => new Response('bad', { status: 401 }));
    const c1: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => c1.push(c) }));
    expect(c1.find((c) => c.type === 'error' && c.code === 'AUTH')).toBeDefined();

    setFetchHandler(async () => new Response('slow', { status: 429 }));
    const c2: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => c2.push(c) }));
    expect(c2.find((c) => c.type === 'error' && c.code === 'RATE_LIMIT')).toBeDefined();
  });

  it('classifies 400/422 as non-transient REQUEST (not NETWORK)', async () => {
    for (const status of [400, 422]) {
      setFetchHandler(async () => new Response('bad', { status }));
      const chunks: TranslationChunk[] = [];
      await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      const err = chunks.find((c) => c.type === 'error');
      expect(err, `status=${status}`).toBeDefined();
      if (err?.type === 'error') expect(err.code, `status=${status}`).toBe('REQUEST');
    }
  });

  it('emits AUTH error when no key is configured', async () => {
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(
      mkArgs({
        config: { ...baseConfig, apiKeys: {} },
        onChunk: (c) => chunks.push(c),
      }),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('AUTH');
  });
});
