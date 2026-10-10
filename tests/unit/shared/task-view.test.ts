import { describe, it, expect } from 'vitest';
import { findTask, materializeTasks, taskLabel } from '@/shared/task-view';
import { taskUsesTone } from '@/shared/language-prompt';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { ALL_TASKS } from '@/shared/task-prompts';
import type { CustomTask } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';
import { replyLang } from '@/shared/lang-tag';

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

function custom(id: string, createdAt: number, over: Partial<CustomTask> = {}): CustomTask {
  return {
    id,
    label: `Task ${id}`,
    system: 'Do the thing.',
    user: 'TEXT:\n"""\n{{text}}\n"""',
    output: 'plain',
    pageContext: false,
    image: false,
    glossary: false,
    createdAt,
    ...over,
  };
}

describe('materializeTasks', () => {
  it('keeps reply language and presentation capabilities on each task view', () => {
    const views = materializeTasks(settings(), [
      custom('same-language', 1, { answersIn: 'input' }),
      custom('legacy', 2),
    ]);
    expect(views.find((v) => v.id === 'grammar')).toMatchObject({
      answersIn: 'input',
      gerund: 'Fixing grammar',
      notesLabel: 'Notes',
    });
    expect(views.find((v) => v.id === 'explain')).toMatchObject({
      answersIn: 'target',
      gerund: 'Explaining',
      notesLabel: 'Context & subtext',
    });
    expect(views.find((v) => v.id === 'legacy')).toMatchObject({
      answersIn: 'target',
      gerund: 'Working',
      notesLabel: 'Notes',
      refinePresets: [],
    });
    expect(views.find((v) => v.id === 'reword')?.refinePresets.map((p) => p.id)).toEqual([
      'shorter',
      'more-formal',
      'less-formal',
    ]);
    expect(replyLang('same-language', 'en', 'he', views)).toBe('he');
    expect(replyLang('legacy', 'en', 'he', views)).toBe('en');
    expect(replyLang('grammar', 'en', 'he')).toBe('he');
    expect(replyLang('future-task', 'en', 'he', views)).toBe('en');
  });

  it('lists the built-ins in shipped order, then custom tasks by creation time', () => {
    const views = materializeTasks(settings(), [custom('c-late', 20), custom('c-early', 10)]);
    expect(views.map((v) => v.id)).toEqual([...ALL_TASKS, 'c-early', 'c-late']);
    expect(views.slice(-2).every((v) => v.kind === 'custom')).toBe(true);
  });

  it('skips a custom row that reuses a built-in id or an earlier row id', () => {
    const views = materializeTasks(settings(), [
      custom('summarize', 1, { label: 'Fake' }),
      custom('dup', 2, { label: 'First' }),
      custom('dup', 3, { label: 'Second' }),
    ]);
    expect(views.filter((v) => v.id === 'summarize')).toHaveLength(1);
    expect(views.find((v) => v.id === 'summarize')?.label).toBe('Summarize');
    expect(views.filter((v) => v.id === 'dup').map((v) => v.label)).toEqual(['First']);
  });

  it('never turns Translate off, but does turn off another listed task', () => {
    const views = materializeTasks(settings({ disabledTasks: ['translate', 'ask'] }), []);
    expect(views.find((v) => v.id === 'translate')?.disabled).toBe(false);
    expect(views.find((v) => v.id === 'ask')?.disabled).toBe(true);
    const enabled = materializeTasks(settings({ disabledTasks: ['ask'] }), [], {
      enabledOnly: true,
    });
    expect(enabled.map((v) => v.id)).not.toContain('ask');
  });

  it('applies an edit to the switches a built-in may change, and to nothing else', () => {
    const views = materializeTasks(
      settings({
        taskOverrides: { summarize: { pageContext: true, glossary: true, effort: 'low' } },
      }),
      [],
    );
    const s = views.find((v) => v.id === 'summarize');
    expect(s).toMatchObject({
      pageContext: true,
      glossary: true,
      effort: 'low',
      output: 'plain',
      image: false,
      hasOverrides: true,
    });
    expect(views.find((v) => v.id === 'reword')?.hasOverrides).toBe(false);
  });

  it('shows the tone select for a prompt that has {{tone}}', () => {
    const plain = materializeTasks(settings(), []);
    expect(plain.find((v) => v.id === 'reword')?.usesTone).toBe(true);
    expect(plain.find((v) => v.id === 'summarize')?.usesTone).toBe(false);
    expect(plain.find((v) => v.id === 'translate')?.usesTone).toBe(false);

    const edited = materializeTasks(
      settings({
        taskOverrides: { summarize: { system: 'Summarize in a {{tone}} tone.' } },
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          promptTemplate: { system: 'Translate, {{tone}}.', user: '{{text}}' },
        },
      }),
      [custom('c', 1, { user: 'Say it {{tone}}: {{text}}' })],
    );
    expect(edited.find((v) => v.id === 'summarize')?.usesTone).toBe(true);
    expect(edited.find((v) => v.id === 'translate')?.usesTone).toBe(true);
    expect(edited.find((v) => v.id === 'explain')?.usesTone).toBe(true);
    expect(edited.find((v) => v.id === 'c')?.usesTone).toBe(true);
  });

  it('reads a custom row with an output this build does not know as answer only', () => {
    const row = { ...custom('c', 1), output: 'table' } as unknown as CustomTask;
    expect(materializeTasks(settings(), [row]).find((v) => v.id === 'c')?.output).toBe('plain');
  });
});

