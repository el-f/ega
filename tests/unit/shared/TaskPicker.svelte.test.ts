// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/svelte';
import TaskPicker from '@/shared/components/TaskPicker.svelte';
import { ALL_TASKS, TASK_LABELS } from '@/shared/task-prompts';

// jsdom runs no layout, so these assert DOM text only — widths are not observable here.

describe('TaskPicker button row (0.3.9)', () => {
  it('renders every task label in full (no pre-rendered truncation)', () => {
    const { getAllByRole } = render(TaskPicker, {
      props: { task: 'translate' },
    });
    const buttons = getAllByRole('radio').map((b) => b.textContent.trim());
    expect(buttons).toHaveLength(ALL_TASKS.length);
    // An ellipsis in textContent means the component truncates before CSS ever runs.
    for (const label of buttons) {
      expect(label).not.toMatch(/…$/);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('renders all buttons with the expected full labels', () => {
    const { getAllByRole } = render(TaskPicker, {
      props: { task: 'translate' },
    });
    const labels = getAllByRole('radio').map((b) => b.textContent.trim());
    expect(labels).toContain('Translate');
    expect(labels.some((l) => /^Summarize$/.test(l))).toBe(true);
    expect(labels.some((l) => /^Grammar$/.test(l))).toBe(true);
  });

  it('is a radio group named Task, in declaration order, with the active task checked', () => {
    const { getByRole, getAllByRole } = render(TaskPicker, {
      props: { task: 'reword' },
    });
    const group = getByRole('radiogroup', { name: 'Task' });
    expect(group.closest('[data-ega-task-picker]')).not.toBeNull();
    const radios = getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('data-ega-task'))).toEqual([...ALL_TASKS]);
    for (const r of radios) {
      const t = r.getAttribute('data-ega-task') as keyof typeof TASK_LABELS;
      expect(r.getAttribute('aria-label')).toBe(`Task: ${TASK_LABELS[t]}`);
      expect(r.getAttribute('aria-checked')).toBe(t === 'reword' ? 'true' : 'false');
      expect(r.classList.contains('active')).toBe(t === 'reword');
    }
    expect(getByRole('radio', { name: 'Task: Reword', checked: true })).toBeTruthy();
  });

  it('rings the checked chip in forced colors through the shared radio rule', () => {
    const src = readFileSync('src/shared/components/TaskPicker.svelte', 'utf8');
    expect(src).not.toMatch(/@media \(forced-colors: active\)/);
    const tokens = readFileSync('src/shared/tokens.css', 'utf8');
    expect(tokens).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\[role='radio'\]\[aria-checked='true'\][\s\S]*outline:\s*2px solid Highlight/,
    );
  });
});
