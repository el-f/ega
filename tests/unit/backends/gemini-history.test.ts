import { describe, it, expect } from 'vitest';
import { GeminiBackend } from '@/shared/backends/gemini';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { ChatTurn } from '@/shared/chat-history';

const baseConfig = {
  apiKeys: { gemini: 'key-test' },
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

function jsonStop(): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function captureBody(): { current: Record<string, unknown> | undefined } {
  const box: { current: Record<string, unknown> | undefined } = { current: undefined };
  setFetchHandler((_url, init) => {
    box.current = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonStop();
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

describe('GeminiBackend — history', () => {
  it('with history: prior turns splice before final user content, assistant→model', async () => {
    const history: ChatTurn[] = [
      { role: 'user', content: 'h1' },
      { role: 'assistant', content: 'h2' },
    ];
    const body = captureBody();
    await new GeminiBackend().translate(mkArgs({ user: 'now', history }));

    expect(body.current?.['contents']).toEqual([
      { role: 'user', parts: [{ text: 'h1' }] },
      { role: 'model', parts: [{ text: 'h2' }] },
      { role: 'user', parts: [{ text: 'now' }] },
    ]);
  });

  it('without history: contents has only the final user turn', async () => {
    const body = captureBody();
    await new GeminiBackend().translate(mkArgs({ user: 'now' }));

    expect(body.current?.['contents']).toEqual([{ role: 'user', parts: [{ text: 'now' }] }]);
  });

  it('empty history array: contents unchanged', async () => {
    const body = captureBody();
    await new GeminiBackend().translate(mkArgs({ user: 'now', history: [] }));

    expect(body.current?.['contents']).toEqual([{ role: 'user', parts: [{ text: 'now' }] }]);
  });
});
