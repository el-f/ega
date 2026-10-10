import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { CUSTOM_PRESETS } from '@/shared/answer/spec';
import {
  clearRejectedSchemas,
  structuredOutput,
  hasConflictingFormat,
} from '@/shared/backends/structured-output';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { GeminiBackend } from '@/shared/backends/gemini';
import { TRANSLATE_SPEC } from '@/shared/answer/spec';
import { resetOpenRouterReasoningForTest } from '@/shared/backends/openrouter-reasoning';
import { setFetchHandler } from '@tests/mocks/fetch';
import { buildBackendConfig } from '@/shared/backends/build-config';
import type { TranslateCallArgs } from '@/shared/backends/base';
import { mkSettings } from '@tests/_helpers/router';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';

// Exercise the prepared request shapes; production enables only live-verified providers.
vi.mock('@/shared/backends/schema-gates', () => ({
  LIVE_SCHEMA_BACKENDS: new Set(['anthropic', 'openai', 'mistral', 'xai', 'openrouter', 'gemini']),
}));

const mkArgs = (over: Partial<TranslateCallArgs> = {}): TranslateCallArgs => ({
  req: {
    id: 'r',
    text: 'hello',
    sourceLang: sel('en'),
    targetLang: sel('he'),
    options: { stream: true, explain: false },
  },
  system: 'SYS',
  user: 'USER',
  stream: true,
  cancel: noopCancel(),
  onChunk: () => {},
  config: buildBackendConfig(mkSettings()),
  ...over,
});

beforeEach(() => {
  clearRejectedSchemas();
  resetOpenRouterReasoningForTest();
});

