import { describe, it, expect, beforeEach } from 'vitest';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import { sel } from '@tests/_helpers/lang';
import {
  fetchOllamaModelCaps,
  ollamaBaseUrl,
  ollamaEfforts,
  ollamaModelLabel,
  ollamaNumCtx,
  ollamaThink,
  parseOllamaTags,
  resetOllamaModelCapsForTest,
} from '@/shared/backends/ollama-show';
import { OllamaBackend } from '@/shared/backends/ollama';
import { errorCopy } from '@/shared/error-copy';
import type { BackendConfig, TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

// Shapes read off Ollama 0.34.4 on 2026-10-02: gemma4:e4b, llama3.2:3b, qwen2.5:0.5b.
const GEMMA4 = {
  capabilities: ['completion', 'vision', 'audio', 'tools', 'thinking'],
  thinking: { values: [false, true], default: true },
  model_info: { 'gemma4.context_length': 131072 },
};
const LLAMA32 = {
  capabilities: ['completion', 'tools'],
  thinking: { values: [false], default: false },
  model_info: { 'llama.context_length': 131072 },
};
const QWEN25 = {
  capabilities: ['completion', 'tools'],
  model_info: { 'qwen2.context_length': 32768 },
};

const BASE = 'http://127.0.0.1:11434';

function serveShow(body: unknown, chat?: (b: Record<string, unknown>) => Response) {
  const chats: Array<Record<string, unknown>> = [];
  setFetchHandler(async (url, init) => {
    if (url.endsWith('/api/show')) return Response.json(body);
    const b = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    chats.push(b);
    return chat
      ? chat(b)
      : new Response('{"message":{"content":"{\\"translation\\":\\"hi\\"}"},"done":true}\n', {
          status: 200,
        });
  });
  return chats;
}

const config = (effort: 'off' | 'low' | 'medium' | 'high'): BackendConfig =>
  ({
    apiKeys: {},
    model: { ollama: 'gemma4:e4b' },
    advanced: { temperature: 0.2, maxTokens: 1000, effort },
  }) as unknown as BackendConfig;

const args = (
  cfg: BackendConfig,
  onChunk: (c: TranslationChunk) => void = () => {},
): TranslateCallArgs => ({
  req: {
    id: 'r1',
    text: 'hola',
    sourceLang: sel('auto'),
    targetLang: sel('en'),
    options: { stream: true, explain: false },
  },
  system: 'S',
  user: 'U',
  stream: true,
  cancel: noopCancel(),
  onChunk,
  config: cfg,
});

beforeEach(() => {
  resetOllamaModelCapsForTest();
});

describe('reading /api/show', () => {
  it('reads vision, the thinking values and the context length', async () => {
    serveShow(GEMMA4);
    expect(await fetchOllamaModelCaps(BASE, 'gemma4:e4b', 800)).toEqual({
      vision: true,
      thinkingValues: [false, true],
      contextLength: 131072,
    });
  });

  it('a daemon without the thinking field falls back to the capability list', async () => {
    serveShow(QWEN25);
    expect(await fetchOllamaModelCaps(BASE, 'qwen2.5:0.5b', 800)).toEqual({
      vision: false,
      thinkingValues: [false],
      contextLength: 32768,
    });
  });

  it('a failed lookup is null and is asked again next time', async () => {
    setFetchHandler(async () => new Response('', { status: 500 }));
    expect(await fetchOllamaModelCaps(BASE, 'x', 800)).toBeNull();
    serveShow(LLAMA32);
    expect((await fetchOllamaModelCaps(BASE, 'x', 800))?.vision).toBe(false);
  });
});

describe('Effort on Ollama', () => {
  it('an on/off thinker offers Off and High; level names come through as they are', () => {
    expect(ollamaEfforts({ thinkingValues: [false, true] })).toEqual(['off', 'high']);
    expect(ollamaEfforts({ thinkingValues: ['low', 'medium', 'high'] })).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(ollamaEfforts({ thinkingValues: [false] })).toEqual([]);
    expect(ollamaEfforts(null)).toEqual([]);
  });

  it('maps the asked level to think, false when unknown', () => {
    expect(ollamaThink({ thinkingValues: [false, true] }, 'off').think).toBe(false);
    expect(ollamaThink({ thinkingValues: [false, true] }, 'high').think).toBe(true);
    expect(ollamaThink({ thinkingValues: ['low', 'medium', 'high'] }, 'off').think).toBe('low');
    expect(ollamaThink({ thinkingValues: ['low', 'medium', 'high'] }, 'medium').think).toBe(
      'medium',
    );
    expect(ollamaThink(null, 'high').think).toBe(false);
  });

  it('context is fixed at 8192, or the model length when that is smaller', () => {
    expect(ollamaNumCtx({ contextLength: 131072 })).toBe(8192);
    expect(ollamaNumCtx({ contextLength: 4096 })).toBe(4096);
    expect(ollamaNumCtx(null)).toBe(8192);
  });
});

describe('the /api/chat request', () => {
  it('at Off sends think false, the temperature, the answer length, a fixed context and no truncation', async () => {
    const chats = serveShow(GEMMA4);
    await new OllamaBackend().translate(args(config('off')));
    expect(chats[0]).toMatchObject({ think: false, truncate: false });
    expect(chats[0]?.['options']).toEqual({ temperature: 0.2, num_predict: 1000, num_ctx: 8192 });
  });

  it('at High a thinking model thinks, with room on top that never outgrows the context', async () => {
    const chats = serveShow(GEMMA4);
    await new OllamaBackend().translate(args(config('high')));
    expect(chats[0]).toMatchObject({ think: true, shift: false });
    expect(chats[0]?.['options']).toEqual({ temperature: 0.2, num_predict: 8192, num_ctx: 8192 });
  });

  it('an answer that fills the context fails with a message that says so, not "raise the limit"', async () => {
    serveShow(
      GEMMA4,
      () =>
        new Response(
          '{"message":{"content":"{\\"translation\\":\\"ha"},"done":true,"done_reason":"length","prompt_eval_count":3000,"eval_count":5192}\n',
          { status: 200 },
        ),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(args(config('high'), (c) => chunks.push(c)));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('REQUEST');
    expect(err?.type === 'error' ? err.message : '').toMatch(
      /filled gemma4:e4b's context \(8192 tokens\)/,
    );
  });

  it('a length stop below the context is still the answer limit', async () => {
    serveShow(
      GEMMA4,
      () =>
        new Response(
          '{"message":{"content":""},"done":true,"done_reason":"length","prompt_eval_count":100,"eval_count":1000}\n',
          { status: 200 },
        ),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(args(config('off'), (c) => chunks.push(c)));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.message : '').toMatch(/max-tokens limit/);
  });

  it('a request longer than the context fails with a message that says so', async () => {
    serveShow(
      GEMMA4,
      () =>
        new Response(
          JSON.stringify({
            error:
              '{"error":{"code":400,"message":"request (12009 tokens) exceeds the available context size (8192 tokens), try increasing it","type":"exceed_context_size_error","n_prompt_tokens":12009,"n_ctx":8192}}',
          }),
          { status: 400 },
        ),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(args(config('off'), (c) => chunks.push(c)));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('REQUEST');
    expect(err?.type === 'error' ? err.message : '').toMatch(
      /longer than gemma4:e4b's context \(8192 tokens\)/,
    );
    // Its "Select less text" advice is what the shared error catalog reads.
    expect(errorCopy('REQUEST', err?.type === 'error' ? err.message : '')?.id).toBe(
      'REQUEST_TOO_LONG',
    );
  });
});

describe('the image chain', () => {
  it('keeps a vision model, drops a text-only one, and keeps one it cannot ask about', async () => {
    const b = new OllamaBackend();
    serveShow(GEMMA4);
    expect(await b.acceptsImages(config('off'))).toBe(true);
    resetOllamaModelCapsForTest();
    serveShow(LLAMA32);
    expect(await b.acceptsImages(config('off'))).toBe(false);
    resetOllamaModelCapsForTest();
    setFetchHandler(async () => new Response('', { status: 404 }));
    expect(await b.acceptsImages(config('off'))).toBe(true);
  });
});

describe('the model picker', () => {
  it('reads the tags Ollama lists for each model, and a cloud model by its remote host or name', () => {
    const rows = parseOllamaTags({
      models: [
        {
          name: 'gemma4:e4b',
          capabilities: ['completion', 'vision', 'audio', 'tools', 'thinking'],
        },
        { name: 'qwen2.5:0.5b', capabilities: ['completion', 'tools'] },
        { name: 'gpt-oss:120b', remote_host: 'https://ollama.com:443', capabilities: ['thinking'] },
        { name: 'kimi-k2:1t-cloud' },
        { name: '' },
        { capabilities: ['vision'] },
      ],
    });
    expect(rows.map(ollamaModelLabel)).toEqual([
      'gemma4:e4b (vision, thinking)',
      'qwen2.5:0.5b',
      'gpt-oss:120b (cloud, thinking)',
      'kimi-k2:1t-cloud (cloud)',
    ]);
    expect(parseOllamaTags({})).toEqual([]);
    expect(parseOllamaTags(null)).toEqual([]);
  });

  it('keeps every request on the loopback URL the settings name', () => {
    expect(ollamaBaseUrl(' http://127.0.0.1:11434/ ')).toBe(BASE);
    expect(ollamaBaseUrl('http://192.168.1.5:11434')).toBe('http://localhost:11434');
    expect(ollamaBaseUrl(undefined)).toBe('http://localhost:11434');
  });
});
