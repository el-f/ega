import { describe, it, expect } from 'vitest';
import { requireTranslateImage } from '@tests/_helpers/backend';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { OllamaBackend } from '@/shared/backends/ollama';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { GeminiBackend } from '@/shared/backends/gemini';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs, TranslateImageArgs } from '@/shared/backends/base';
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

const mkImgArgs = (over: Partial<TranslateImageArgs> = {}): TranslateImageArgs => ({
  imageBase64: 'AAAA',
  mediaType: 'image/png',
  requestId: 'img1',
  cancel: noopCancel(),
  config: baseConfig,
  onChunk: () => {},
  ...over,
});

type ErrChunk = Extract<TranslationChunk, { type: 'error' }>;

function firstError(chunks: TranslationChunk[]): ErrChunk {
  const err = chunks.find((c) => c.type === 'error');
  if (err?.type !== 'error') throw new Error('expected an error chunk');
  return err;
}

async function textError(
  backend: { translate: (a: TranslateCallArgs) => Promise<void> },
  over: Partial<TranslateCallArgs> = {},
): Promise<ErrChunk> {
  const chunks: TranslationChunk[] = [];
  await backend.translate(mkArgs({ ...over, onChunk: (c) => chunks.push(c) }));
  return firstError(chunks);
}

async function imageError(
  backend: { translateImage?: (a: TranslateImageArgs) => Promise<void> },
  over: Partial<TranslateImageArgs> = {},
): Promise<ErrChunk> {
  const chunks: TranslationChunk[] = [];
  await backend.translateImage?.(mkImgArgs({ ...over, onChunk: (c) => chunks.push(c) }));
  return firstError(chunks);
}

describe('image path classifies HTTP errors the same way the text path does', () => {
  it('Ollama translateImage 404 is terminal and names the pull command', async () => {
    setFetchHandler(
      async () =>
        new Response(JSON.stringify({ error: "model 'llama3.2' not found" }), { status: 404 }),
    );
    const err = await imageError(new OllamaBackend());
    expect(err.code).toBe('REQUEST');
    expect(err.message).toContain('ollama pull llama3.2');
  });

  it('Ollama translateImage 401 is AUTH, not a retryable network blip', async () => {
    setFetchHandler(async () => new Response('nope', { status: 401 }));
    const err = await imageError(new OllamaBackend());
    expect(err.code).toBe('AUTH');
  });

  it('Ollama translateImage surfaces the provider sentence, not the JSON envelope', async () => {
    setFetchHandler(
      async () => new Response(JSON.stringify({ error: 'something broke' }), { status: 500 }),
    );
    const err = await imageError(new OllamaBackend());
    expect(err.code).toBe('SERVER');
    expect(err.message).toContain('something broke');
    expect(err.message).not.toContain('{');
  });
});

describe('a rate limit carries the server hint on every adapter', () => {
  const rateLimited = () =>
    setFetchHandler(
      async () => new Response('slow down', { status: 429, headers: { 'retry-after': '7' } }),
    );

  it('Ollama text path reports retryAfterMs', async () => {
    rateLimited();
    const err = await textError(new OllamaBackend());
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.retryAfterMs).toBe(7000);
  });

  it('Ollama image path reports retryAfterMs', async () => {
    rateLimited();
    const err = await imageError(new OllamaBackend());
    expect(err.retryAfterMs).toBe(7000);
  });

  it('Gemini image path reports retryAfterMs', async () => {
    rateLimited();
    const err = await imageError(new GeminiBackend());
    expect(err.retryAfterMs).toBe(7000);
  });
});

describe('a dropped connection never reaches the user as raw fetch text', () => {
  it('Ollama text path', async () => {
    setFetchHandler(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await textError(new OllamaBackend());
    expect(err.code).toBe('NETWORK');
    expect(err.message).not.toContain('Failed to fetch');
    expect(err.message).toMatch(/reach the backend/i);
  });

  it('Ollama image path', async () => {
    setFetchHandler(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await imageError(new OllamaBackend());
    expect(err.code).toBe('NETWORK');
    expect(err.message).not.toContain('Failed to fetch');
  });
});

describe('the image path reports token usage like the text path', () => {
  it('Ollama translateImage carries the counts the daemon returns', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            message: { content: '{"translation":"hi","confidence":1}' },
            done: true,
            prompt_eval_count: 11,
            eval_count: 4,
          }),
          { status: 200 },
        ),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translateImage(mkImgArgs({ onChunk: (c) => chunks.push(c) }));
    const done = chunks.find((c) => c.type === 'done');
    if (done?.type !== 'done') throw new Error('expected a done chunk');
    expect(done.usage).toEqual({ inputTokens: 11, outputTokens: 4 });
  });
});

describe('the image path asks for token counts like the text path', () => {
  it('OpenAI-compatible image requests send stream_options.include_usage', async () => {
    let sent: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    await requireTranslateImage(makeOpenAICompatBackend('openai'))(mkImgArgs());
    expect(sent['stream']).toBe(true);
    expect(sent['stream_options']).toEqual({ include_usage: true });
  });
});

describe('the provider sentence reaches the user on every adapter, not only Gemini', () => {
  it('OpenAI names the retired model from its own error body', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'The model `gpt-4o-mini` does not exist' } }),
          { status: 404 },
        ),
    );
    const err = await textError(makeOpenAICompatBackend('openai'));
    expect(err.message).toContain('does not exist');
    expect(err.message).not.toContain('{');
  });

  it('Anthropic names the cause from its own error body', async () => {
    setFetchHandler(
      async () =>
        new Response(JSON.stringify({ error: { message: 'credit balance is too low' } }), {
          status: 400,
        }),
    );
    const err = await textError(new AnthropicBackend());
    expect(err.message).toContain('credit balance is too low');
    expect(err.message).not.toContain('{');
    expect(err.code).toBe('QUOTA');
  });

  it('OpenAI out of quota is QUOTA, not a rate limit worth retrying', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'You exceeded your current quota',
              type: 'insufficient_quota',
              code: 'insufficient_quota',
            },
          }),
          { status: 429 },
        ),
    );
    const err = await textError(makeOpenAICompatBackend('openai'));
    expect(err.code).toBe('QUOTA');
    expect(err.message).toContain('out of credit');
  });
});
