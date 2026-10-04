import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { customTaskSchema, parseSettings, TaskIdSchema } from '@/shared/settings-schema';

const row = {
  id: '6f1c1f9e-2b7a-4c1e-9a55-0d3f5e1b2c44',
  label: 'Tweet summary',
  system: 'Summarize as one tweet.',
  user: 'TEXT:\n"""\n{{text}}\n"""',
  output: 'plain',
  pageContext: false,
  image: false,
  glossary: false,
  createdAt: 1,
};

describe('task schema', () => {
  it('accepts a built-in id and a uuid as a task id, and refuses a blank or spaced one', () => {
    expect(v.is(TaskIdSchema, 'suggest-replies')).toBe(true);
    expect(v.is(TaskIdSchema, row.id)).toBe(true);
    expect(v.is(TaskIdSchema, '')).toBe(false);
    expect(v.is(TaskIdSchema, 'two words')).toBe(false);
  });

  it('accepts a custom task row and refuses one whose message has no {{text}}', () => {
    expect(v.is(customTaskSchema, row)).toBe(true);
    expect(v.is(customTaskSchema, { ...row, user: 'no slot' })).toBe(false);
    expect(v.is(customTaskSchema, { ...row, label: 'x'.repeat(41) })).toBe(false);
  });

  it('keeps a custom id as the default task and in a rule scope', () => {
    const s = parseSettings({
      defaultTask: row.id,
      advanced: {
        rules: [
          {
            id: 'r',
            body: 'b',
            category: 'always',
            scope: { tasks: [row.id] },
            source: 'manual',
            addedAt: 'x',
          },
        ],
      },
    });
    expect(s.defaultTask).toBe(row.id);
    expect(s.advanced.rules[0]?.scope.tasks).toEqual([row.id]);
  });

  it('defaults to no task edits and no task turned off', () => {
    const s = parseSettings({});
    expect(s.taskOverrides).toEqual({});
    expect(s.disabledTasks).toEqual([]);
  });
});
