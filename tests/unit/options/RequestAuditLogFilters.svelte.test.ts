// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import RequestAuditLogFilters from '@/options/components/RequestAuditLogFilters.svelte';
import { EMPTY_FILTERS } from '@/options/components/audit-filters';
import { materializeTasks } from '@/shared/task-view';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

const customViews = materializeTasks({ ...DEFAULT_SETTINGS } as Settings, [
  {
    id: 'c-tweet',
    label: 'Tweet summary',
    system: '',
    user: '{{text}}',
    output: 'plain',
    pageContext: false,
    image: false,
    glossary: false,
    createdAt: 1,
  },
]);

const optionsOf = (select: Element | null): string[][] =>
  [...(select?.querySelectorAll('option') ?? [])].map((o) => [o.value, o.textContent.trim()]);

describe('RequestAuditLogFilters', () => {
  it('is one row: Status, Task, Backend, then Search requests, with no preset chips', () => {
    const { container, getByLabelText } = render(RequestAuditLogFilters, {
      props: { filters: { ...EMPTY_FILTERS }, onChange: vi.fn() },
    });
    const labels = [...container.querySelectorAll('label')].map((l) => l.textContent.trim());
    expect(labels).toEqual(['Status', 'Task', 'Backend', 'Search requests']);
    expect(getByLabelText('Search requests').tagName).toBe('INPUT');
    expect(container.querySelector('[data-ega-audit-presets]')).toBeNull();
  });

  it('status options are words: All, OK, Errors, From cache', () => {
    const { container } = render(RequestAuditLogFilters, {
      props: { filters: { ...EMPTY_FILTERS }, onChange: vi.fn() },
    });
    expect(optionsOf(container.querySelector('[data-ega-audit-filter-status]'))).toEqual([
      ['all', 'All'],
      ['ok', 'OK'],
      ['error', 'Errors'],
      ['cache', 'From cache'],
    ]);
  });

  it('backend options are names, and a row no backend answered is "Ega (no backend)"', () => {
    const { container } = render(RequestAuditLogFilters, {
      props: { filters: { ...EMPTY_FILTERS }, onChange: vi.fn() },
    });
    const opts = optionsOf(container.querySelector('[data-ega-audit-filter-backend]'));
    expect(opts[0]).toEqual(['all', 'All']);
    expect(opts).toContainEqual(['anthropic', 'Anthropic']);
    expect(opts.at(-1)).toEqual(['unknown', 'Ega (no backend)']);
    expect(opts.map(([v]) => v)).not.toContain('auto');
  });

  it('lists custom tasks by name and keeps a deleted id an entry still carries', () => {
    const { container } = render(RequestAuditLogFilters, {
      props: {
        filters: { ...EMPTY_FILTERS },
        onChange: vi.fn(),
        taskViews: customViews,
        seenTasks: ['c-gone'],
      },
    });
    const opts = optionsOf(container.querySelector('[data-ega-audit-filter-task]'));
    expect(opts[0]).toEqual(['all', 'All']);
    expect(opts).toContainEqual(['c-tweet', 'Tweet summary']);
    expect(opts).toContainEqual(['c-gone', 'Deleted task']);
    expect(opts).toContainEqual(['backend-test', 'Backend test']);
  });

  it('each control writes its own field and keeps the others', async () => {
    const onChange = vi.fn();
    const start = { ...EMPTY_FILTERS, task: 'explain' };
    const { container, getByLabelText } = render(RequestAuditLogFilters, {
      props: { filters: start, onChange },
    });
    await fireEvent.change(container.querySelector('[data-ega-audit-filter-status]') as Element, {
      target: { value: 'cache' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...start, status: 'cache' });
    await fireEvent.input(getByLabelText('Search requests'), { target: { value: 'hola' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...start, query: 'hola' });
  });
});
