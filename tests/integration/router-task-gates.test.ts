import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { mkSettings } from '@tests/_helpers/router';
import { buildSystemAndUser, createContextResolver } from '@/background/router-context';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { CustomLanguage, Settings, TranslationRequest } from '@/shared/types';
import { asLangPresetIdUnsafe } from '@/shared/brands';
import { materializeVarieties } from '@/shared/varieties';
import { TONE_PHRASE, type Task, type Tone } from '@/shared/task-prompts';
import { buildPreviewPrompt } from '@/options/preview-prompt';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function resolverFor(s: Settings) {
  return createContextResolver({
    getSettings: async () => s,
    logger: silent as never,
    fallbackTranslateTimeoutMs: 30_000,
  });
}

function request(
  task: Task,
  over: Partial<TranslationRequest> = {},
  tone?: Tone,
): TranslationRequest {
  return {
    id: 'r',
    text: 'the quick brown fox',
    sourceLang: sel('en'),
    targetLang: sel('es'),
    context: { pageTitle: 'Title A', pageUrl: 'https://a.example/' },
    options: { stream: false, explain: false, task, ...(tone ? { tone } : {}) },
    ...over,
  };
}

async function build(s: Settings, req: TranslationRequest) {
  const ctx = await resolverFor(s)(req, () => {});
  return { ctx, prompt: buildSystemAndUser(ctx, req) };
}

describe('router — what a task takes', () => {
  it('drops page context for a task that does not take it, before the cache key', async () => {
    const s = mkSettings();
    const a = await build(s, request('summarize'));
    const b = await build(s, request('summarize', { context: { pageTitle: 'Title B' } }));
    expect(a.prompt.user + a.prompt.system).not.toContain('Title A');
    expect(a.ctx.key).toBe(b.ctx.key);
  });

  it('keeps page context in the key for Translate, which takes it', async () => {
    const s = mkSettings();
    const a = await build(s, request('translate'));
    const b = await build(s, request('translate', { context: { pageTitle: 'Title B' } }));
    expect(a.ctx.key).not.toBe(b.ctx.key);
  });

  it('adds a page context block for a built-in the user switched context on', async () => {
    const s = mkSettings({ taskOverrides: { summarize: { pageContext: true } } });
    const { prompt } = await build(s, request('summarize'));
    expect(prompt.user).toContain('PAGE CONTEXT');
    expect(prompt.user).toContain('Title A');
  });

  it.each([
    ['in the prompt', 'Page: {{context}}', {}],
    ['inside a snippet', '@@page@@', { page: 'Page: {{context}}' }],
  ])(
    'sends page context once when the prompt reads {{context}} %s',
    async (_, system, snippets) => {
      const s = mkSettings({
        advanced: { ...DEFAULT_SETTINGS.advanced, snippets },
        taskOverrides: { summarize: { system, pageContext: true } },
      });
      const { prompt } = await build(s, request('summarize'));
      expect((prompt.system + prompt.user).split('Title A')).toHaveLength(2);
      expect(prompt.user).not.toContain('PAGE CONTEXT');
    },
  );

  it('Translate with page context or glossary switched off sends neither', async () => {
    const glossary = [{ term: 'fox', translation: 'zorro', caseSensitive: false }];
    const s = mkSettings({
      glossary,
      taskOverrides: { translate: { pageContext: false, glossary: false } },
    });
    const a = await build(s, request('translate'));
    const b = await build(s, request('translate', { context: { pageTitle: 'Title B' } }));
    expect(a.prompt.system + a.prompt.user).not.toMatch(/Title A|zorro/);
    expect(a.ctx.key).toBe(b.ctx.key);
  });

  it('keys the tone when the {{tone}} slot comes from a snippet', async () => {
    const s = mkSettings({
      advanced: { ...DEFAULT_SETTINGS.advanced, snippets: { voice: 'Use a {{tone}} voice.' } },
      taskOverrides: { summarize: { system: 'Summarize. @@voice@@' } },
    });
    const formal = await build(s, request('summarize', {}, 'formal'));
    const casual = await build(s, request('summarize', {}, 'casual'));
    expect(formal.ctx.key).not.toBe(casual.ctx.key);
    expect(formal.prompt.system).not.toBe(casual.prompt.system);
  });

  it('adds no block to a Translate template that leaves out the {{context}} slot', async () => {
    const s = mkSettings({
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        promptTemplate: { system: 'Translate to {{targetLangLabel}}.', user: '{{text}}' },
      },
    });
    const { prompt } = await build(s, request('translate'));
    expect(prompt.user).not.toContain('Title A');
  });

  it('uses the glossary only when the task takes it', async () => {
    const glossary = [{ term: 'fox', translation: 'zorro', caseSensitive: false }];
    const off = await build(mkSettings({ glossary }), request('summarize'));
    expect(off.prompt.system).not.toContain('zorro');
    const on = await build(
      mkSettings({ glossary, taskOverrides: { summarize: { glossary: true } } }),
      request('summarize'),
    );
    expect(on.prompt.system).toContain('zorro');
  });

  it('keys the tone only for a template with a {{tone}} slot', async () => {
    const s = mkSettings();
    const sumFormal = await build(s, request('summarize', {}, 'formal'));
    const sumCasual = await build(s, request('summarize', {}, 'casual'));
    expect(sumFormal.ctx.key).toBe(sumCasual.ctx.key);
    const rewFormal = await build(s, request('reword', {}, 'formal'));
    const rewCasual = await build(s, request('reword', {}, 'casual'));
    expect(rewFormal.ctx.key).not.toBe(rewCasual.ctx.key);
  });

  it('fills {{tone}} in any task whose prompt has it, from the request or the default tone', async () => {
    const s = mkSettings({
      defaultTone: 'blunt',
      taskOverrides: { summarize: { system: 'Summarize in a {{tone}} way.' } },
    });
    const withDefault = await build(s, request('summarize'));
    expect(withDefault.prompt.system).toContain(TONE_PHRASE.blunt);
    const formal = await build(s, request('summarize', {}, 'formal'));
    expect(formal.prompt.system).not.toBe(withDefault.prompt.system);
    expect(formal.ctx.key).not.toBe(withDefault.ctx.key);
  });
});

