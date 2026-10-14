import { describe, it, expect } from 'vitest';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import { sel } from '@tests/_helpers/lang';
import { chromeMock } from '@tests/mocks/chrome';
import {
  fetchOpenRouterReasoning,
  openRouterEfforts,
  parseOpenRouterModels,
  resetOpenRouterReasoningForTest,
} from '@/shared/backends/openrouter-reasoning';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import type { BackendConfig, TranslateCallArgs } from '@/shared/backends/base';

const THINKS = ['reasoning', 'include_reasoning', 'reasoning_effort', 'max_tokens'];

// Rows read off https://openrouter.ai/api/v1/models on 2026-10-02 (reasoning and supported_parameters kept).
const LIST = {
  data: [
    {
      id: 'openai/gpt-6-luna',
      supported_parameters: THINKS,
      reasoning: {
        mandatory: false,
        default_enabled: true,
        supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low', 'none'],
        default_effort: 'medium',
      },
    },
    {
      id: 'google/gemini-3.8-flash',
      supported_parameters: THINKS,
      reasoning: {
        mandatory: true,
        default_enabled: true,
        supported_efforts: ['high', 'medium', 'low'],
        default_effort: 'medium',
      },
    },
    {
      id: 'google/gemini-3-flash-preview',
      supported_parameters: THINKS,
      reasoning: {
        mandatory: false,
        supported_efforts: ['high', 'medium', 'low', 'minimal'],
        default_effort: 'medium',
      },
    },
    {
      id: 'anthropic/claude-sonnet-4.6',
      supported_parameters: THINKS,
      reasoning: {
        mandatory: false,
        supported_efforts: ['max', 'high', 'medium', 'low'],
        default_effort: 'medium',
      },
    },
    {
      id: 'deepseek/deepseek-r1',
      supported_parameters: ['reasoning', 'include_reasoning'],
      reasoning: { mandatory: true },
    },
    {
      id: 'qwen/qwen3.8-flash',
      supported_parameters: ['reasoning', 'include_reasoning'],
      reasoning: { mandatory: false, default_enabled: true },
    },
    // A bare record: reasons, and the list says nothing else (o3, o1, o4-mini, claude-sonnet-4.5 ...).
    {
      id: 'openai/o3',
      supported_parameters: ['reasoning', 'include_reasoning'],
      reasoning: { mandatory: false },
    },
    { id: 'openai/gpt-4o-mini', supported_parameters: ['max_tokens', 'temperature'] },
  ],
};

const map = parseOpenRouterModels(LIST);
const efforts = (id: string) => openRouterEfforts(map[id] ?? null);

describe("OpenRouter's model list", () => {
  it('keeps each reasoning model as the list describes it, and the rest as null', () => {
    expect(map['openai/gpt-6-luna']).toEqual({
      mandatory: false,
      defaultOn: true,
      defaultEffort: 'medium',
      efforts: ['max', 'xhigh', 'high', 'medium', 'low', 'none'],
    });
    expect(map['deepseek/deepseek-r1']).toEqual({
      mandatory: true,
      defaultOn: undefined,
      defaultEffort: undefined,
      efforts: [],
    });
    expect(map['openai/gpt-4o-mini']).toBeNull();
    expect(parseOpenRouterModels({})).toEqual({});
  });

  it('offers Off wherever the model can be kept quiet, and only the levels it names', () => {
    expect(efforts('openai/gpt-6-luna')).toEqual(['off', 'low', 'medium', 'high']);
    expect(efforts('google/gemini-3.8-flash')).toEqual(['low', 'medium', 'high']);
    expect(efforts('google/gemini-3-flash-preview')).toEqual(['off', 'low', 'medium', 'high']);
    expect(efforts('anthropic/claude-sonnet-4.6')).toEqual(['off', 'low', 'medium', 'high']);
    // On or off, at its own level.
    expect(efforts('qwen/qwen3.8-flash')).toEqual(['off', 'high']);
    // Always thinks at a level nobody can set.
    expect(efforts('deepseek/deepseek-r1')).toEqual([]);
    // Levels nobody listed: every one goes, and OpenRouter maps it to the nearest the model takes.
    expect(efforts('openai/o3')).toEqual(['off', 'low', 'medium', 'high']);
    expect(efforts('openai/gpt-4o-mini')).toEqual([]);
  });

  it('reads the list once, keeps it in session storage, and finds a routing variant', async () => {
    let reads = 0;
    setFetchHandler(async () => {
      reads++;
      return Response.json(LIST);
    });
    expect((await fetchOpenRouterReasoning('openai/gpt-6-luna', 2000))?.defaultOn).toBe(true);
    expect((await fetchOpenRouterReasoning('openai/gpt-6-luna:nitro', 2000))?.defaultOn).toBe(true);
    expect(await fetchOpenRouterReasoning('openai/gpt-4o-mini', 2000)).toBeNull();
    expect(await fetchOpenRouterReasoning('vendor/newer-than-the-copy', 2000)).toBeUndefined();
    expect(reads).toBe(1);
    expect(chromeMock.storage.session._raw.has('ega.openrouterReasoning')).toBe(true);

    // A new service worker finds the list in session storage.
    resetOpenRouterReasoningForTest();
    expect((await fetchOpenRouterReasoning('google/gemini-3.8-flash', 2000))?.mandatory).toBe(true);
    expect(reads).toBe(1);
  });

  it('a list out of reach is undefined, and the wait before asking again survives a worker restart', async () => {
    let reads = 0;
    setFetchHandler(async () => {
      reads++;
      return new Response('', { status: 503 });
    });
    expect(await fetchOpenRouterReasoning('openai/gpt-6-luna', 2000)).toBeUndefined();
    resetOpenRouterReasoningForTest();
    expect(await fetchOpenRouterReasoning('openai/gpt-6-luna', 2000)).toBeUndefined();
    expect(reads).toBe(1);
  });
});

