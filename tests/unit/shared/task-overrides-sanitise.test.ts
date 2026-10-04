// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitiseStoredSettings, withoutShippedTaskFields } from '@/shared/storage/sanitise';
import { buildTaskTemplate } from '@/shared/task-prompts';
import { filterRulesForRequest } from '@/shared/rules';
import type { CustomTask } from '@/shared/settings-schema';

afterEach(() => {
  vi.restoreAllMocks();
});

const SHIPPED_SUMMARIZE = buildTaskTemplate('summarize');
const UUID = '6f1c1f9e-2b7a-4c1e-9a55-0d3f5e1b2c44';
const ROW: CustomTask = {
  id: UUID,
  label: 'Tweet',
  system: '',
  user: '{{text}}',
  output: 'plain',
  pageContext: false,
  image: false,
  glossary: false,
  createdAt: 1,
};

function read(stored: Record<string, unknown>, customTasks: CustomTask[] = []) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return sanitiseStoredSettings(stored, [], { customTasks });
}

describe('withoutShippedTaskFields', () => {
  it('keeps only the prompt half that differs from the shipped one', () => {
    expect(
      withoutShippedTaskFields('summarize', {
        system: SHIPPED_SUMMARIZE.system,
        user: 'mine {{text}}',
      }),
    ).toEqual({ user: 'mine {{text}}' });
  });

  it('drops prompt halves on Translate, whose prompt is the language template', () => {
    expect(withoutShippedTaskFields('translate', { system: 'x', glossary: false })).toEqual({
      glossary: false,
    });
  });

  it('drops a switch set to its shipped value and keeps one that differs', () => {
    expect(
      withoutShippedTaskFields('summarize', { pageContext: false, glossary: true, effort: 'low' }),
    ).toEqual({ glossary: true, effort: 'low' });
  });
});

describe('the read path', () => {
  it('reads a stored copy of the shipped prompt as no edit', () => {
    const s = read({ taskOverrides: { summarize: { system: SHIPPED_SUMMARIZE.system } } });
    expect(s.taskOverrides).toEqual({});
  });

  it('keeps a real edit', () => {
    const s = read({ taskOverrides: { grammar: { effort: 'high' } } });
    expect(s.taskOverrides).toEqual({ grammar: { effort: 'high' } });
  });

  it('runs an unknown default as Translate, and keeps a custom or disabled one', () => {
    expect(read({ defaultTask: 'gone' }).defaultTask).toBe('translate');
    expect(read({ defaultTask: UUID }, [ROW]).defaultTask).toBe(UUID);
    const off = read({ defaultTask: 'summarize', disabledTasks: ['summarize'] });
    expect(off.defaultTask).toBe('summarize');
    expect(off.disabledTasks).toEqual(['summarize']);
  });

  it('drops Translate, unknown ids and repeats from the off list', () => {
    const s = read({ disabledTasks: ['translate', 'gone', 'ask', 'ask', UUID] }, [ROW]);
    expect(s.disabledTasks).toEqual(['ask', UUID]);
  });

  it('keeps a rule scoped to a task that is gone, so the rule matches nothing instead of everything', () => {
    const s = read({
      advanced: {
        rules: [
          {
            id: 'r',
            body: 'Keep it short',
            category: 'always',
            scope: { tasks: [UUID] },
            source: 'manual',
            addedAt: 'x',
          },
        ],
      },
    });
    expect(s.advanced.rules[0]?.scope.tasks).toEqual([UUID]);
    expect(filterRulesForRequest(s.advanced.rules, 'translate', undefined)).toEqual([]);
  });
});

describe('a stored rule scope with no id the schema accepts', () => {
  it.each([[['brand names']], [['', '_x']], ['summarize'], [[42]]])(
    'matches no task, instead of every task (%j)',
    (tasks) => {
      const s = read({
        advanced: {
          rules: [
            {
              id: 'r',
              body: 'Never translate brand names',
              category: 'never',
              scope: { tasks },
              source: 'manual',
              addedAt: 'x',
            },
          ],
        },
      });
      expect(s.advanced.rules).toHaveLength(1);
      expect(filterRulesForRequest(s.advanced.rules, 'summarize', undefined)).toEqual([]);
    },
  );

  it('keeps the valid ids beside a bad one', () => {
    const s = read({
      advanced: {
        rules: [
          {
            id: 'r',
            body: 'b',
            category: 'always',
            scope: { tasks: ['summarize', 'bad id'] },
            source: 'manual',
            addedAt: 'x',
          },
        ],
      },
    });
    expect(s.advanced.rules[0]?.scope.tasks).toEqual(['summarize']);
  });

  it('leaves an empty scope alone: that rule is meant for every task', () => {
    const s = read({
      advanced: {
        rules: [
          {
            id: 'r',
            body: 'b',
            category: 'always',
            scope: { tasks: [] },
            source: 'manual',
            addedAt: 'x',
          },
        ],
      },
    });
    expect(filterRulesForRequest(s.advanced.rules, 'ask', undefined)).toHaveLength(1);
  });
});