describe('findTask', () => {
  it('finds a task that is off, and nothing for an unknown id', () => {
    const s = settings({ disabledTasks: ['ask', 'c'] });
    expect(findTask(s, [], 'ask')?.disabled).toBe(true);
    expect(findTask(s, [custom('c', 1)], 'c')).toMatchObject({ kind: 'custom', disabled: true });
    expect(findTask(s, [], 'gone')).toBeNull();
  });
});

describe('taskLabel', () => {
  it('names a listed task, a built-in that is not listed, and a deleted one', () => {
    const views = materializeTasks(settings(), [custom('c', 1, { label: 'Tweet' })]);
    expect(taskLabel(views, 'c')).toBe('Tweet');
    expect(taskLabel([], 'suggest-replies')).toBe('Reply ideas');
    expect(taskLabel(views, 'gone')).toBe('Deleted task');
  });
});

describe('usesTone through a snippet', () => {
  it('counts a {{tone}} that a snippet carries, as the router does', () => {
    const s = settings({
      advanced: { ...DEFAULT_SETTINGS.advanced, snippets: { t: 'in a {{tone}} way' } },
      taskOverrides: { summarize: { system: 'Summarize @@t@@.' } },
    });
    expect(materializeTasks(s, []).find((v) => v.id === 'summarize')?.usesTone).toBe(true);
  });
});

describe('taskUsesTone follows the prompt the request runs', () => {
  const s = settings({
    advanced: {
      ...DEFAULT_SETTINGS.advanced,
      perPresetTemplates: { arabizi: { system: 'Translate in a {{tone}} way.' } },
    },
  });

  it('reads the source language prompt for Translate and Explain', () => {
    expect(taskUsesTone(s, [], 'translate', 'arabizi')).toBe(true);
    expect(taskUsesTone(s, [], 'explain', 'arabizi')).toBe(true);
    expect(taskUsesTone(s, [], 'translate', 'auto')).toBe(false);
    expect(taskUsesTone(s, [], 'translate', 'fr')).toBe(false);
  });

  it('reads the task prompt for every other task, whatever the source', () => {
    expect(taskUsesTone(s, [], 'reword', 'arabizi')).toBe(true);
    expect(taskUsesTone(s, [], 'summarize', 'arabizi')).toBe(false);
    expect(taskUsesTone(s, [custom('c', 1, { system: 'Be {{tone}}.' })], 'c', 'fr')).toBe(true);
    expect(taskUsesTone(s, [], 'gone-task', 'arabizi')).toBe(false);
  });
});
