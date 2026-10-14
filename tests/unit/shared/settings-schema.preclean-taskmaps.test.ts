// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest';
import { sanitiseStoredSettings } from '@/shared/storage/sanitise';
import { buildTaskTemplate } from '@/shared/task-template';

afterEach(() => {
  vi.restoreAllMocks();
});

function read(stored: Record<string, unknown>) {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  return sanitiseStoredSettings(stored, []);
}

const SHIPPED = buildTaskTemplate('summarize');

describe('the old per-task templates and efforts', () => {
  it('move into task edits, each prompt half and effort on its own', () => {
    const s = read({
      advanced: { taskTemplates: { grammar: { system: 'Fix it.' }, ask: { user: 'Q: {{text}}' } } },
      taskReasoningEfforts: { summarize: 'high', translate: 'low' },
    });
    expect(s.taskOverrides).toEqual({
      grammar: { system: 'Fix it.' },
      ask: { user: 'Q: {{text}}' },
      summarize: { effort: 'high' },
      translate: { effort: 'low' },
    });
    const raw = s as unknown as Record<string, unknown>;
    expect(raw).not.toHaveProperty('taskReasoningEfforts');
    expect(s.advanced).not.toHaveProperty('taskTemplates');
  });

  it('turn page context on for a lifted half that reads {{context}}', () => {
    const s = read({
      advanced: { taskTemplates: { summarize: { system: 'Use {{context}}.', user: '{{text}}' } } },
    });
    expect(s.taskOverrides.summarize).toMatchObject({ pageContext: true });
  });

  it('read a stored copy of the shipped prompt as no edit', () => {
    const s = read({ advanced: { taskTemplates: { summarize: { ...SHIPPED } } } });
    expect(s.taskOverrides).toEqual({});
  });

  it('drop the Translate and Explain entries, which never ran', () => {
    const s = read({
      advanced: { taskTemplates: { translate: { system: 'x', user: '{{text}}' } } },
    });
    expect(s.taskOverrides).toEqual({});
  });

  it('win over a task edit for the same field, and leave its other fields', () => {
    const s = read({
      advanced: { taskTemplates: { grammar: { system: 'Old wins.' } } },
      taskOverrides: { grammar: { system: 'New loses.', effort: 'low' } },
    });
    expect(s.taskOverrides.grammar).toEqual({ system: 'Old wins.', effort: 'low' });
  });

  it('win for the effort too', () => {
    const s = read({
      taskReasoningEfforts: { grammar: 'high' },
      taskOverrides: { grammar: { effort: 'low', system: 'S' } },
    });
    expect(s.taskOverrides.grammar).toEqual({ effort: 'high', system: 'S' });
  });

  it('turn page context on for a half that reads {{context}} through a snippet', () => {
    const s = read({
      advanced: {
        snippets: { ctx: 'Page: {{context}}' },
        taskTemplates: { reword: { system: 'Rewrite using @@ctx@@.' } },
      },
    });
    // The snippet is written out too, so the lifted half reads the slot directly.
    expect(s.taskOverrides.reword).toEqual({
      system: 'Rewrite using Page: {{context}}.',
      pageContext: true,
    });
  });

  it('leave the rest of the row as it was', () => {
    const rule = {
      id: 'r1',
      body: 'Keep it short',
      category: 'always',
      scope: { tasks: [] },
      source: 'manual',
      addedAt: 'x',
      enabled: true,
    };
    const s = read({
      theme: 'dark',
      advanced: {
        promptTemplate: { system: 'Mine', user: '{{text}}' },
        rules: [rule],
        snippets: { sig: 'Thanks' },
        taskTemplates: { grammar: { system: 'Fix it.' } },
      },
      taskReasoningEfforts: { ask: 'low' },
    });
    expect(s.theme).toBe('dark');
    expect(s.advanced.promptTemplate).toEqual({ system: 'Mine', user: '{{text}}' });
    expect(s.advanced.rules).toEqual([rule]);
    // No prompt uses the snippet, so the read drops it.
    expect(s.advanced.snippets).toEqual({});
  });

  it('stay gone once the saved row is read again, so a reset after the move holds', () => {
    const once = read({ taskReasoningEfforts: { grammar: 'high' } });
    const reset = { ...once, taskOverrides: {} };
    const again = read(JSON.parse(JSON.stringify(reset)) as Record<string, unknown>);
    expect(again.taskOverrides).toEqual({});
  });
});
