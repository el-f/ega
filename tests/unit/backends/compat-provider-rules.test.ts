import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { getProfile } from '@/shared/backends/provider-profiles';
import { resolveSamplingSupport } from '@/shared/backends/sampling-caps';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { BackendConfig, TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { sse } from '@tests/_helpers/backend';

const DONE_SSE = [
  'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"hi\\"}"}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
  'data: [DONE]\n\n',
].join('');

function config(backend: string, model: string, over: Partial<BackendConfig['advanced']> = {}) {
  return {
    apiKeys: { [backend]: 'key' },
    model: { [backend]: model },
    advanced: {
      promptTemplate: { system: 's', user: 'u' },
      perPresetTemplates: {},
      temperature: 0.3,
      maxTokens: 777,
      effort: 'high' as const,
      ...over,
    },
  } as unknown as BackendConfig;
}

function args(
  cfg: BackendConfig,
  onChunk: (c: TranslationChunk) => void = () => {},
): TranslateCallArgs {
  return {
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
    onChunk,
    config: cfg,
  };
}

async function body(backend: string, cfg: BackendConfig): Promise<Record<string, unknown>> {
  let sent: Record<string, unknown> = {};
  setFetchHandler(async (_url, init) => {
    sent = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return sse(DONE_SSE);
  });
  await makeOpenAICompatBackend(backend).translate(args(cfg));
  return sent;
}

describe('per-provider request rules', () => {
  it('OpenAI: max_completion_tokens for every model, and store: false', async () => {
    const b = await body('openai', config('openai', 'gpt-4o-mini'));
    expect(b['max_completion_tokens']).toBe(777);
    expect(b).not.toHaveProperty('max_tokens');
    expect(b['store']).toBe(false);
  });

  it.each(['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-luna', 'gpt-5.5'])(
    'OpenAI %s is a reasoning model: no temperature, the user effort',
    async (model) => {
      const b = await body('openai', config('openai', model));
      expect(b).not.toHaveProperty('temperature');
      expect(b['reasoning_effort']).toBe('high');
    },
  );

  it('OpenAI at Off: none where the model has it, else its lowest level, and no thinking room', async () => {
    const luna = await body('openai', config('openai', 'gpt-6-luna', { effort: 'off' }));
    expect(luna['reasoning_effort']).toBe('none');
    expect(luna['max_completion_tokens']).toBe(777);
    const astra = await body('openai', config('openai', 'gpt-6-astra', { effort: 'off' }));
    expect(astra['reasoning_effort']).toBe('low');
    expect(astra['max_completion_tokens']).toBe(777 + 2048);
  });

  it('OpenRouter at Off sends no effort; at Medium it sends medium', async () => {
    const off = await body(
      'openrouter',
      config('openrouter', 'openai/gpt-4o-mini', { effort: 'off' }),
    );
    expect(off).not.toHaveProperty('reasoning_effort');
    const mid = await body(
      'openrouter',
      config('openrouter', 'openai/gpt-4o-mini', { effort: 'medium' }),
    );
    expect(mid['reasoning_effort']).toBe('medium');
  });

  it('OpenAI chat-latest gets neither temperature nor effort', async () => {
    const b = await body('openai', config('openai', 'chat-latest'));
    expect(b).not.toHaveProperty('temperature');
    expect(b).not.toHaveProperty('reasoning_effort');
  });

  it('DeepSeek: thinking off, no effort, and max_tokens', async () => {
    const b = await body('deepseek', config('deepseek', 'deepseek-flash'));
    expect(b['thinking']).toEqual({ type: 'disabled' });
    expect(b).not.toHaveProperty('reasoning_effort');
    expect(b['max_tokens']).toBe(777);
    expect(b).not.toHaveProperty('store');
  });

  it('Mistral: no stream_options, temperature clamped to 1.5', async () => {
    const b = await body('mistral', config('mistral', 'mistral-small-latest', { temperature: 2 }));
    expect(b).not.toHaveProperty('stream_options');
    expect(b['temperature']).toBe(1.5);
    expect(b['max_tokens']).toBe(777);
  });

  it.each([
    ['groq', 'openai/gpt-oss-120b'],
    ['together', 'openai/gpt-oss-120b'],
    ['fireworks', 'accounts/fireworks/models/gpt-oss-120b'],
    ['openrouter', 'openai/gpt-oss-20b'],
  ])(
    '%s gpt-oss: the user effort, temperature kept, max_tokens not max_completion_tokens',
    async (backend, model) => {
      const b = await body(backend, config(backend, model));
      expect(b['reasoning_effort']).toBe('high');
      expect(b['temperature']).toBe(0.3);
      // The answer's 777 plus room for High thinking.
      expect(b['max_tokens']).toBe(777 + 8192);
      expect(b).not.toHaveProperty('max_completion_tokens');
    },
  );

  it('a non-OpenAI provider never gets max_completion_tokens, even for a reasoning-shaped id', async () => {
    const b = await body('groq', config('groq', 'o3-mini'));
    expect(b['max_tokens']).toBe(777);
    expect(b).not.toHaveProperty('max_completion_tokens');
    expect(b).not.toHaveProperty('reasoning_effort');
  });
});

describe('stream parsing', () => {
  it('reads the text parts of a list-shaped delta and skips the thinking part', async () => {
    setFetchHandler(async () =>
      sse(
        [
          'data: {"choices":[{"delta":{"content":[{"type":"thinking","thinking":[{"type":"text","text":"hmm"}]}]}}]}\n\n',
          'data: {"choices":[{"delta":{"content":[{"type":"thinking","thinking":[]},{"type":"text","text":"{\\"translation\\":"}]}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"\\"hi\\"}"},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ].join(''),
      ),
    );
    const chunks: TranslationChunk[] = [];
    await makeOpenAICompatBackend('mistral').translate(
      args(config('mistral', 'mistral-small-latest'), (c) => chunks.push(c)),
    );
    const streamed = chunks.map((c) => (c.type === 'delta' ? c.text : '')).join('');
    expect(streamed).toBe('{"translation":"hi"}');
    expect(streamed).not.toContain('hmm');
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it.each(['insufficient_system_resource', 'aborted', 'error'])(
    'finish_reason %s is a server error, not a finished answer',
    async (finish) => {
      setFetchHandler(async () =>
        sse(
          [
            'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"hal"}}]}\n\n',
            `data: {"choices":[{"delta":{},"finish_reason":"${finish}"}]}\n\n`,
            'data: [DONE]\n\n',
          ].join(''),
        ),
      );
      const chunks: TranslationChunk[] = [];
      await makeOpenAICompatBackend('deepseek').translate(
        args(config('deepseek', 'deepseek-flash'), (c) => chunks.push(c)),
      );
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' ? err.code : null).toBe('SERVER');
      expect(chunks.some((c) => c.type === 'done')).toBe(false);
    },
  );
});

describe('defaults and model pickers', () => {
  it.each([
    ['groq', 'openai/gpt-oss-120b'],
    ['deepseek', 'deepseek-flash'],
    ['fireworks', 'accounts/fireworks/models/gpt-oss-120b'],
  ])('%s defaults to %s', (id, model) => {
    expect(getProfile(id)?.defaultModel).toBe(model);
  });

  it('OpenAI keeps chat models and drops the rest', () => {
    const keep = getProfile('openai')?.discoverFilter;
    if (!keep) throw new Error('openai has no filter');
    const ids = [
      'gpt-6-luna',
      'gpt-4o-mini',
      'o3',
      'o4-mini-2025-04-16',
      'chat-latest',
      'gpt-image-2',
      'gpt-realtime',
      'gpt-4o-mini-tts',
      'gpt-4o-transcribe',
      'gpt-6-sol-pro',
      'gpt-5.3-codex',
      'o3-deep-research',
      'omni-moderation-latest',
      'chatgpt-image-latest',
      'gpt-oss-120b',
      'text-embedding-3-small',
    ];
    expect(ids.filter(keep)).toEqual([
      'gpt-6-luna',
      'gpt-4o-mini',
      'o3',
      'o4-mini-2025-04-16',
      'chat-latest',
    ]);
  });

  it('OpenRouter hides the :batch variants', () => {
    const keep = getProfile('openrouter')?.discoverFilter;
    if (!keep) throw new Error('openrouter has no filter');
    expect(['openai/gpt-6-luna', 'openai/gpt-6-luna:batch'].filter(keep)).toEqual([
      'openai/gpt-6-luna',
    ]);
  });

  it('Groq hides speech, guard and safeguard models', () => {
    const keep = getProfile('groq')?.discoverFilter;
    if (!keep) throw new Error('groq has no filter');
    const ids = [
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'whisper-large-v3',
      'canopylabs/orpheus-v1-english',
      'meta-llama/llama-prompt-guard-2-86m',
      'openai/gpt-oss-safeguard-20b',
    ];
    expect(ids.filter(keep)).toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
  });

  it('the Options UI sees the same effort switch the adapter sends', () => {
    expect(resolveSamplingSupport('groq', 'openai/gpt-oss-120b').efforts).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(resolveSamplingSupport('deepseek', 'deepseek-flash').efforts).toEqual([]);
    expect(resolveSamplingSupport('openai', 'chat-latest')).toEqual({
      temperature: false,
      maxTokens: true,
      efforts: [],
    });
  });
});
