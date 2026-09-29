import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { GeminiBackend } from '@/shared/backends/gemini';
import { OllamaBackend } from '@/shared/backends/ollama';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { emitTransportError } from '@/shared/backends/transportError';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const baseConfig = {
  apiKeys: { gemini: 'g-key', openai: 'sk-test', anthropic: 'sk-ant-test' },
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

async function errorOf(
  backend: { translate: (a: TranslateCallArgs) => Promise<void> },
  over: Partial<TranslateCallArgs> = {},
): Promise<Extract<TranslationChunk, { type: 'error' }>> {
  const chunks: TranslationChunk[] = [];
  await backend.translate(mkArgs({ ...over, onChunk: (c) => chunks.push(c) }));
  const err = chunks.find((c) => c.type === 'error');
  if (err?.type !== 'error') throw new Error('expected an error chunk');
  return err;
}

function sseFrame(json: string): Response {
  return new Response(`data: ${json}\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('provider error bodies never reach the user raw', () => {
  it('Gemini surfaces the provider sentence, not the JSON envelope', async () => {
    const body = JSON.stringify({
      error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'X' },
    });
    setFetchHandler(async () => new Response(body, { status: 400 }));
    const err = await errorOf(new GeminiBackend());
    expect(err.message).toContain('API key not valid.');
    expect(err.message).not.toContain('{');
    expect(err.message).not.toContain('"status"');
  });

  it('Ollama surfaces the provider sentence, not the JSON envelope', async () => {
    setFetchHandler(
      async () => new Response(JSON.stringify({ error: 'something broke' }), { status: 500 }),
    );
    const err = await errorOf(new OllamaBackend());
    expect(err.message).toContain('something broke');
    expect(err.message).not.toContain('{');
  });

  it('a dropped connection reads as a sentence, not "Failed to fetch"', () => {
    const chunks: TranslationChunk[] = [];
    emitTransportError((c) => chunks.push(c), 'r9', new TypeError('Failed to fetch'));
    const first = chunks[0];
    if (first?.type !== 'error') throw new Error('expected an error chunk');
    expect(first.code).toBe('NETWORK');
    expect(first.message).not.toContain('Failed to fetch');
    expect(first.message).toMatch(/reach the backend/i);
  });
});

describe('deterministic failures are not retried as network blips', () => {
  it('Ollama 404 is terminal and names the pull command', async () => {
    setFetchHandler(
      async () =>
        new Response(JSON.stringify({ error: "model 'llama3.2' not found" }), { status: 404 }),
    );
    const err = await errorOf(new OllamaBackend());
    expect(err.code).toBe('REQUEST');
    expect(err.message).toContain('ollama pull llama3.2');
  });

  it('a Gemini safety block is terminal and plainly worded', async () => {
    setFetchHandler(async () =>
      sseFrame('{"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"SAFETY"}]}'),
    );
    const err = await errorOf(new GeminiBackend());
    expect(err.code).toBe('REQUEST');
    expect(err.message).not.toContain('SAFETY');
    expect(err.message).toMatch(/refused/i);
  });
});

describe('HTTP status failures name the next step', () => {
  it('OpenAI 401 points at the key in Settings', async () => {
    setFetchHandler(async () => new Response('nope', { status: 401 }));
    const err = await errorOf(makeOpenAICompatBackend('openai'));
    expect(err.message).toMatch(/Settings → Backends/);
    expect(err.message).toContain('401');
  });

  it('Anthropic 404 points at the model id', async () => {
    setFetchHandler(async () => new Response('gone', { status: 404 }));
    const err = await errorOf(new AnthropicBackend());
    expect(err.message).toMatch(/model id/i);
    expect(err.message).toContain('404');
  });

  it('OpenAI 413 tells the user to select less text', async () => {
    setFetchHandler(async () => new Response('too big', { status: 413 }));
    const err = await errorOf(makeOpenAICompatBackend('openai'));
    expect(err.message).toMatch(/less text/i);
  });
});
