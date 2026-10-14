import { it, expect } from 'vitest';
import { ALL_TASKS, TASK_LABELS, TASK_GERUND } from '@/shared/task-prompts';
import { buildTaskTemplate } from '@/shared/task-template';
import { TASK_DESCRIPTIONS } from '@/options/task-descriptions';

it('ask is a known task with label/gerund/description', () => {
  expect(ALL_TASKS).toContain('ask');
  expect(TASK_LABELS.ask).toBeTruthy();
  expect(TASK_GERUND.ask).toBeTruthy();
  expect(TASK_DESCRIPTIONS.ask).toBeTruthy();
});

it('buildTaskTemplate(ask) returns a conversational JSON-returning template', () => {
  const t = buildTaskTemplate('ask');
  expect(t.system).toMatch(/JSON/i);
  expect(t.user).toContain('{{text}}');
});