describe('an OpenRouter request', () => {
  const config = (model: string, effort: 'off' | 'low' | 'medium' | 'high'): BackendConfig =>
    ({
      apiKeys: { openrouter: 'or-key' },
      model: { openrouter: model },
      advanced: { temperature: 0.2, maxTokens: 1000, effort },
    }) as unknown as BackendConfig;

  const args = (cfg: BackendConfig): TranslateCallArgs => ({
    req: {
      id: 'r1',
      text: 'hola',
      sourceLang: sel('auto'),
      targetLang: sel('en'),
      options: { stream: false, explain: false },
    },
    system: 'S',
    user: 'U',
    stream: false,
    cancel: noopCancel(),
    onChunk: () => {},
    config: cfg,
  });

  async function send(
    model: string,
    effort: 'off' | 'low' | 'medium' | 'high',
    list: unknown = LIST,
  ): Promise<Record<string, unknown>> {
    let chat: Record<string, unknown> = {};
    setFetchHandler(async (url, init) => {
      if (url.includes('/api/v1/models')) {
        return list === null ? new Response('', { status: 503 }) : Response.json(list);
      }
      chat = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return Response.json({ choices: [{ message: { content: '{"translation":"hi"}' } }] });
    });
    await makeOpenAICompatBackend('openrouter').translate(args(config(model, effort)));
    return chat;
  }

  it.each([
    ['openai/gpt-6-luna', 'off', { reasoning_effort: 'none' }, 1000],
    ['google/gemini-3.8-flash', 'off', { reasoning_effort: 'low' }, 1000 + 2048],
    ['google/gemini-3-flash-preview', 'off', { reasoning_effort: 'minimal' }, 1000 + 2048],
    ['anthropic/claude-sonnet-4.6', 'off', { reasoning: { enabled: false } }, 1000 + 2048],
    ['anthropic/claude-sonnet-4.6', 'medium', { reasoning_effort: 'medium' }, 1000 + 4096],
    ['qwen/qwen3.8-flash', 'off', { reasoning: { enabled: false } }, 1000 + 2048],
    ['qwen/qwen3.8-flash', 'high', {}, 1000 + 8192],
    ['deepseek/deepseek-r1', 'low', {}, 1000 + 2048],
    ['deepseek/deepseek-r1', 'off', {}, 1000 + 2048],
    ['openai/o3', 'off', { reasoning: { enabled: false } }, 1000 + 2048],
    ['openai/o3', 'high', { reasoning_effort: 'high' }, 1000 + 8192],
    ['openai/gpt-4o-mini', 'high', {}, 1000],
  ] as const)('%s at %s sends %j with max_tokens %i', async (model, effort, fields, maxTokens) => {
    const chat = await send(model, effort);
    expect(chat['max_tokens']).toBe(maxTokens);
    for (const key of ['reasoning_effort', 'reasoning']) {
      expect(chat[key]).toEqual((fields as Record<string, unknown>)[key]);
    }
  });

  it('a model the list does not name yet, or no list at all, gets the level as before', async () => {
    expect(await send('vendor/newer-than-the-copy', 'high')).toMatchObject({
      reasoning_effort: 'high',
      max_tokens: 1000 + 8192,
    });
    resetOpenRouterReasoningForTest();
    chromeMock.storage.session._raw.clear();
    expect(await send('openai/gpt-4o-mini', 'high', null)).toMatchObject({
      reasoning_effort: 'high',
      max_tokens: 1000 + 8192,
    });
  });
});
