import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { GeminiBackend } from '@/shared/backends/gemini';
import { OllamaBackend } from '@/shared/backends/ollama';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { readBackendAnswer, sse } from '@tests/_helpers/backend';

// EOF without the adapter's terminal frame must emit a PROTOCOL error, never a clean done.

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test', openai: 'sk-test', gemini: 'g-key' },
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

async function runFor(backend: {
  translate: (a: TranslateCallArgs) => Promise<void>;
}): Promise<TranslationChunk[]> {
  const chunks: TranslationChunk[] = [];
  await backend.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
  return chunks;
}

function expectTruncationError(chunks: TranslationChunk[]): void {
  expect(chunks.find((c) => c.type === 'done')).toBeUndefined();
  const err = chunks.find((c) => c.type === 'error');
  expect(err).toBeDefined();
  if (err?.type === 'error') {
    expect(err.code).toBe('PROTOCOL');
    expect(err.message).toContain('before the answer finished');
  }
  // The partial text already reached the surface as deltas.
  expect(chunks.some((c) => c.type === 'delta')).toBe(true);
}

describe('stream end without a terminal frame is an error, not a success', () => {
  it('Anthropic: EOF without message_stop → PROTOCOL error, no done', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"Welcome, how are"}}\n\n',
      ),
    );
    expectTruncationError(await runFor(new AnthropicBackend()));
  });

  it('Anthropic: message_stop present → clean done (control)', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"hi\\",\\"confidence\\":0.9}"}}\n\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );
    const chunks = await runFor(new AnthropicBackend());
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    expect(readBackendAnswer(chunks)['confidence']).toBeCloseTo(0.9, 2);
  });

  it('Anthropic: mid-stream error event frame surfaces as SERVER', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n' +
          'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
      ),
    );
    const chunks = await runFor(new AnthropicBackend());
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('SERVER');
      expect(err.message).toContain('Overloaded');
    }
    expect(chunks.find((c) => c.type === 'done')).toBeUndefined();
  });

  it('Anthropic: mid-stream rate_limit_error event maps to RATE_LIMIT', async () => {
    setFetchHandler(async () =>
      sse('data: {"type":"error","error":{"type":"rate_limit_error","message":"Too fast"}}\n\n'),
    );
    const chunks = await runFor(new AnthropicBackend());
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('RATE_LIMIT');
  });

  it('OpenAI: EOF without [DONE] or finish_reason → PROTOCOL error', async () => {
    setFetchHandler(async () =>
      sse('data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"half"}}]}\n\n'),
    );
    expectTruncationError(await runFor(makeOpenAICompatBackend('openai')));
  });

  it('OpenAI: finish_reason without [DONE] still counts as terminal', async () => {
    // A proxy that strips the sentinel must not turn a complete answer into an error.
    setFetchHandler(async () =>
      sse(
        'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"ok\\",\\"confidence\\":0.8}"}}]}\n\n' +
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ),
    );
    const chunks = await runFor(makeOpenAICompatBackend('openai'));
    expect(chunks.find((c) => c.type === 'done')).toBeDefined();
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });

  it('Gemini: EOF without any finishReason → PROTOCOL error', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"cut"}]}}]}\n\n',
      ),
    );
    expectTruncationError(await runFor(new GeminiBackend()));
  });

  it('Gemini: finishReason STOP → clean done (control)', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"ok\\",\\"confidence\\":0.9}"}]},"finishReason":"STOP"}]}\n\n',
      ),
    );
    const chunks = await runFor(new GeminiBackend());
    expect(chunks.find((c) => c.type === 'done')).toBeDefined();
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });

  it('Ollama: NDJSON stream without done:true → PROTOCOL error', async () => {
    setFetchHandler(
      async () =>
        new Response('{"message":{"content":"{\\"translation\\":\\"tron"},"done":false}\n', {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
        }),
    );
    expectTruncationError(await runFor(new OllamaBackend()));
  });

  it('a data:-less stream that outgrows the 1MB SSE buffer surfaces as PROTOCOL', async () => {
    const junk = ':'.padEnd(65_536, 'z');
    setFetchHandler(async () => sse(Array.from({ length: 17 }, () => junk).join('')));
    const chunks = await runFor(new AnthropicBackend());
    expect(chunks.find((c) => c.type === 'done')).toBeUndefined();
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') expect(err.code).toBe('PROTOCOL');
  });

  it('a done whose body carries no confidence emits a chunk without the field', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"hi\\"}"}}\n\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );
    const chunks = await runFor(new AnthropicBackend());
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    expect(done).not.toHaveProperty('confidence');
  });
});
