import { describe, it, expect } from 'vitest';
import { OllamaBackend } from '@/shared/backends/ollama';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { ChatTurn } from '@/shared/chat-history';

const baseConfig = {
  apiKeys: {},
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

function ndjsonDone(): Response {
  return new Response(JSON.stringify({ message: { content: '{}' }, done: true }) + '\n', {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

function captureBody(): { current: Record<string, unknown> | undefined } {
  const box: { current: Record<string, unknown> | undefined } = { current: undefined };
  setFetchHandler((_url, init) => {
    box.current = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return ndjsonDone();
  });
  return box;
}

const mkArgs = (over: Partial<TranslateCallArgs> = {}): TranslateCallArgs => ({
  req: {
    id: 'r1',
    text: 'hi',
    sourceLang: sel('arabizi'),
    targetLang: sel('en'),
    options: { stream: false, explain: false },
  },
  system: 'SYS',
  user: 'USER',
  stream: false,
  cancel: noopCancel(),
  onChunk: () => {},
  config: baseConfig,
  ...over,
});

describe('OllamaBackend — history', () => {
  it('with history: prior turns splice between system and final user message', async () => {
    const history: ChatTurn[] = [
      { role: 'user', content: 'h1' },
      { role: 'assistant', content: 'h2' },
    ];
    const body = captureBody();
    await new OllamaBackend().translate(mkArgs({ user: 'now', history }));

    expect(body.current?.['messages']).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'h1' },
      { role: 'assistant', content: 'h2' },
      { role: 'user', content: 'now' },
    ]);
  });

  it('without history: messages has only system + final user', async () => {
    const body = captureBody();
    await new OllamaBackend().translate(mkArgs({ user: 'now' }));

    expect(body.current?.['messages']).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'now' },
    ]);
  });

  it('empty history array: messages unchanged', async () => {
    const body = captureBody();
    await new OllamaBackend().translate(mkArgs({ user: 'now', history: [] }));

    expect(body.current?.['messages']).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'now' },
    ]);
  });
});
