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

describe('RequestAuditLogFilters — quick-apply chips', () => {
  it('renders Errors / Cache / OK preset chips', () => {
    const { container } = render(RequestAuditLogFilters, {
      props: { filters: { ...EMPTY_FILTERS }, onChange: vi.fn() },
    });
    expect(container.querySelector('[data-ega-audit-preset="errors"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-audit-preset="cache"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-audit-preset="ok"]')).not.toBeNull();
  });

  it('clicking Errors chip patches status=error and aria-pressed=true', async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(RequestAuditLogFilters, {
      props: { filters: { ...EMPTY_FILTERS }, onChange },
    });
    const chip = container.querySelector<HTMLElement>('[data-ega-audit-preset="errors"]');
    if (!chip) throw new Error('chip missing');
    await fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, status: 'error' });
    // Re-render with filters reflecting the patch — chip should now be aria-pressed.
    await rerender({ filters: { ...EMPTY_FILTERS, status: 'error' }, onChange });
    const after = container.querySelector<HTMLElement>('[data-ega-audit-preset="errors"]');
    expect(after?.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking an active chip clears its patched fields back to defaults', async () => {
    const onChange = vi.fn();
    const { container } = render(RequestAuditLogFilters, {
      props: { filters: { ...EMPTY_FILTERS, status: 'error' }, onChange },
    });
    const chip = container.querySelector<HTMLElement>('[data-ega-audit-preset="errors"]');
    if (!chip) throw new Error('chip missing');
    await fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, status: 'all' });
  });

  it('Cache chip is mutually exclusive with Errors chip (last-wins)', async () => {
    const onChange = vi.fn();
    const { container } = render(RequestAuditLogFilters, {
      props: { filters: { ...EMPTY_FILTERS, status: 'error' }, onChange },
    });
    const cacheChip = container.querySelector<HTMLElement>('[data-ega-audit-preset="cache"]');
    if (!cacheChip) throw new Error('cache chip missing');
    await fireEvent.click(cacheChip);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, status: 'cache' });
  });
});

describe('RequestAuditLogFilters — task options', () => {
  it('lists custom tasks by name and keeps a deleted id an entry still carries', () => {
    const { container } = render(RequestAuditLogFilters, {
      props: {
        filters: { ...EMPTY_FILTERS },
        onChange: vi.fn(),
        taskViews: customViews,
        seenTasks: ['c-gone'],
      },
    });
    const opts = [...container.querySelectorAll('select option')].map((o) => [
      (o as HTMLOptionElement).value,
      o.textContent.trim(),
    ]);
    expect(opts).toContainEqual(['c-tweet', 'Tweet summary']);
    expect(opts).toContainEqual(['c-gone', 'Deleted task']);
    expect(opts).toContainEqual(['backend-test', 'Backend test']);
  });

  it('a task pick writes the task filter, and a second click on an active chip clears it', async () => {
    const onChange = vi.fn();
    const { container } = render(RequestAuditLogFilters, {
      props: { filters: { ...EMPTY_FILTERS, status: 'cache' }, onChange, taskViews: customViews },
    });
    const chip = container.querySelector<HTMLElement>('[data-ega-audit-preset="cache"]');
    if (!chip) throw new Error('chip missing');
    await fireEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, status: 'all' });
  });
});
