import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { GeminiBackend } from '@/shared/backends/gemini';
import { OllamaBackend } from '@/shared/backends/ollama';
import { NativeBackend } from '@/shared/backends/native';
import { _resetForTest as resetNativePort } from '@/shared/cli-session/port-manager';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { ErrCode, TranslationChunk } from '@/shared/types';
import { sse } from '@tests/_helpers/backend';

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

function ndjson(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}

async function runFor(
  backend: { translate: (a: TranslateCallArgs) => Promise<void> },
  over: Partial<TranslateCallArgs> = {},
): Promise<TranslationChunk[]> {
  const chunks: TranslationChunk[] = [];
  await backend.translate(mkArgs({ onChunk: (c) => chunks.push(c), ...over }));
  return chunks;
}

function expectErrorNoDone(chunks: TranslationChunk[], code: ErrCode): TranslationChunk {
  expect(
    chunks.find((c) => c.type === 'done'),
    'a truncated or empty answer must never be a done chunk',
  ).toBeUndefined();
  const err = chunks.find((c) => c.type === 'error');
  expect(err).toBeDefined();
  if (err?.type === 'error') expect(err.code).toBe(code);
  return err as TranslationChunk;
}

describe('a max-token truncation is reported as an error, not a success', () => {
  it('OpenAI-compat: finish_reason "length" → REQUEST, no done', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"half an ans"}}]}\n\n' +
          'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n' +
          'data: [DONE]\n\n',
      ),
    );
    const err = expectErrorNoDone(await runFor(makeOpenAICompatBackend('openai')), 'REQUEST');
    if (err.type === 'error') expect(err.message).toContain('max-tokens');
  });

  it('OpenAI-compat non-stream: finish_reason "length" → REQUEST', async () => {
    setFetchHandler(async () =>
      Response.json({
        choices: [{ message: { content: '{"translation":"half"}' }, finish_reason: 'length' }],
      }),
    );
    expectErrorNoDone(
      await runFor(makeOpenAICompatBackend('openai'), { stream: false }),
      'REQUEST',
    );
  });

  it('Anthropic: message_delta stop_reason "max_tokens" → REQUEST, no done', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"half"}}\n\n' +
          'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":1024}}\n\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );
    expectErrorNoDone(await runFor(new AnthropicBackend()), 'REQUEST');
  });

  it('Anthropic non-stream: stop_reason "max_tokens" → REQUEST', async () => {
    setFetchHandler(async () =>
      Response.json({ content: [{ text: '{"translation":"half"}' }], stop_reason: 'max_tokens' }),
    );
    expectErrorNoDone(await runFor(new AnthropicBackend(), { stream: false }), 'REQUEST');
  });

  it('Ollama: done_reason "length" → REQUEST, no done', async () => {
    setFetchHandler(async () =>
      ndjson(
        '{"message":{"content":"{\\"translation\\":\\"half"}}\n' +
          '{"done":true,"done_reason":"length"}\n',
      ),
    );
    expectErrorNoDone(await runFor(new OllamaBackend()), 'REQUEST');
  });

  it('a normal stop_reason still completes (control)', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"ok\\"}"}}\n\n' +
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );
    const chunks = await runFor(new AnthropicBackend());
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });
});

describe('a terminated stream that produced zero text is an error', () => {
  it('Anthropic: message_stop with no text → SERVER, no done', async () => {
    setFetchHandler(async () => sse('data: {"type":"message_stop"}\n\n'));
    expectErrorNoDone(await runFor(new AnthropicBackend()), 'SERVER');
  });

  it('OpenAI-compat: [DONE] with no delta → SERVER, no done', async () => {
    setFetchHandler(async () => sse('data: [DONE]\n\n'));
    expectErrorNoDone(await runFor(makeOpenAICompatBackend('openai')), 'SERVER');
  });

  it('OpenAI-compat non-stream: empty content → SERVER', async () => {
    setFetchHandler(async () => Response.json({ choices: [{ message: { content: '   ' } }] }));
    expectErrorNoDone(await runFor(makeOpenAICompatBackend('openai'), { stream: false }), 'SERVER');
  });

  it('Ollama: done:true with no content → SERVER, no done', async () => {
    setFetchHandler(async () => ndjson('{"done":true}\n'));
    expectErrorNoDone(await runFor(new OllamaBackend()), 'SERVER');
  });

  it('Native: a done frame with no delta → SERVER, no done', async () => {
    installNativeStub((post, reply) => {
      if (post.kind === 'translate') reply({ type: 'done' });
    });
    expectErrorNoDone(await runFor(new NativeBackend()), 'SERVER');
  });

  it('Anthropic: a stream that ends mid-envelope → SERVER, no blank done', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\""}}\n\n' +
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );
    expectErrorNoDone(await runFor(new AnthropicBackend()), 'SERVER');
  });

  it('Anthropic: an explicit empty translation is a real answer (image with no text)', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"\\",\\"confidence\\":0}"}}\n\n' +
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );
    const chunks = await runFor(new AnthropicBackend());
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });

  it('Native: a done frame after real text still completes (control)', async () => {
    installNativeStub((post, reply) => {
      if (post.kind !== 'translate') return;
      reply({ type: 'delta', text: '{"translation":"ok"}' });
      reply({ type: 'done' });
    });
    const chunks = await runFor(new NativeBackend());
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });
});

