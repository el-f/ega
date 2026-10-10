import { describe, expect, it } from 'vitest';
import { createRouter } from '@/background/router';
import { TranslationCache } from '@/background/cache';
import { emitTerminal, type TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { sel } from '@tests/_helpers/lang';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps, mkSettings } from '@tests/_helpers/router';

function fixture(raw: string, custom = false) {
  let calls = 0;
  const backend: TranslationBackend = {
    id: asBackendIdUnsafe('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    async translate({ req, onChunk }) {
      calls++;
      onChunk({ type: 'delta', requestId: req.id, text: raw });
      emitTerminal(onChunk, req.id, 'Test backend', raw);
    },
  };
  const router = createRouter(
    baseDeps({
      backends: [backend],
      cache: new TranslationCache(),
      getSettings: async () => mkSettings({ streamingFlushMs: 0 }),
      getCustomTasks: async () => [
        {
          id: 'custom',
          label: 'Custom',
          system: '',
          user: '{{text}}',
          output: 'card',
          image: false,
          pageContext: false,
          glossary: false,
          createdAt: 1,
        },
      ],
    }),
  );
  return {
    calls: () => calls,
    async run(id: string) {
      const chunks: TranslationChunk[] = [];
      await router.handleTranslate(
        {
          id,
          text: 'hello',
          sourceLang: sel('en'),
          targetLang: sel('he'),
          options: { stream: true, explain: false, ...(custom ? { task: 'custom' } : {}) },
        },
        (c) => chunks.push(c),
      );
      return chunks;
    },
  };
}

describe('router answer spec terminal', () => {
  it('computes the final answer and metadata from raw text once in the worker', async () => {
    const f = fixture('{"Translation":"Hello","confidence":"85%","detectedLang":"en"}');
    const chunks = await f.run('live');
    expect(chunks.find((c) => c.type === 'done')).toMatchObject({
      text: 'Hello',
      confidence: 0.85,
      detectedLang: 'en',
      meta: { answerFormat: { spec: 'translate@1', checkedBy: 'prompt' } },
    });
    expect(chunks[0]).toMatchObject({ type: 'delta', text: 'Hello' });
  });

  it('replays custom notes and other fields from cache without asking the backend again', async () => {
    const f = fixture('{"answer":"Hello","explain":["One","Two"],"tags":["a","b"]}', true);
    const live = (await f.run('live')).find((c) => c.type === 'done');
    expect(live).toMatchObject({
      text: 'Hello',
      explain: 'One\nTwo',
      notes: [{ key: 'explain', label: 'Notes', text: 'One\nTwo' }],
      details: [{ key: 'tags', label: 'Other fields: tags', value: ['a', 'b'] }],
    });
    const hit = (await f.run('hit')).find((c) => c.type === 'done');
    expect(hit).toMatchObject({
      text: live?.text,
      notes: live?.notes,
      details: live?.details,
      meta: { cacheHit: true, answerFormat: { spec: 'answer-notes@1', checkedBy: 'prompt' } },
    });
    expect(f.calls()).toBe(1);
  });
});
