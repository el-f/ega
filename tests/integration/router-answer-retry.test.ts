import { describe, expect, it } from 'vitest';
import { createRouter } from '@/background/router';
import { emitTerminal, type TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { sel } from '@tests/_helpers/lang';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps, mkSettings } from '@tests/_helpers/router';
import { errorCopy } from '@/shared/error-copy';

async function run(
  samples: string[],
  fallback?: string,
  options: { partial?: boolean; custom?: boolean; rejectAfterFormat?: boolean } = {},
) {
  const calls: string[] = [];
  const backend = (id: 'anthropic' | 'openai'): TranslationBackend => ({
    id: asBackendIdUnsafe(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    async translate({ req, onChunk }) {
      calls.push(id);
      const raw = id === 'openai' ? (fallback ?? '') : (samples.shift() ?? '');
      onChunk({ type: 'delta', requestId: req.id, text: raw });
      if (options.partial)
        onChunk({ type: 'error', requestId: req.id, code: 'PARSE', message: 'Bad reply' });
      else emitTerminal(onChunk, req.id, 'Test backend', raw);
      if (options.rejectAfterFormat) {
        onChunk({ type: 'delta', requestId: req.id, text: 'Late delta' });
        throw new Error('Late transport rejection');
      }
    },
  });
  const router = createRouter(
    baseDeps({
      backends: [backend('anthropic'), ...(fallback === undefined ? [] : [backend('openai')])],
      getSettings: async () =>
        mkSettings({
          streamingFlushMs: 0,
          openaiApiKey: 'k',
          backendOrder: ['anthropic', 'openai'].map(asBackendIdUnsafe),
        }),
      getCustomTasks: async () => [
        {
          id: 'custom',
          label: 'Custom',
          system: '',
          user: '{{text}}',
          output: 'plain',
          image: false,
          pageContext: false,
          glossary: false,
          createdAt: 1,
        },
      ],
    }),
  );
  const chunks: TranslationChunk[] = [];
  await router.handleTranslate(
    {
      id: 'r',
      text: 'hello',
      sourceLang: sel('en'),
      targetLang: sel('he'),
      options: { stream: true, explain: false, ...(options.custom ? { task: 'custom' } : {}) },
    },
    (c) => chunks.push(c),
  );
  return { calls, chunks };
}

describe('answer format recovery', () => {
  it('retries a malformed envelope once without showing the error', async () => {
    const { calls, chunks } = await run(['{"unknown":1}', '{"translation":"Recovered"}']);
    expect(calls).toEqual(['anthropic', 'anthropic']);
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(chunks.find((c) => c.type === 'done')).toMatchObject({ text: 'Recovered' });
  });

  it('rotates after the second malformed answer and keeps both attempts in the record', async () => {
    const { calls, chunks } = await run(
      ['{"unknown":1}', '{"unknown":2}'],
      '{"translation":"Fallback"}',
    );
    expect(calls).toEqual(['anthropic', 'anthropic', 'openai']);
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(chunks.find((c) => c.type === 'done')).toMatchObject({
      text: 'Fallback',
      meta: {
        attempts: [
          { backendId: 'anthropic', code: 'PARSE' },
          { backendId: 'anthropic', code: 'PARSE' },
          { backendId: 'openai', status: 'ok' },
        ],
      },
    });
  });

  it('names an empty reply after one silent retry', async () => {
    const { calls, chunks } = await run(['', '']);
    expect(calls).toEqual(['anthropic', 'anthropic']);
    const error = chunks.find((c) => c.type === 'error');
    expect(error).toMatchObject({ code: 'EMPTY' });
    expect(error && errorCopy(error.code, error.message)?.title).toBe('Empty answer');
  });

  it('never retries or rotates after visible text', async () => {
    const { calls, chunks } = await run(['Partial answer'], 'Fallback', { partial: true });
    expect(calls).toEqual(['anthropic']);
    expect(chunks.filter((c) => c.type === 'delta')).toMatchObject([{ text: 'Partial answer' }]);
    expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'PARSE' });
  });

  it('offers Tasks for a custom format and caps the raw answer shown in Details', async () => {
    const raw = JSON.stringify({ unknown: Array.from({ length: 1300 }, () => 123) });
    const { chunks } = await run([raw, raw], undefined, { custom: true });
    const error = chunks.find((c) => c.type === 'error');
    if (!error) throw new Error('no format error');
    const copy = errorCopy(error.code, error.message, { backend: 'Anthropic' });
    expect(copy).toMatchObject({
      title: 'Answer in wrong format',
      tab: 'tasks',
      actions: ['try-again', 'open-settings'],
    });
    expect(error.message).toContain(raw.slice(0, 2000));
    expect(error.message).not.toContain(raw.slice(0, 2001));
  });

  it('ignores late chunks and throws after a terminal decision, including before a retry', async () => {
    const { calls, chunks } = await run(
      ['{"unknown":1}', '{"translation":"Recovered"}'],
      undefined,
      { rejectAfterFormat: true },
    );
    expect(calls).toEqual(['anthropic', 'anthropic']);
    expect(chunks.filter((c) => c.type === 'delta')).toMatchObject([{ text: 'Recovered' }]);
    expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
  });

  it('keeps a prose answer and explains its missing metadata in About', async () => {
    const { calls, chunks } = await run(['Plain answer']);
    expect(calls).toEqual(['anthropic']);
    expect(chunks.find((c) => c.type === 'done')).toMatchObject({
      text: 'Plain answer',
      meta: {
        answerFormat: {
          issues: expect.arrayContaining([
            'The model answered in plain text, so there is no confidence or language.',
          ]),
        },
      },
    });
  });
});