describe('Gemini reports a block that lands after some text has streamed', () => {
  it('SAFETY after a partial answer → REQUEST refusal, no done', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"one sen"}]}}]}\n\n' +
          'data: {"candidates":[{"finishReason":"SAFETY"}]}\n\n',
      ),
    );
    const err = expectErrorNoDone(await runFor(new GeminiBackend()), 'REQUEST');
    if (err.type === 'error') expect(err.message).toContain('refused');
  });

  it('RECITATION after a partial answer → REQUEST refusal', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"lyrics"}]},"finishReason":"RECITATION"}]}\n\n',
      ),
    );
    expectErrorNoDone(await runFor(new GeminiBackend()), 'REQUEST');
  });

  it('MAX_TOKENS after a partial answer → REQUEST, cut-off message', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"half"}]},"finishReason":"MAX_TOKENS"}]}\n\n',
      ),
    );
    const err = expectErrorNoDone(await runFor(new GeminiBackend()), 'REQUEST');
    if (err.type === 'error') expect(err.message).toContain('max-tokens');
  });

  it('promptFeedback blockReason after partial text → REQUEST refusal', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}],"promptFeedback":{"blockReason":"BLOCKLIST"}}\n\n',
      ),
    );
    expectErrorNoDone(await runFor(new GeminiBackend()), 'REQUEST');
  });

  it('STOP with text still completes (control)', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"{\\"translation\\":\\"ok\\"}"}]},"finishReason":"STOP"}]}\n\n',
      ),
    );
    const chunks = await runFor(new GeminiBackend());
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });
});

describe('an OpenAI-compatible or Anthropic refusal is a REQUEST error, not an empty answer', () => {
  it('OpenAI-compat: refusal deltas then content_filter → REQUEST with the refusal text', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"choices":[{"delta":{"refusal":"I can\'t help "}}]}\n\n' +
          'data: {"choices":[{"delta":{"refusal":"with that."},"finish_reason":"content_filter"}]}\n\n' +
          'data: [DONE]\n\n',
      ),
    );
    const err = expectErrorNoDone(await runFor(makeOpenAICompatBackend('openai')), 'REQUEST');
    if (err.type === 'error') expect(err.message).toBe("I can't help with that.");
  });

  it('OpenAI-compat: refusal deltas then a plain stop and no [DONE] → REQUEST', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"choices":[{"delta":{"refusal":"No."}}]}\n\n' +
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ),
    );
    const err = expectErrorNoDone(await runFor(makeOpenAICompatBackend('openai')), 'REQUEST');
    if (err.type === 'error') expect(err.message).toBe('No.');
  });

  it('OpenAI-compat: refusal deltas with no finish_reason → REQUEST at [DONE]', async () => {
    setFetchHandler(async () =>
      sse('data: {"choices":[{"delta":{"refusal":"No."}}]}\n\n' + 'data: [DONE]\n\n'),
    );
    const err = expectErrorNoDone(await runFor(makeOpenAICompatBackend('openai')), 'REQUEST');
    if (err.type === 'error') expect(err.message).toBe('No.');
  });

  it('OpenAI-compat: content_filter after partial text → REQUEST refusal, no done', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"one sen"}}]}\n\n' +
          'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n' +
          'data: [DONE]\n\n',
      ),
    );
    const err = expectErrorNoDone(await runFor(makeOpenAICompatBackend('openai')), 'REQUEST');
    if (err.type === 'error') expect(err.message).toContain('refused');
  });

  it('OpenAI-compat non-stream: message.refusal → REQUEST with the refusal text', async () => {
    setFetchHandler(async () =>
      Response.json({
        choices: [
          { message: { content: null, refusal: 'I cannot do that.' }, finish_reason: 'stop' },
        ],
      }),
    );
    const err = expectErrorNoDone(
      await runFor(makeOpenAICompatBackend('openai'), { stream: false }),
      'REQUEST',
    );
    if (err.type === 'error') expect(err.message).toBe('I cannot do that.');
  });

  it('OpenAI-compat non-stream: content_filter with no refusal text → REQUEST refusal', async () => {
    setFetchHandler(async () =>
      Response.json({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] }),
    );
    const err = expectErrorNoDone(
      await runFor(makeOpenAICompatBackend('openai'), { stream: false }),
      'REQUEST',
    );
    if (err.type === 'error') expect(err.message).toContain('refused');
  });

  it('Anthropic: message_delta stop_reason "refusal" → REQUEST, no done', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"one sen"}}\n\n' +
          'data: {"type":"message_delta","delta":{"stop_reason":"refusal"},"usage":{"output_tokens":4}}\n\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );
    const err = expectErrorNoDone(await runFor(new AnthropicBackend()), 'REQUEST');
    if (err.type === 'error') expect(err.message).toContain('refused');
  });

  it('Anthropic non-stream: stop_reason "refusal" → REQUEST', async () => {
    setFetchHandler(async () => Response.json({ content: [{ text: '' }], stop_reason: 'refusal' }));
    const err = expectErrorNoDone(
      await runFor(new AnthropicBackend(), { stream: false }),
      'REQUEST',
    );
    if (err.type === 'error') expect(err.message).toContain('refused');
  });
});

