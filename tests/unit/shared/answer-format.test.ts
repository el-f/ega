import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { sel } from '@tests/_helpers/lang';
import { mkSettings } from '@tests/_helpers/router';
import { resetChromeMock } from '@tests/mocks/chrome';
import { importAs } from '@tests/_helpers/import-bundle';
import { createContextResolver } from '@/background/router-context';
import { buildPreviewPrompt, PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
import {
  buildTaskPrompt,
  hasAnswerFormat,
  stripStandardFormat,
  UNTRUSTED_DATA_INSTRUCTION,
  withAnswerFormat,
} from '@/shared/prompts';
import {
  DEFAULT_PROMPT_TEMPLATE,
  isPromptTemplateCustomised,
  V9_FULL_PROMPT_TEMPLATE,
} from '@/shared/settings-schema';
import { sanitiseStoredSettings, withoutShippedTaskFields } from '@/shared/storage/sanitise';
import { getSettings, updateSettings } from '@/shared/storage';
import { exportAll } from '@/shared/storage/backup';
import {
  answerFormatFor,
  buildTaskTemplate,
  FORMAT_MARKER,
  TASK_FORMATS,
  TRANSLATE_FORMAT,
  type Task,
} from '@/shared/task-prompts';
import { ownTaskPrompt } from '@/shared/task-view';
import { materializeVarieties } from '@/shared/varieties';
import type { Settings, TranslationRequest } from '@/shared/types';
import golden from '../../fixtures/prompt-golden-v9.json';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function req(task: Task, over: Partial<TranslationRequest> = {}): TranslationRequest {
  return {
    id: 'g',
    text: 'the quick brown fox',
    sourceLang: sel('auto'),
    targetLang: sel('en'),
    options: { stream: false, explain: task === 'explain', task },
    ...over,
  };
}

async function sent(s: Settings, r: TranslationRequest) {
  const ctx = await createContextResolver({
    getSettings: async () => s,
    logger: silent as never,
    fallbackTranslateTimeoutMs: 30_000,
  })(r, () => {});
  return ctx.prompt;
}

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;
const SUMMARIZE_V9 = buildTaskTemplate('summarize').system + ' ' + TASK_FORMATS.summarize.text;

describe('answer format: edited prompts', () => {
  it('T-F2: an edit that keeps its own format line is sent as written, with no second format', async () => {
    const system = SUMMARIZE_V9.replace('1-3 sentences', 'one sentence');
    const s = mkSettings({ taskOverrides: { summarize: { system } } });
    const p = await sent(s, req('summarize'));
    expect(p.system).toBe(
      UNTRUSTED_DATA_INSTRUCTION + '\n\n' + system.replace('{{targetLangLabel}}', 'English'),
    );
    expect(count(p.system, FORMAT_MARKER)).toBe(1);
  });

  it('T-F3: an edit without a format line gets exactly one standard format', async () => {
    const s = mkSettings({ taskOverrides: { summarize: { system: 'Summarize in one line.' } } });
    const p = await sent(s, req('summarize'));
    expect(p.system).toBe(
      UNTRUSTED_DATA_INSTRUCTION + '\n\nSummarize in one line. ' + TASK_FORMATS.summarize.text,
    );
  });

  it('T-F3: an edited Translate prompt without the format gets the Translate format, filled for Explain', async () => {
    const promptTemplate = { system: 'Translate {{langLabel}} plainly.', user: '{{text}}' };
    const s = mkSettings();
    const edited = { ...s, advanced: { ...s.advanced, promptTemplate } };
    const explain = await sent(edited, req('explain'));
    expect(count(explain.system, FORMAT_MARKER)).toBe(1);
    expect(explain.system).toContain('{id: string, detail?: string}>, "explain": string }');
    const plain = await sent(edited, req('translate'));
    expect(plain.system).toContain('{id: string, detail?: string}> }');
  });

  it('T-F6: a snippet that expands to the marker counts as having the format', async () => {
    const s = mkSettings();
    const withSnippet: Settings = {
      ...s,
      advanced: {
        ...s.advanced,
        snippets: { fmt: 'Return JSON ONLY: {"translation": string}.' },
        promptTemplate: { system: 'Translate it. @@fmt@@', user: '{{text}}' },
      },
    };
    const p = await sent(withSnippet, req('translate'));
    expect(p.system).toBe(
      UNTRUSTED_DATA_INSTRUCTION + '\n\nTranslate it. Return JSON ONLY: {"translation": string}.',
    );
    expect(hasAnswerFormat('x @@fmt@@', withSnippet.advanced.snippets)).toBe(true);
    expect(hasAnswerFormat('x @@fmt@@', {})).toBe(false);
  });

  it('T-F7: the built system holds the marker at least once and the format at most once more than the text did', () => {
    const snippetName = fc.constantFrom('a', 'b');
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        fc.dictionary(
          snippetName,
          fc.oneof(fc.string({ maxLength: 40 }), fc.constant(FORMAT_MARKER)),
        ),
        fc.constantFrom<Task>('translate', 'summarize', 'suggest-replies', 'ask'),
        (system, snippets, task) => {
          const format = answerFormatFor(task);
          const out = buildTaskPrompt({
            req: req(task),
            build: { preset: undefined, template: { system, user: '{{text}}' }, snippets },
            glossaryBlock: '',
            rulesBlock: '',
            format,
          });
          expect(out.system).toContain(FORMAT_MARKER);
          const typed = withAnswerFormat({ system, user: '' }, undefined, snippets).system;
          const appended = withAnswerFormat({ system, user: '' }, format, snippets).system;
          expect(count(appended, format.text)).toBeLessThanOrEqual(count(typed, format.text) + 1);
        },
      ),
    );
  });
});

