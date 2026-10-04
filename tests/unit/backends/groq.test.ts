import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { sse } from '@tests/_helpers/backend';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, '..', '..', 'fixtures', 'groq-stream.txt'), 'utf8');

const baseConfig = {
  apiKeys: { groq: 'gsk_test' },
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

describe('groq (openai-compat)', () => {
  it('has id "groq"', () => {
    expect(makeOpenAICompatBackend('groq').id).toBe('groq');
  });

  it('isAvailable true with key, false without', async () => {
    const b = makeOpenAICompatBackend('groq');
    expect(await b.isAvailable(baseConfig)).toBe(true);
    expect(await b.isAvailable({ ...baseConfig, apiKeys: {} })).toBe(false);
  });

  it('hits the Groq endpoint with Bearer auth and configured model', async () => {
    let hitUrl = '';
    let hitAuth = '';
    let sentBody: Record<string, unknown> = {};
    setFetchHandler(async (url, init) => {
      hitUrl = url;
      hitAuth = String(
        (init?.headers as Record<string, string> | undefined)?.['authorization'] ?? '',
      );
      sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return sse(FIXTURE);
    });
    await makeOpenAICompatBackend('groq').translate(mkArgs());
    expect(hitUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(hitAuth).toBe('Bearer gsk_test');
    expect(sentBody['model']).toBe('llama-3.3-70b-versatile');
    expect(sentBody['stream']).toBe(true);
  });

  it('parses captured SSE fixture into deltas + done', async () => {
    setFetchHandler(async () => sse(FIXTURE));
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('groq').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const deltas = chunks.filter((c) => c.type === 'delta');
    const done = chunks.find((c) => c.type === 'done');
    expect(deltas.length).toBeGreaterThan(0);
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.confidence).toBeCloseTo(0.91, 2);
      expect(done.detectedLang).toBe('arabizi');
    }
  });

  it('does NOT implement translateImage (Groq is text-only)', () => {
    // canVision:false in the profile means the constructor never assigns translateImage.
    expect(makeOpenAICompatBackend('groq').translateImage).toBeUndefined();
  });

  it('maps 401 to AUTH and 429 to RATE_LIMIT', async () => {
    setFetchHandler(async () => new Response('nope', { status: 401 }));
    const c1: TranslationChunk[] = [];
    await makeOpenAICompatBackend('groq').translate(mkArgs({ onChunk: (c) => c1.push(c) }));
    expect(c1.find((c) => c.type === 'error' && c.code === 'AUTH')).toBeDefined();

    setFetchHandler(async () => new Response('slow', { status: 429 }));
    const c2: TranslationChunk[] = [];
    await makeOpenAICompatBackend('groq').translate(mkArgs({ onChunk: (c) => c2.push(c) }));
    expect(c2.find((c) => c.type === 'error' && c.code === 'RATE_LIMIT')).toBeDefined();
  });
});