describe('an OpenAI-compatible mid-stream error frame keeps the provider message', () => {
  it('data: {"error":…} surfaces as SERVER with the provider sentence', async () => {
    setFetchHandler(async () =>
      sse(
        'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n' +
          'data: {"error":{"message":"upstream model is overloaded","type":"server_error"}}\n\n',
      ),
    );
    const err = expectErrorNoDone(await runFor(makeOpenAICompatBackend('openai')), 'SERVER');
    if (err.type === 'error') {
      expect(err.message).toContain('upstream model is overloaded');
      expect(err.message).not.toContain('connection dropped');
    }
  });

  it('a rate-limit error type maps to RATE_LIMIT', async () => {
    setFetchHandler(async () =>
      sse('data: {"error":{"message":"slow down","type":"rate_limit_exceeded"}}\n\n'),
    );
    expectErrorNoDone(
      await runFor(makeOpenAICompatBackend('openrouter'), {
        config: { ...baseConfig, apiKeys: { ...baseConfig.apiKeys, openrouter: 'or-key' } },
      }),
      'RATE_LIMIT',
    );
  });
});

describe('Ollama NDJSON buffer cap', () => {
  it('a newline-less body past 1MB surfaces as PROTOCOL, not an OOM', async () => {
    const junk = 'x'.repeat(65_536);
    setFetchHandler(async () => ndjson(Array.from({ length: 17 }, () => junk).join('')));
    const err = expectErrorNoDone(await runFor(new OllamaBackend()), 'PROTOCOL');
    // Not "the connection dropped": that is the truncation message, which this body also earns.
    if (err.type === 'error') expect(err.message).toContain('Ega could not read');
  });
});

/** Replaces the native port with one that answers each posted frame through `respond`. */
function installNativeStub(
  respond: (
    post: { id?: string; kind?: string },
    reply: (frame: Record<string, unknown>) => void,
  ) => void,
): void {
  chrome.runtime.connectNative = (() => {
    const listeners = new Set<(m: unknown) => void>();
    return {
      name: 'ega-stream-contract',
      onMessage: {
        addListener: (fn: (m: unknown) => void) => listeners.add(fn),
        removeListener: (fn: (m: unknown) => void) => listeners.delete(fn),
      },
      onDisconnect: { addListener: () => {}, removeListener: () => {} },
      disconnect: () => {},
      postMessage: (post: { id?: string; kind?: string }) => {
        queueMicrotask(() => {
          respond(post, (frame) => {
            for (const fn of listeners) fn({ v: 1, id: post.id, ...frame });
          });
        });
      },
    } as unknown as chrome.runtime.Port;
  }) as unknown as typeof chrome.runtime.connectNative;
  resetNativePort();
}

// "Describe your change" replies with no `translation` field; without `rawAnswer` that reads as an empty answer and the feature falls back to the user's own text.
describe('a caller that is not translating gets the model text as the answer', () => {
  it('Anthropic: a non-translation JSON body is a done chunk under rawAnswer', async () => {
    const body = JSON.stringify({ category: 'always', body: 'Keep emoji.', scope: { tasks: [] } });
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: body }],
            stop_reason: 'end_turn',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const chunks = await runFor(new AnthropicBackend(), { stream: false, rawAnswer: true });
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(
      chunks
        .filter((c): c is Extract<TranslationChunk, { type: 'delta' }> => c.type === 'delta')
        .map((c) => c.text)
        .join(''),
    ).toBe(body);
  });

  it('Anthropic: the same body without the flag is an empty answer', async () => {
    const body = JSON.stringify({ category: 'always', body: 'Keep emoji.', scope: { tasks: [] } });
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: body }],
            stop_reason: 'end_turn',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    expectErrorNoDone(await runFor(new AnthropicBackend(), { stream: false }), 'SERVER');
  });

  it('rawAnswer still reports a truly empty reply as an error', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: '' }], stop_reason: 'end_turn' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    expectErrorNoDone(
      await runFor(new AnthropicBackend(), { stream: false, rawAnswer: true }),
      'SERVER',
    );
  });
});
