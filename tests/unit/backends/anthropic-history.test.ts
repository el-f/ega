import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { ChatTurn } from '@/shared/chat-history';

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test' },
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

function sseStop(): Response {
  return new Response(['event: message_stop', 'data: {"type":"message_stop"}', ''].join('\n'), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function captureBody(): { current: Record<string, unknown> | undefined } {
  const box: { current: Record<string, unknown> | undefined } = { current: undefined };
  setFetchHandler((_url, init) => {
    box.current = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseStop();
  });
  return box;
}

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

describe('AnthropicBackend — history + cache_control', () => {
  it('with history: prior turns precede final user message, last message carries cache_control', async () => {
    const history: ChatTurn[] = [
      { role: 'user', content: 'h1' },
      { role: 'assistant', content: 'h2' },
    ];
    const body = captureBody();
    await new AnthropicBackend().translate(mkArgs({ user: 'now', history }));

    expect(body.current?.['messages']).toEqual([
      { role: 'user', content: 'h1' },
      { role: 'assistant', content: 'h2' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'now', cache_control: { type: 'ephemeral' } }],
      },
    ]);
  });

  it('without history: messages is the plain single-string form, with no cache_control', async () => {
    const body = captureBody();
    await new AnthropicBackend().translate(mkArgs({ user: 'now' }));

    expect(body.current?.['messages']).toEqual([{ role: 'user', content: 'now' }]);
  });
});
