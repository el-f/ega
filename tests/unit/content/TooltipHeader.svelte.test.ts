// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TooltipHeader from '@/content/tooltip/TooltipHeader.svelte';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';

function mount(usesTone: boolean) {
  const onTaskChange = vi.fn();
  const utils = render(TooltipHeader, {
    props: { task: 'reword', tone: 'neutral', usesTone, onTaskChange },
  });
  const select = (attr: string): HTMLSelectElement => {
    const el = utils.container.querySelector<HTMLSelectElement>(`[${attr}]`);
    if (!el) throw new Error(`missing ${attr}`);
    return el;
  };
  return { ...utils, onTaskChange, select };
}

describe('TooltipHeader', () => {
  it('a task change keeps the current tone', async () => {
    const { select, onTaskChange } = mount(true);
    await fireEvent.change(select('data-ega-task-select'), { target: { value: 'summarize' } });
    expect(onTaskChange).toHaveBeenCalledWith('summarize', 'neutral');
  });

  it('a tone change keeps the current task', async () => {
    const { select, onTaskChange } = mount(true);
    await fireEvent.change(select('data-ega-tone-select'), { target: { value: 'formal' } });
    expect(onTaskChange).toHaveBeenCalledWith('reword', 'formal');
  });

  it('shows no tone select when the prompt has no {{tone}} slot', () => {
    const { container } = mount(false);
    expect(container.querySelector('[data-ega-tone-select]')).toBeNull();
    expect(container.querySelector('[data-ega-task-select]')).not.toBeNull();
  });
});

describe('TooltipHeader — your own tasks in a page-readable shadow root', () => {
  const custom = {
    id: '6f1c1f9e-2b7a-4c1e-9a55-0d3f5e1b2c44',
    kind: 'custom' as const,
    gerund: 'Working',
    notesLabel: 'Notes',
    refinePresets: [],
    answersIn: 'target' as const,
    label: 'Legal',
    output: 'plain' as const,
    pageContext: false,
    image: false,
    glossary: false,
    usesTone: false,
    disabled: false,
    hasOverrides: false,
  };

  it('never puts a custom task id in the page DOM, and still reports it on change', async () => {
    const onTaskChange = vi.fn();
    const { container } = render(TooltipHeader, {
      props: {
        task: custom.id,
        tone: 'neutral',
        usesTone: false,
        views: [...SHIPPED_TASK_VIEWS, custom],
        onTaskChange,
      },
    });
    expect(container.innerHTML).not.toContain(custom.id);
    const select = container.querySelector<HTMLSelectElement>('[data-ega-task-select]');
    if (!select) throw new Error('no select');
    expect(select.selectedOptions[0]?.textContent).toContain('Legal');
    await fireEvent.change(select, { target: { value: 'explain' } });
    expect(onTaskChange).toHaveBeenLastCalledWith('explain', 'neutral');
    const customValue = [...select.options].find((o) => o.textContent.includes('Legal'))?.value;
    await fireEvent.change(select, { target: { value: customValue } });
    expect(onTaskChange).toHaveBeenLastCalledWith(custom.id, 'neutral');
  });
});