describe('the options preview builds what the router sends', () => {
  const customs: CustomLanguage[] = ['c1', 'c2', 'c3'].map((id, i) => ({
    id: asLangPresetIdUnsafe(id),
    label: `Custom ${id}`,
    hint: `Hint for ${id}.`,
    examples: [],
    createdAt: i,
  }));

  function settingsFor(ruleTask: Task): Settings {
    return mkSettings({
      defaultTone: 'formal',
      glossary: [{ term: 'fox', translation: 'zorro', caseSensitive: false }],
      varietyOverrides: { arabizi: { hint: 'My own Arabizi hint.' } },
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        snippets: { lead: 'Lead \\@@kept@@.', kept: 'resolved twice' },
        rules: [
          {
            id: 'r1',
            body: 'Keep names.',
            category: 'always',
            scope: { tasks: [ruleTask] },
            source: 'manual',
            addedAt: '2026-01-01T00:00:00.000Z',
            enabled: true,
          },
        ],
      },
      taskOverrides: {
        summarize: {
          system: '@@lead@@ {{tone}} {{targetLangLabel}}',
          pageContext: true,
          glossary: true,
        },
      },
    });
  }

  // The router takes a request with explain on and no task as the explain task.
  it.each<[string, Task, boolean, string, string]>([
    ['summarize', 'summarize', false, 'en', 'es'],
    ['reword', 'reword', false, 'en', 'es'],
    ['translate from a language', 'translate', false, 'arabizi', 'en'],
    ['translate from auto', 'translate', false, 'auto', 'en'],
    ['explain', 'translate', true, 'arabizi', 'en'],
    ['summarize into a custom language', 'summarize', false, 'en', 'c2'],
  ])('%s', async (_, task, explain, source, target) => {
    const ruleTask: Task = explain ? 'explain' : task;
    const s = settingsFor(ruleTask);
    const req: TranslationRequest = {
      id: 'r',
      text: 'the quick brown fox',
      sourceLang: sel(source),
      targetLang: sel(target),
      options: explain ? { stream: false, explain } : { stream: false, explain, task },
    };
    const ctx = await createContextResolver({
      getSettings: async () => s,
      getCustomLanguages: async () => customs,
      logger: silent as never,
      fallbackTranslateTimeoutMs: 30_000,
    })(explain ? { ...req, options: { ...req.options, task: 'explain' } } : req, () => {});
    const routed = buildSystemAndUser(ctx, req);
    const preview = buildPreviewPrompt(s, {
      task,
      explain,
      template: ctx.tpl,
      text: req.text,
      sourceLang: req.sourceLang,
      targetLang: req.targetLang,
      varieties: materializeVarieties(s, customs),
    });
    expect(preview).toEqual(routed);
    expect(preview.system).toContain('Keep names.');
    expect(preview.system + preview.user).not.toContain('resolved twice');
  });
});
