// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TaskPicker from '@/shared/components/TaskPicker.svelte';
import TooltipHeader from '@/content/tooltip/TooltipHeader.svelte';
import TooltipActions from '@/content/tooltip/TooltipActions.svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Turn } from '@/sidepanel/state/conversation';
import type { Settings } from '@/shared/types';
import { SHIPPED_TASK_VIEWS, type TaskView } from '@/shared/task-view';
import { openMenu } from '../sidepanel/_reply';

const onlyOn = (ids: readonly string[]): TaskView[] =>
  SHIPPED_TASK_VIEWS.map((v) => ({ ...v, disabled: !ids.includes(v.id) }));

const chips = (c: HTMLElement): string[] =>
  [...c.querySelectorAll('[data-ega-task]')].map((el) => el.getAttribute('data-ega-task') ?? '');

const options = (select: Element | null): Array<[string, boolean]> =>
  [...(select?.querySelectorAll('option') ?? [])].map((o) => [o.value, o.disabled]);

describe('side panel task chips', () => {
  it('offers the tasks it is given, in shipped order', () => {
    const { container } = render(TaskPicker, {
      props: { task: 'translate', views: onlyOn(['translate', 'reword', 'explain']) },
    });
    expect(chips(container)).toEqual(['translate', 'explain', 'reword']);
  });

  it('keeps the current task when it is off, so a chip stays checked', () => {
    const { container } = render(TaskPicker, {
      props: { task: 'summarize', views: onlyOn(['translate']) },
    });
    expect(chips(container)).toEqual(['translate', 'summarize']);
  });
});

describe('tooltip', () => {
  it('the task select offers on tasks and keeps an off current task disabled', () => {
    const { container } = render(TooltipHeader, {
      props: {
        task: 'reword',
        tone: 'neutral',
        usesTone: false,
        views: onlyOn(['translate', 'explain']),
        onTaskChange: vi.fn(),
      },
    });
    expect(options(container.querySelector('[data-ega-task-select]'))).toEqual([
      ['translate', false],
      ['explain', false],
      ['reword', true],
    ]);
  });

  it('hides Explain when the Explain task is off', () => {
    const base = {
      tip: {
        srcText: 'hola',
        body: 'hello',
        loading: false,
        confidencePill: false,
        left: 0,
        top: 0,
        settled: true,
      },
      mode: 'success' as const,
      hasSwap: false,
      swapDisabled: true,
      hasDetails: false,
      detailsOpen: false,
      onCancel: vi.fn(),
      onCopy: vi.fn(),
      onExplain: vi.fn(),
      onToggleDetails: vi.fn(),
    };
    const on = render(TooltipActions, { props: base });
    expect(on.container.querySelector('[aria-label="Explain this translation"]')).not.toBeNull();
    const off = render(TooltipActions, { props: { ...base, explainOn: false } });
    expect(off.container.querySelector('[aria-label="Explain this translation"]')).toBeNull();
  });
});

describe('Answer again as', () => {
  const turn: Turn = {
    id: 'a1',
    role: 'assistant',
    createdAt: 1,
    kind: 'summarize',
    status: 'done',
    content: 'short',
  };

  it('offers the tasks that are on, never the reply own task', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn,
        isLatest: true,
        onRetry: vi.fn(),
        onTaskSwitch: vi.fn(),
        onSwap: vi.fn(),
        canRetry: true,
        taskViews: onlyOn(['translate', 'grammar']),
      },
    });
    await openMenu(container, 'more');
    const offered = Array.from(document.querySelectorAll('[data-ega-answer-again]')).map((i) =>
      i.getAttribute('data-ega-answer-again'),
    );
    expect(offered).toEqual(['translate', 'grammar']);
  });
});

describe('context-menu manager', () => {
  it('the Task select marks off tasks "(off)" and keeps the row own off task, disabled', async () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      disabledTasks: ['explain', 'reword'],
      contextMenuItems: DEFAULT_SETTINGS.contextMenuItems.map((i) =>
        i.id === 'ega-translate-selection' && i.kind === 'task' ? { ...i, task: 'reword' } : i,
      ),
    };
    const { container } = render(ContextMenuManager, { props: { s, onPatch: vi.fn() } });
    const row = container.querySelector('[data-ega-cm-id="ega-translate-selection"]');
    await fireEvent.click(row?.querySelector('[data-ega-cm-edit]') as HTMLElement);
    const rewordItem = options(row?.querySelector('select[data-ega-cm-task]') ?? null);
    expect(rewordItem).toContainEqual(['reword', true]);
    expect(rewordItem).toContainEqual(['explain', true]);
    expect(rewordItem).toContainEqual(['translate', false]);
    // The row says why Chrome leaves it out.
    expect(row?.querySelector('[data-ega-cm-status]')?.textContent.trim()).toBe(
      'Hidden: Reword is off in Tasks',
    );
    // The image Task radios mark and disable an off task the same way...
    const radiosOf = async (id: string): Promise<(string | boolean | undefined)[][]> => {
      const image = container.querySelector(`[data-ega-cm-id="${id}"]`);
      await fireEvent.click(image?.querySelector('[data-ega-cm-edit]') as HTMLElement);
      return [...(image?.querySelectorAll('[data-ega-cm-task] [role="radio"]') ?? [])].map((r) => [
        r.closest('label')?.textContent.trim(),
        r.hasAttribute('disabled'),
      ]);
    };
    expect(await radiosOf('ega-translate-image')).toEqual([
      ['Translate', false],
      ['Explain (off)', true],
    ]);
    // ...but not the row's own task: the checked radio is the group's only tab stop.
    expect(await radiosOf('ega-explain-image')).toEqual([
      ['Translate', false],
      ['Explain (off)', false],
    ]);
  });
});

describe('tooltip with custom tasks', () => {
  it('lists a custom task, and a deleted current task shows as "Deleted task"', () => {
    const first = SHIPPED_TASK_VIEWS[0];
    if (!first) throw new Error('no shipped views');
    const views: TaskView[] = [
      ...SHIPPED_TASK_VIEWS,
      { ...first, id: 'c-tweet', kind: 'custom', label: 'Tweet summary' },
    ];
    const listed = render(TooltipHeader, {
      props: { task: 'translate', tone: 'neutral', usesTone: false, views, onTaskChange: vi.fn() },
    });
    // A custom task's option carries a position, never its id: the tooltip's shadow root is page-readable.
    const tweet = [
      ...(listed.container.querySelector('[data-ega-task-select]')?.querySelectorAll('option') ??
        []),
    ].find((o) => o.textContent.trim() === 'Tweet summary');
    expect(tweet?.disabled).toBe(false);
    expect(tweet?.value).not.toBe('c-tweet');
    const gone = render(TooltipHeader, {
      props: { task: 'c-gone', tone: 'neutral', usesTone: false, views, onTaskChange: vi.fn() },
    });
    const select = gone.container.querySelector('[data-ega-task-select]');
    const last = select?.querySelector('option:last-child');
    expect([
      last?.getAttribute('value'),
      last?.textContent.trim(),
      (last as HTMLOptionElement | null)?.disabled,
    ]).toEqual([expect.not.stringContaining('c-gone'), 'Deleted task', true]);
  });
});