describe('native answer schemas', () => {
  it('leaves the pinned format alone, but respects a user format directive', () => {
    const pinned = TRANSLATE_SPEC.pinned.text;
    expect(hasConflictingFormat({ system: pinned, user: 'Translate {text}' }, TRANSLATE_SPEC)).toBe(
      false,
    );
    expect(
      hasConflictingFormat({ system: pinned, user: 'Return Markdown only.' }, TRANSLATE_SPEC),
    ).toBe(true);
    expect(
      hasConflictingFormat({ system: 'Use {"answer": "..."}', user: '' }, TRANSLATE_SPEC),
    ).toBe(true);
  });

  it.each(['openai', 'mistral', 'xai'] as const)(
    'sends a strict schema with unchanged prompts for %s',
    async (backend) => {
      let payload: Record<string, unknown> = {};
      setFetchHandler(async (_url, init) => {
        payload = JSON.parse(String(init?.body));
        return Response.json({ choices: [{ message: { content: '{"translation":"Hello"}' } }] });
      });
      const args = mkArgs({ stream: false });
      args.config.apiKeys[backend] = 'test-key';
      args.config.model[backend] = backend === 'openai' ? 'gpt-4o-mini' : 'latest';
      let accepted = false;
      await makeOpenAICompatBackend(backend).translate({
        ...args,
        answerFormat: {
          spec: CUSTOM_PRESETS['answer-notes'],
          explain: false,
          onAccepted: () => {
            accepted = true;
          },
        },
      });
      expect(payload['messages']).toEqual([
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' },
      ]);
      expect(payload['response_format']).toMatchObject({
        type: 'json_schema',
        json_schema: {
          name: 'ega_answer',
          strict: true,
          schema: {
            additionalProperties: false,
            required: ['translation', 'explain'],
            properties: { explain: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
          },
        },
      });
      expect(accepted).toBe(true);
    },
  );

  it.each([
    ['gemini-3.8-flash', 'responseJsonSchema'],
    ['gemini-2.0-flash', 'responseSchema'],
  ])('uses the schema field for %s', async (model, field) => {
    let payload: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({
        candidates: [{ content: { parts: [{ text: '{"translation":"Hello"}' }] } }],
      });
    });
    const args = mkArgs({ stream: false });
    args.config.model.gemini = model;
    args.config.apiKeys.gemini = 'test-key';
    await new GeminiBackend().translate({
      ...args,
      answerFormat: { spec: TRANSLATE_SPEC, explain: false },
    });
    expect(payload['systemInstruction']).toEqual({ parts: [{ text: 'SYS' }] });
    const generation = payload['generationConfig'] as Record<string, unknown>;
    expect(generation[field]).toMatchObject({
      type: 'object',
      required: ['translation', 'confidence'],
    });
    expect(
      generation[field === 'responseSchema' ? 'responseJsonSchema' : 'responseSchema'],
    ).toBeUndefined();
    if (field === 'responseSchema')
      expect(generation[field]).not.toHaveProperty('additionalProperties');
  });

  it('uses OpenRouter schemas only for a listed model and requires a supporting endpoint', async () => {
    const chats: Record<string, unknown>[] = [];
    let lists = 0;
    setFetchHandler(async (url, init) => {
      if (url.includes('/api/v1/models')) {
        lists++;
        return Response.json({
          data: [
            { id: 'provider/yes', supported_parameters: ['structured_outputs'] },
            { id: 'provider/no', supported_parameters: ['response_format'] },
          ],
        });
      }
      chats.push(JSON.parse(String(init?.body)));
      return Response.json({ choices: [{ message: { content: '{"translation":"Hello"}' } }] });
    });
    const args = mkArgs({ stream: false });
    args.config.apiKeys.openrouter = 'test-key';
    const backend = makeOpenAICompatBackend('openrouter');
    for (const model of ['provider/yes:nitro', 'provider/no', 'provider/unknown']) {
      args.config.model.openrouter = model;
      await backend.translate({ ...args, answerFormat: { spec: TRANSLATE_SPEC, explain: false } });
    }
    expect(lists).toBe(1);
    expect(chats[0]?.['response_format']).toHaveProperty('type', 'json_schema');
    expect(chats[0]?.['provider']).toEqual({ require_parameters: true });
    expect(chats[1]?.['response_format']).toBeUndefined();
    expect(chats[2]?.['response_format']).toBeUndefined();
  });
  it('keeps unsupported backends and local models prompt-only until their live gate', () => {
    for (const backend of [
      'native',
      'deepseek',
      'groq',
      'together',
      'fireworks',
      'ollama',
      'localserver',
    ]) {
      expect(structuredOutput(backend, 'any')).toBeNull();
    }
    expect(structuredOutput('anthropic', 'claude-3-haiku-20240307')).toBeNull();
    expect(structuredOutput('anthropic', 'claude-haiku-4-5-20251001')).toBe('anthropic');
  });

  it('merges the Anthropic schema with effort and reports backend checking', async () => {
    let payload: Record<string, unknown> | undefined;
    setFetchHandler(async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({
        content: [{ text: '{"translation":"Hello"}' }],
        stop_reason: 'end_turn',
      });
    });
    let checked = false;
    const args = mkArgs({ stream: false });
    args.config.model.anthropic = 'claude-sonnet-4-6';
    args.config.advanced.effort = 'low';
    await new AnthropicBackend().translate({
      ...args,
      answerFormat: {
        spec: CUSTOM_PRESETS['answer-only'],
        explain: false,
        onAccepted: () => {
          checked = true;
        },
      },
    });
    expect(payload?.['output_config']).toMatchObject({
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { translation: { type: 'string' } },
          required: ['translation'],
          additionalProperties: false,
        },
      },
    });
    expect(checked).toBe(true);
  });

  it('retries a schema 400 once without the schema and remembers the backend/model', async () => {
    const payloads: Record<string, unknown>[] = [];
    setFetchHandler(async (_url, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return payloads.length === 1
        ? new Response('{"error":{"message":"output_config.format schema is unsupported"}}', {
            status: 400,
          })
        : Response.json({
            content: [{ text: '{"translation":"Hello"}' }],
            stop_reason: 'end_turn',
          });
    });
    let checked = 0;
    const args = mkArgs({ stream: false });
    args.config.model.anthropic = 'claude-sonnet-4-6';
    args.config.advanced.effort = 'low';
    const request = {
      ...args,
      answerFormat: {
        spec: CUSTOM_PRESETS['answer-only'],
        explain: false,
        onAccepted: () => {
          checked++;
        },
      },
    };
    await new AnthropicBackend().translate(request);
    await new AnthropicBackend().translate(request);
    expect(payloads).toHaveLength(3);
    expect(payloads[0]?.['output_config']).toHaveProperty('format');
    expect(payloads[1]?.['output_config']).toEqual({ effort: 'low' });
    expect(payloads[2]?.['output_config']).toEqual({ effort: 'low' });
    expect(checked).toBe(0);
  });

  it('does not retry an unrelated 400 or remember it as a schema failure', async () => {
    let calls = 0;
    setFetchHandler(async () => {
      calls++;
      return new Response('max_tokens must be positive', { status: 400 });
    });
    const args = mkArgs({ stream: false });
    args.config.model.anthropic = 'claude-haiku-4-5';
    await new AnthropicBackend().translate({
      ...args,
      answerFormat: {
        spec: CUSTOM_PRESETS['answer-only'],
        explain: false,
      },
    });
    expect(calls).toBe(1);
    expect(structuredOutput('anthropic', 'claude-haiku-4-5')).toBe('anthropic');
  });
});
