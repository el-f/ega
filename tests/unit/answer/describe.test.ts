import { describe, expect, it } from 'vitest';
import { describeField, describeReply } from '@/shared/answer/describe';
import { answerSpecFor, CUSTOM_PRESETS, type AnswerField } from '@/shared/answer/spec';
import { ALL_TASKS } from '@/shared/task-prompts';

const rows = (task: string, explain = false) =>
  describeReply(answerSpecFor(task), { explain }).map((r) => `${r.label}: ${r.line}`);

describe('the reply parts of a built-in task, in plain words', () => {
  it('names one part per field, with the reply card label', () => {
    expect(rows('summarize')).toEqual(['Answer: the summary']);
    expect(rows('ask')).toEqual(['Answer: the answer to your question']);
    expect(rows('suggest-replies')).toEqual(['Answer: three replies: casual, neutral, polite']);
    expect(rows('reword')).toEqual([
      'Answer: the rewritten text, same language',
      'Notes: the tone and what changed',
    ]);
    expect(rows('grammar')).toEqual([
      'Answer: the corrected text, same language',
      'Notes: the corrections, one per line',
    ]);
  });

  it('Translate says when each extra part comes back; Explain shows its notes always', () => {
    expect(rows('translate')).toEqual([
      'Answer: the translation',
      'Confidence: shown as a percent',
      'Source language: when the model can tell',
      'Language detail: only when useful',
      'Source languages: only when the text mixes languages',
      'Context & subtext: only when you run Explain',
    ]);
    expect(rows('explain', true).at(-1)).toBe('Context & subtext: shown under it');
  });

  it('never shows a key, a type or JSON to the user', () => {
    for (const task of ALL_TASKS) {
      for (const r of [
        ...describeReply(answerSpecFor(task)),
        ...describeReply(answerSpecFor(task), { explain: true }),
      ]) {
        const text = `${r.label} ${r.line}`;
        expect(text, task).not.toMatch(/json|string|array|schema|\bkey\b|detected|[{}<>"?]/i);
        // The task is "Explain"; the field key is "explain".
        expect(text, task).not.toMatch(/\bexplain\b/);
      }
    }
  });
});

describe('the reply parts of a custom task', () => {
  it('the two presets say what the answer and notes hold', () => {
    const lines = (id: keyof typeof CUSTOM_PRESETS) =>
      describeReply(CUSTOM_PRESETS[id]).map((r) => `${r.label}: ${r.line}`);
    expect(lines('answer-only')).toEqual(['Answer: the main text']);
    expect(lines('answer-notes')).toEqual([
      'Answer: the main text',
      'Notes: short notes, only when there is something to note',
    ]);
  });

  it('a field of your own reads as its kind, where it shows, and optional', () => {
    const field = (over: Partial<AnswerField>): AnswerField => ({
      key: 'x',
      label: 'X',
      kind: 'text',
      role: 'notes',
      required: false,
      ...over,
    });
    expect(describeField(field({ role: 'main', required: true }))).toBe('Text · main answer');
    expect(describeField(field({ kind: 'list' }))).toBe('List · notes · optional');
    expect(describeField(field({ kind: 'choice', role: 'details', choices: ['A', 'B'] }))).toBe(
      'Pick one · about this reply · optional',
    );
    expect(describeField(field({ kind: 'score', role: 'hidden', required: true }))).toBe(
      'Score · not shown',
    );
    expect(describeField(field({ kind: 'yesno' }))).toBe('Yes or no · notes · optional');
    expect(
      describeReply({
        id: 'custom:t',
        version: 1,
        join: 'after-build',
        fields: [field({ key: 'tone', label: 'Tone' })],
      }),
    ).toEqual([{ key: 'tone', label: 'Tone', line: 'Text · notes · optional' }]);
  });
});
