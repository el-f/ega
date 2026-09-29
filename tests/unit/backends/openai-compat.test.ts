import { describe, it, expect } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import { sse } from '@tests/_helpers/backend';

const baseConfig = {
  apiKeys: { openai: 'sk-custom' },
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

const SSE = [
  'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"hello\\","}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"\\"confidence\\":0.9}"}}]}\n\n',
  'data: [DONE]\n\n',
].join('');

describe('OpenAICompatBackend', () => {
  it('throws on an unknown profile id (loud module-load failure)', () => {
    expect(() => makeOpenAICompatBackend('does-not-exist')).toThrow(/unknown provider profile/);
  });

  describe('reasoning-model request sanitization (single source: resolveSamplingSupport)', () => {
    async function captureBody(
      profileId: string,
      cfg: TranslateCallArgs['config'],
    ): Promise<Record<string, unknown>> {
      let sent: Record<string, unknown> = {};
      setFetchHandler(async (_url, init) => {
        sent = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return sse(SSE);
      });
      await makeOpenAICompatBackend(profileId).translate(mkArgs({ config: cfg }));
      return sent;
    }

    const reasoningCfg = (model: string): TranslateCallArgs['config'] => ({
      ...baseConfig,
      model: { ...baseConfig.model, openai: model },
      advanced: { ...baseConfig.advanced, reasoningEffort: 'high' as const },
    });

    it('openai + reasoning model: drops temperature/max_tokens, sends max_completion_tokens + reasoning_effort', async () => {
      const body = await captureBody('openai', reasoningCfg('o3-mini'));
      expect(body['temperature']).toBeUndefined();
      expect(body['max_tokens']).toBeUndefined();
      expect(body['max_completion_tokens']).toBe(777);
      expect(body['reasoning_effort']).toBe('high');
      // regression: stream usage opt-in survives the sanitization
      expect(body['stream_options']).toEqual({ include_usage: true });
    });

    it('openai + gpt-5: same reasoning shape', async () => {
      const body = await captureBody('openai', reasoningCfg('gpt-5'));
      expect(body['temperature']).toBeUndefined();
      expect(body['max_tokens']).toBeUndefined();
      expect(body['max_completion_tokens']).toBe(777);
      expect(body['reasoning_effort']).toBe('high');
    });

    it('openai + classic chat model: unchanged shape (temperature + max_tokens, no reasoning)', async () => {
      const body = await captureBody('openai', {
        ...baseConfig,
        model: { ...baseConfig.model, openai: 'gpt-4o' },
      });
      expect(body['temperature']).toBe(0.3);
      expect(body['max_tokens']).toBe(777);
      expect(body['max_completion_tokens']).toBeUndefined();
      expect(body['reasoning_effort']).toBeUndefined();
    });

    it('groq + reasoning-shaped model: unchanged (v1 scope gate — no reasoning sanitization)', async () => {
      const cfg: TranslateCallArgs['config'] = {
        ...baseConfig,
        apiKeys: { groq: 'gsk_x' },
        model: { ...baseConfig.model, groq: 'o3-mini' },
        advanced: { ...baseConfig.advanced, reasoningEffort: 'high' as const },
      };
      const body = await captureBody('groq', cfg);
      expect(body['temperature']).toBe(0.3);
      expect(body['max_tokens']).toBe(777);
      expect(body['max_completion_tokens']).toBeUndefined();
      expect(body['reasoning_effort']).toBeUndefined();
    });
  });
});