describe('answer format: stored defaults and language prompts', () => {
  it('T-F4: a stored v9 Translate copy reads as not edited, is replaced, and builds the golden bytes', async () => {
    expect(isPromptTemplateCustomised(V9_FULL_PROMPT_TEMPLATE)).toBe(false);
    const read = sanitiseStoredSettings(
      { advanced: { promptTemplate: { ...V9_FULL_PROMPT_TEMPLATE } } },
      [],
    );
    expect(read.advanced.promptTemplate).toEqual(DEFAULT_PROMPT_TEMPLATE);
    const ctxReq = req('translate', {
      context: { pageTitle: 'Golden page', pageUrl: 'https://golden.example/post' },
    });
    expect(await sent(mkSettings({ advanced: read.advanced }), ctxReq)).toEqual(
      golden['translate:auto'],
    );
  });

  it('a stored task edit equal to the v9 shipped text drops out, so the task reads as not edited', () => {
    expect(withoutShippedTaskFields('summarize', { system: SUMMARIZE_V9 })).toEqual({});
  });

  it('T-F5: a language half that holds the marker is sent unchanged; one without it gets the Translate format', async () => {
    const s = mkSettings();
    const withMarker = 'Arabizi rules. ' + TRANSLATE_FORMAT.text.replace('{{explainField}}', '');
    const lang = (system: string): Settings => ({
      ...s,
      advanced: { ...s.advanced, perPresetTemplates: { arabizi: { system } } },
    });
    const kept = await sent(lang(withMarker), req('translate', { sourceLang: sel('arabizi') }));
    expect(kept.system).toBe(UNTRUSTED_DATA_INSTRUCTION + '\n\n' + withMarker);
    const added = await sent(
      lang('Arabizi rules.'),
      req('translate', { sourceLang: sel('arabizi') }),
    );
    expect(added.system).toBe(
      UNTRUSTED_DATA_INSTRUCTION +
        '\n\nArabizi rules.\n' +
        TRANSLATE_FORMAT.text.replace('{{explainField}}', ''),
    );
  });
});

describe('answer format: Preview and the editor action', () => {
  it('T-F8: the Preview builds the same strings the router sends', async () => {
    const s = mkSettings({ taskOverrides: { grammar: { system: 'Fix it.' } } });
    const varieties = materializeVarieties(s, []);
    for (const task of ['translate', 'explain', 'grammar', 'reword'] as const) {
      const r = req(task, { text: PREVIEW_SAMPLE_TEXT });
      const preview = buildPreviewPrompt(s, {
        task: task === 'explain' ? 'translate' : task,
        explain: task === 'explain',
        template:
          task === 'translate' || task === 'explain'
            ? s.advanced.promptTemplate
            : ownTaskPrompt(s, task),
        text: PREVIEW_SAMPLE_TEXT,
        sourceLang: sel('auto'),
        targetLang: sel('en'),
        varieties,
      });
      // The Preview sends Explain under the translate id, so only the prompt text is compared.
      expect(preview, task).toEqual(await sent(s, r));
    }
  });

  it('T-F10: "Use the standard format" on an edited Translate prompt builds like the same text without those lines', async () => {
    const own = 'Translate {{langLabel}} plainly.';
    const s = mkSettings();
    const legacy = own + '\n' + TRANSLATE_FORMAT.text.replace('detectedLangs', 'detected');
    const stripped = stripStandardFormat(legacy, TRANSLATE_FORMAT);
    expect(stripped).toBe(own);
    const build = (system: string) =>
      sent(
        { ...s, advanced: { ...s.advanced, promptTemplate: { system, user: '{{text}}' } } },
        req('translate'),
      );
    expect(await build(stripped ?? '')).toEqual(await build(own));
  });

  it('removes the exact shipped format first, and never empties a one-line task prompt', () => {
    expect(stripStandardFormat(SUMMARIZE_V9, TASK_FORMATS.summarize)).toBe(
      buildTaskTemplate('summarize').system,
    );
    expect(
      stripStandardFormat('Be short. Return JSON ONLY: {"x": 1}.', TASK_FORMATS.summarize),
    ).toBe(null);
    expect(stripStandardFormat(TASK_FORMATS.summarize.text, TASK_FORMATS.summarize)).toBe(null);
    expect(stripStandardFormat('No format here.', TASK_FORMATS.summarize)).toBe(null);
  });
});

describe('answer format: backups', () => {
  beforeEach(() => resetChromeMock());

  it('T-F9: an edited prompt with and without its format line round-trips byte for byte', async () => {
    for (const system of [SUMMARIZE_V9 + ' Extra.', 'Summarize in one line.']) {
      resetChromeMock();
      await updateSettings({ taskOverrides: { summarize: { system } } });
      const file = JSON.parse(JSON.stringify(await exportAll()));
      resetChromeMock();
      await importAs(file, 'settings');
      expect((await getSettings()).taskOverrides.summarize?.system).toBe(system);
    }
  });
});
