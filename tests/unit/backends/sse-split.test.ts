import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const baseConfig = {
  apiKeys: { anthropic: 'sk' },
  model: {
    anthropic: 'claude',
    openai: 'x',
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
    promptTemplate: { system: '', user: '' },
    perPresetTemplates: {},
    temperature: 0,
    maxTokens: 1,
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
  system: '',
  user: '',
  stream: true,
  cancel: noopCancel(),
  onChunk: () => {},
  config: baseConfig,
  ...over,
});

/** Splits the SSE blank-line boundary across reads, as the network often does. */
function splitStream(parts: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i >= parts.length) {
        controller.close();
        return;
      }
      const next = parts[i++];
      if (next !== undefined) controller.enqueue(encoder.encode(next));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('Anthropic SSE iterator survives chunk-split events', () => {
  it('reassembles a delta frame whose newlines span two reads', async () => {
    setFetchHandler(async () =>
      splitStream([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"he',
        'llo"}}\n',
        '\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    );
    const chunks: TranslationChunk[] = [];
    const b = new AnthropicBackend();
    await b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const deltas = chunks.filter((c) => c.type === 'delta');
    const combined = deltas.map((d) => d.text).join('');
    expect(combined).toBe('hello');
    expect(chunks.find((c) => c.type === 'done')).toBeDefined();
  });
});
