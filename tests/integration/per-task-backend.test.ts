import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import type { TranslationBackend, TranslateCallArgs } from '@/shared/backends/base';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps, mkSettings as mkRouterSettings } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkBackend(id: string): { backend: TranslationBackend; called: { count: number } } {
  const called = { count: 0 };
  const backend: TranslationBackend = {
    id: bid(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async (a: TranslateCallArgs) => {
      called.count += 1;
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: '{"translation":"X","confidence":1}',
      });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
  };
  return { backend, called };
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return mkRouterSettings({ openaiApiKey: 'k', geminiApiKey: 'k', ...patch });
}

describe('per-task-backend', () => {
  it('routes to override — explain task goes to openai when settings.backend is anthropic', async () => {
    const anthropic = mkBackend('anthropic');
    const openai = mkBackend('openai');
    const deps = baseDeps({
      backends: [anthropic.backend, openai.backend],
      getSettings: async () =>
        mkSettings({
          taskBackends: { explain: bid('openai') },
        }),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hello',
        sourceLang: sel('en'),
        targetLang: sel('ar'),
        options: { stream: true, explain: false, task: 'explain' },
      },
      () => {},
    );
    expect(openai.called.count).toBe(1);
    expect(anthropic.called.count).toBe(0);
  });

  it('falls back to settings.backend — translate task with no override stays on anthropic', async () => {
    const anthropic = mkBackend('anthropic');
    const openai = mkBackend('openai');
    const deps = baseDeps({
      backends: [anthropic.backend, openai.backend],
      getSettings: async () => mkSettings({ taskBackends: { explain: bid('openai') } }),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hello',
        sourceLang: sel('en'),
        targetLang: sel('ar'),
        options: { stream: true, explain: false, task: 'translate' },
      },
      () => {},
    );
    expect(anthropic.called.count).toBe(1);
    expect(openai.called.count).toBe(0);
  });

  it('honors "auto" override — backendOrder walk is used, no explicit pin', async () => {
    // 'auto' means no pin: the router takes the first available backend in backendOrder.
    const anthropic = mkBackend('anthropic');
    const openai = mkBackend('openai');
    const deps = baseDeps({
      backends: [anthropic.backend, openai.backend],
      getSettings: async () =>
        mkSettings({
          taskBackends: { summarize: 'auto' },
          backendOrder: ['openai', 'anthropic'].map(bid),
          disabledBackends: [],
        }),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hello',
        sourceLang: sel('en'),
        targetLang: sel('ar'),
        options: { stream: true, explain: false, task: 'summarize' },
      },
      () => {},
    );
    // backendOrder[0] is 'openai', so it is tried first.
    expect(openai.called.count).toBe(1);
    expect(anthropic.called.count).toBe(0);
  });
});
