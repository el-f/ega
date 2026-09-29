import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import type { TranslationBackend, TranslateCallArgs } from '@/shared/backends/base';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { mkSettings, baseDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

// Router precedence: advanced.taskTemplates[task] > buildTaskTemplate(task, tone) > global translate template.

interface CapturingBackend {
  backend: TranslationBackend;
  captured: { system?: string; user?: string };
}

function mkCapturingBackend(id: string): CapturingBackend {
  const captured: { system?: string; user?: string } = {};
  const backend: TranslationBackend = {
    id: bid(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async (a: TranslateCallArgs) => {
      captured.system = a.system;
      captured.user = a.user;
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: '{"translation":"X","confidence":1}',
      });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
  };
  return { backend, captured };
}

describe('router — taskTemplates fall-through', () => {
  it('uses advanced.taskTemplates[task] when set', async () => {
    const cap = mkCapturingBackend('anthropic');
    const deps = baseDeps({
      backends: [cap.backend],
      getSettings: async () =>
        mkSettings({
          advanced: {
            ...DEFAULT_SETTINGS.advanced,
            taskTemplates: {
              summarize: {
                system: 'CUSTOM_SUMMARIZE_SYS',
                user: 'CUSTOM_USR {{text}}',
              },
            },
          },
        }),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hello',
        sourceLang: sel('en'),
        targetLang: sel('ar'),
        options: { stream: false, explain: false, task: 'summarize' },
      },
      () => {},
    );
    expect(cap.captured.system).toContain('CUSTOM_SUMMARIZE_SYS');
    expect(cap.captured.user).toContain('CUSTOM_USR');
  });

  it('falls back to buildTaskTemplate when no override is set', async () => {
    const cap = mkCapturingBackend('anthropic');
    const deps = baseDeps({
      backends: [cap.backend],
      getSettings: async () => mkSettings(),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r2',
        text: 'hello',
        sourceLang: sel('en'),
        targetLang: sel('ar'),
        options: { stream: false, explain: false, task: 'summarize' },
      },
      () => {},
    );
    expect(cap.captured.system).toMatch(/Summarize the text/i);
  });

  it('translate task ignores taskTemplates override entirely', async () => {
    const cap = mkCapturingBackend('anthropic');
    const deps = baseDeps({
      backends: [cap.backend],
      getSettings: async () =>
        mkSettings({
          advanced: {
            ...DEFAULT_SETTINGS.advanced,
            // The UI cannot write this key; the router honors taskTemplates only for non-translate tasks.
            taskTemplates: {
              translate: {
                system: 'SHOULD_NOT_LEAK',
                user: '{{text}}',
              },
            },
          },
        }),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r3',
        text: 'hello',
        sourceLang: sel('en'),
        targetLang: sel('ar'),
        options: { stream: false, explain: false, task: 'translate' },
      },
      () => {},
    );
    expect(cap.captured.system).not.toContain('SHOULD_NOT_LEAK');
  });
});
