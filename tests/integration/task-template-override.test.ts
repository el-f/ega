import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import type { TranslationBackend, TranslateCallArgs } from '@/shared/backends/base';
import type { Task } from '@/shared/task-prompts';
import type { Settings } from '@/shared/types';
import { sanitiseStoredSettings } from '@/shared/storage/sanitise';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { mkSettings, baseDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

// Router precedence: each half of taskOverrides[task] > that half of buildTaskTemplate(task) > the language template for translate/explain.

const LANGUAGE_TEMPLATE_MARKER = 'Preserve verb tense, mood, number, person, voice.';

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

async function runTask(s: Settings, task: Task): Promise<CapturingBackend['captured']> {
  const cap = mkCapturingBackend('anthropic');
  const deps = baseDeps({ backends: [cap.backend], getSettings: async () => s });
  await createRouter(deps).handleTranslate(
    {
      id: `r-${task}`,
      text: 'hello',
      sourceLang: sel('en'),
      targetLang: sel('ar'),
      options: { stream: false, explain: false, task },
    },
    () => {},
  );
  return cap.captured;
}

/** A settings row as the extension reads it from storage. */
function readStored(row: Record<string, unknown>): Settings {
  return sanitiseStoredSettings({ anthropicApiKey: 'k', disabledBackends: [], ...row }, []);
}

describe('router — task edits fall through per half', () => {
  it('runs an edited system half with the shipped user half', async () => {
    const captured = await runTask(
      mkSettings({ taskOverrides: { summarize: { system: 'CUSTOM_SUMMARIZE_SYS' } } }),
      'summarize',
    );
    expect(captured.system).toContain('CUSTOM_SUMMARIZE_SYS');
    expect(captured.system).not.toMatch(/Summarize the text/i);
    expect(captured.user).toContain('TEXT:');
    expect(captured.user).toContain('hello');
  });

  it('runs an edited user half with the shipped system half', async () => {
    const captured = await runTask(
      mkSettings({ taskOverrides: { summarize: { user: 'CUSTOM_USR {{text}}' } } }),
      'summarize',
    );
    expect(captured.system).toMatch(/Summarize the text/i);
    expect(captured.user).toContain('CUSTOM_USR hello');
  });

  it('runs a stored task edit read through the storage path', async () => {
    const captured = await runTask(
      readStored({ taskOverrides: { grammar: { system: 'CUSTOM_GRAMMAR_SYS' } } }),
      'grammar',
    );
    expect(captured.system).toContain('CUSTOM_GRAMMAR_SYS');
  });

  it('falls back to buildTaskTemplate when no edit is set', async () => {
    const captured = await runTask(mkSettings(), 'summarize');
    expect(captured.system).toMatch(/Summarize the text/i);
  });
});

describe('router — translate and explain edits cannot hold prompt halves', () => {
  it.each(['translate', 'explain'] as const)(
    'reads a stored %s edit without its halves and runs the language template',
    async (task) => {
      const s = readStored({
        taskOverrides: { [task]: { system: 'SHOULD_NOT_LEAK', user: 'LEAK_USR {{text}}' } },
      });
      expect(s.taskOverrides[task]).toBeUndefined();
      const captured = await runTask(s, task);
      expect(captured.system).not.toContain('SHOULD_NOT_LEAK');
      expect(captured.user).not.toContain('LEAK_USR');
      expect(captured.system).toContain(LANGUAGE_TEMPLATE_MARKER);
    },
  );

  it('keeps the non-prompt fields of a stored translate edit', () => {
    const s = readStored({
      taskOverrides: { translate: { system: 'SHOULD_NOT_LEAK', effort: 'high' } },
    });
    expect(s.taskOverrides.translate).toEqual({ effort: 'high' });
  });
});
