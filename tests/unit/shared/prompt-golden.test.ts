/** T-F1: prompts Ega sends with no user edits, recorded on v9; EGA_WRITE_GOLDEN=1 re-records on a commit that changes no prompt. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { mkSettings } from '@tests/_helpers/router';
import { buildSystemAndUser, createContextResolver } from '@/background/router-context';
import { buildPreviewPrompt, PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
import { materializeVarieties } from '@/shared/varieties';
import { ownTaskPrompt } from '@/shared/task-view';
import { ALL_TONES, buildTaskTemplate, type Task, type Tone } from '@/shared/task-prompts';
import { DEFAULT_PROMPT_TEMPLATE } from '@/shared/settings-schema';
import { asLangPresetIdUnsafe } from '@/shared/brands';
import type { CustomLanguage, Settings, TranslationRequest } from '@/shared/types';

const FIXTURE = fileURLToPath(new URL('../../fixtures/prompt-golden-v9.json', import.meta.url));
const silent = { debug() {}, info() {}, warn() {}, error() {} };

// A hint that ends in a space: appending after the trim would lose it, so this guards the join point.
const TRAILING_SPACE_LANG: CustomLanguage = {
  id: asLangPresetIdUnsafe('golden-lang'),
  label: 'Golden dialect',
  hint: 'Written with digits for some sounds ',
  examples: [{ src: 'mar7aba', tgt: 'hello' }],
  createdAt: 1,
};

function req(task: Task, over: Partial<TranslationRequest> = {}, tone?: Tone): TranslationRequest {
  return {
    id: 'g',
    text: 'the quick brown fox',
    sourceLang: sel('auto'),
    targetLang: sel('en'),
    context: { pageTitle: 'Golden page', pageUrl: 'https://golden.example/post' },
    options: {
      stream: false,
      explain: task === 'explain',
      task,
      ...(tone ? { tone } : {}),
    },
    ...over,
  };
}

async function routerPrompt(
  s: Settings,
  r: TranslationRequest,
  customs: CustomLanguage[] = [],
  imageArm = false,
): Promise<{ system: string; user: string }> {
  const ctx = await createContextResolver({
    getSettings: async () => s,
    getCustomLanguages: async () => customs,
    logger: silent as never,
    fallbackTranslateTimeoutMs: 30_000,
  })(r, () => {});
  if (!imageArm) return ctx.prompt;
  // The router's non-OCR image arm: the same builder, with the placeholder text emptied.
  return buildSystemAndUser({ ...ctx, reqView: { ...ctx.reqView, text: '' } }, r);
}

const OWN_PROMPT_TASKS: readonly Task[] = ['summarize', 'grammar', 'suggest-replies', 'ask'];
const OWN_PROMPT_TASKS_ALL: readonly Task[] = [...OWN_PROMPT_TASKS, 'reword'];

async function goldenCases(): Promise<Record<string, { system: string; user: string }>> {
  const s = mkSettings();
  const withBlocks = mkSettings({
    glossary: [{ term: 'fox', translation: 'zorro', caseSensitive: false }],
    advanced: {
      ...s.advanced,
      rules: [
        {
          id: 'r1',
          body: 'Keep product names in English.',
          category: 'always',
          scope: { tasks: [] },
          source: 'manual',
          addedAt: '2026-01-01T00:00:00.000Z',
          enabled: true,
        },
      ],
    },
  });
  const out: Record<string, { system: string; user: string }> = {};
  for (const t of OWN_PROMPT_TASKS) out[`task:${t}`] = await routerPrompt(s, req(t));
  for (const tone of ALL_TONES)
    out[`task:reword:${tone}`] = await routerPrompt(s, req('reword', {}, tone));
  out['translate:auto'] = await routerPrompt(s, req('translate'));
  out['translate:auto:trailing-space-candidate'] = await routerPrompt(s, req('translate'), [
    TRAILING_SPACE_LANG,
  ]);
  out['translate:fixed:arabizi'] = await routerPrompt(
    s,
    req('translate', { sourceLang: sel('arabizi') }),
  );
  out['translate:fixed:es'] = await routerPrompt(s, req('translate', { sourceLang: sel('es') }));
  out['translate:target-auto'] = await routerPrompt(
    s,
    req('translate', { sourceLang: sel('arabizi'), targetLang: sel('auto') }),
  );
  out['explain:auto'] = await routerPrompt(s, req('explain'));
  out['explain:fixed:arabizi'] = await routerPrompt(
    s,
    req('explain', { sourceLang: sel('arabizi') }),
  );
  out['translate:glossary-rules'] = await routerPrompt(withBlocks, req('translate'));
  out['summarize:glossary-rules'] = await routerPrompt(withBlocks, req('summarize'));
  out['image:explain'] = await routerPrompt(s, req('explain'), [], true);
  out['image:summarize'] = await routerPrompt(s, req('summarize'), [], true);
  const varieties = materializeVarieties(s, []);
  for (const [task, explain] of [
    ['translate', false],
    ['translate', true],
    ['summarize', false],
    ['suggest-replies', false],
  ] as const) {
    out[`preview:${task}${explain ? ':explain' : ''}`] = buildPreviewPrompt(s, {
      task,
      explain,
      template: task === 'translate' ? s.advanced.promptTemplate : ownTaskPrompt(s, task),
      text: PREVIEW_SAMPLE_TEXT,
      sourceLang: sel('auto'),
      targetLang: sel('en'),
      varieties,
    });
  }
  return out;
}

describe('golden prompts (v9, no user edits)', () => {
  it('every unedited prompt is byte-identical to the recorded v9 build', async () => {
    const actual = await goldenCases();
    if (process.env['EGA_WRITE_GOLDEN'] === '1' || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + '\n');
    }
    const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as typeof actual;
    expect(Object.keys(actual).sort()).toEqual(Object.keys(recorded).sort());
    for (const k of Object.keys(recorded)) expect(actual[k], k).toEqual(recorded[k]);
  });
});

const TEMPLATES = fileURLToPath(
  new URL('../../fixtures/prompt-templates-v9.json', import.meta.url),
);

describe('shipped templates (v9)', () => {
  it('T-F0: each shipped template plus its answer format is the recorded v9 text', () => {
    const actual: Record<string, { system: string; user: string }> = {
      translate: { ...DEFAULT_PROMPT_TEMPLATE },
      ...Object.fromEntries(OWN_PROMPT_TASKS_ALL.map((t) => [t, buildTaskTemplate(t)])),
    };
    if (process.env['EGA_WRITE_GOLDEN'] === '1' || !existsSync(TEMPLATES)) {
      writeFileSync(TEMPLATES, JSON.stringify(actual, null, 2) + '\n');
    }
    expect(actual).toEqual(JSON.parse(readFileSync(TEMPLATES, 'utf8')));
  });
});
