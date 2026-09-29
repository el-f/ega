import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { GeminiBackend } from '@/shared/backends/gemini';
import { OllamaBackend } from '@/shared/backends/ollama';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { sse } from '@tests/_helpers/backend';

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test', openai: 'sk-custom', gemini: 'g-key' },
  model: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'custom-model-v1',
    gemini: 'gemini-2.5-flash',
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
    temperature: 0.3,
    maxTokens: 777,
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

function doneOf(chunks: TranslationChunk[]): Extract<TranslationChunk, { type: 'done' }> {
  const done = chunks.find((c) => c.type === 'done');
  if (done?.type !== 'done') throw new Error('no done chunk');
  return done;
}

describe('Anthropic usage extraction', () => {
  it('reads input/output/cache-read tokens from message_start + message_delta', async () => {
    setFetchHandler(async () =>
      sse(
        [
          'event: message_start',
          'data: {"type":"message_start","message":{"usage":{"input_tokens":120,"cache_read_input_tokens":80}}}',
          '',
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"hi\\",\\"confidence\\":0.9}"}}',
          '',
          'event: message_delta',
          'data: {"type":"message_delta","usage":{"output_tokens":42}}',
          '',
          'event: message_stop',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n'),
      ),
    );
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const done = doneOf(chunks);
    expect(done.usage).toEqual({ inputTokens: 120, outputTokens: 42, cacheReadTokens: 80 });
  });

  it('takes the LAST cumulative output_tokens, not the sum', async () => {
    // Anthropic's message_delta.usage.output_tokens is cumulative — each
    // event carries the running total. Summing would over-count badly.
    setFetchHandler(async () =>
      sse(
        [
          'event: message_start',
          'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}',
          '',
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"hi\\"}"}}',
          '',
          'event: message_delta',
          'data: {"type":"message_delta","usage":{"output_tokens":20}}',
          '',
          'event: message_delta',
          'data: {"type":"message_delta","usage":{"output_tokens":42}}',
          '',
          'event: message_stop',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n'),
      ),
    );
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(doneOf(chunks).usage?.outputTokens).toBe(42);
  });

  it('omits usage when the stream never reports it', async () => {
    setFetchHandler(async () =>
      sse(
        [
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"hi\\",\\"confidence\\":0.9}"}}',
          '',
          'event: message_stop',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n'),
      ),
    );
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(doneOf(chunks).usage).toBeUndefined();
  });
});

describe('OpenAI-compat usage extraction', () => {
  // Uses the bundled 'openai' profile; apiKeys.openai is set in baseConfig.
  it('requests stream_options.include_usage', async () => {
    let sentBody: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return sse('data: [DONE]\n\n');
    });
    await makeOpenAICompatBackend('openai').translate(mkArgs());
    expect(sentBody['stream_options']).toEqual({ include_usage: true });
  });

  it('reads prompt/completion tokens from the trailing usage frame', async () => {
    const SSE = [
      'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"hi\\",\\"confidence\\":0.9}"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":33,"completion_tokens":7}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    setFetchHandler(async () => sse(SSE));
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const done = doneOf(chunks);
    expect(done.usage).toEqual({ inputTokens: 33, outputTokens: 7 });
  });

  it('does not crash on the empty-choices usage frame', async () => {
    const SSE = [
      'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"hi\\",\\"confidence\\":0.9}"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    setFetchHandler(async () => sse(SSE));
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('openai').translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const done = doneOf(chunks);
    expect(done.confidence).toBeCloseTo(0.9, 2);
  });
});

describe('Gemini usage extraction', () => {
  it('maps usageMetadata to input/output tokens', async () => {
    setFetchHandler(async () =>
      sse(
        [
          'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"hi\\",\\"confidence\\":0.9}"}]}}]}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":12}}\n\n',
        ].join(''),
      ),
    );
    const chunks: TranslationChunk[] = [];
    await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const done = doneOf(chunks);
    expect(done.usage).toEqual({ inputTokens: 50, outputTokens: 12 });
  });
});

describe('Ollama usage extraction', () => {
  it('maps prompt_eval_count/eval_count from the final frame', async () => {
    const ndjson =
      JSON.stringify({
        message: { content: '{"translation":"hi","confidence":0.9}' },
        done: false,
      }) +
      '\n' +
      JSON.stringify({
        message: { content: '' },
        done: true,
        prompt_eval_count: 18,
        eval_count: 5,
      }) +
      '\n';
    setFetchHandler(async () => new Response(ndjson, { status: 200 }));
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const done = doneOf(chunks);
    expect(done.usage).toEqual({ inputTokens: 18, outputTokens: 5 });
  });
});
