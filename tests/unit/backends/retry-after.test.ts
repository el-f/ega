import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { GeminiBackend } from '@/shared/backends/gemini';
import { OllamaBackend } from '@/shared/backends/ollama';
import { parseRetryAfterMs } from '@/shared/backends/stream-resilience';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test', openai: 'sk-openai', gemini: 'g-key' },
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

describe('parseRetryAfterMs', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfterMs('30')).toBe(30_000);
    expect(parseRetryAfterMs('0')).toBe(0);
    expect(parseRetryAfterMs('  5 ')).toBe(5_000);
  });

  it('parses an HTTP-date into a forward-looking delay', () => {
    const future = new Date(Date.now() + 12_000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeGreaterThan(9_000);
    expect(ms).toBeLessThanOrEqual(12_000);
  });

  it('clamps a past HTTP-date to 0 (never negative)', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfterMs(past)).toBe(0);
  });

  it('returns undefined for null / empty / garbage', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs('')).toBeUndefined();
    expect(parseRetryAfterMs('soon-ish')).toBeUndefined();
    expect(parseRetryAfterMs('-5')).toBeUndefined();
  });

  it('clamps an oversized delta-seconds hint to the 60s ceiling', () => {
    expect(parseRetryAfterMs('60')).toBe(60_000);
    expect(parseRetryAfterMs('3600')).toBe(60_000);
    // A pathological value must not overflow a 32-bit setTimeout delay.
    expect(parseRetryAfterMs('999999999')).toBe(60_000);
  });

  it('clamps a far-future HTTP-date to the 60s ceiling', () => {
    const wayOut = new Date(Date.now() + 86_400_000).toUTCString();
    expect(parseRetryAfterMs(wayOut)).toBe(60_000);
  });
});

describe('Retry-After surfaced on 429/503/529 errors', () => {
  it('Anthropic: 429 with Retry-After carries retryAfterMs on the chunk', async () => {
    setFetchHandler(
      async () => new Response('rate-limited', { status: 429, headers: { 'retry-after': '17' } }),
    );
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('RATE_LIMIT');
      expect(err.retryAfterMs).toBe(17_000);
      // The hint travels as data — surfaces render a live countdown, not stale text.
      expect(err.message).not.toContain('retry after');
    }
  });

  it('a 503 with Retry-After carries retryAfterMs too (OpenAI server_is_overloaded)', async () => {
    setFetchHandler(
      async () => new Response('overloaded', { status: 503, headers: { 'retry-after': '5' } }),
    );
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('SERVER');
    expect(err?.type === 'error' ? err.retryAfterMs : null).toBe(5_000);
  });

  it('OpenAI-compat: 429 with Retry-After carries retryAfterMs on the chunk', async () => {
    setFetchHandler(
      async () => new Response('slow down', { status: 429, headers: { 'retry-after': '8' } }),
    );
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('RATE_LIMIT');
      expect(err.retryAfterMs).toBe(8_000);
    }
  });

  it('Gemini: 429 with Retry-After carries retryAfterMs on the chunk', async () => {
    setFetchHandler(
      async () => new Response('quota', { status: 429, headers: { 'retry-after': '42' } }),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('RATE_LIMIT');
      expect(err.retryAfterMs).toBe(42_000);
    }
  });

  it('Ollama: 429 with Retry-After carries retryAfterMs on the chunk', async () => {
    setFetchHandler(
      async () => new Response('busy', { status: 429, headers: { 'retry-after': '3' } }),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.retryAfterMs).toBe(3_000);
    }
  });

  it('Anthropic: 429 without Retry-After still emits RATE_LIMIT (no crash)', async () => {
    setFetchHandler(async () => new Response('rate-limited', { status: 429 }));
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('RATE_LIMIT');
  });
});
