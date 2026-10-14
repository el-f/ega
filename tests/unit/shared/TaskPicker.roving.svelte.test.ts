// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TaskPicker from '@/shared/components/TaskPicker.svelte';
import { ALL_TASKS } from '@/shared/task-prompts';

const segs = (container: HTMLElement): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>('[data-ega-task]'),
];

describe('TaskPicker — roving tabindex', () => {
  it('exactly one segment is a Tab stop (the active one)', () => {
    const { container } = render(TaskPicker, {
      props: { task: 'translate' },
    });
    const buttons = segs(container);
    expect(buttons).toHaveLength(ALL_TASKS.length);
    const stops = buttons.filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.getAttribute('data-ega-task')).toBe('translate');
    for (const b of buttons) {
      if (b !== stops[0]) expect(b.tabIndex).toBe(-1);
    }
  });

  it('ArrowRight selects and focuses the next segment', async () => {
    const { container } = render(TaskPicker, {
      props: { task: 'translate' },
    });
    const buttons = segs(container);
    const first = buttons[0];
    if (!first) throw new Error('no segments rendered');
    first.focus();
    await fireEvent.keyDown(first, { key: 'ArrowRight' });
    await tick();

    const next = segs(container)[1];
    expect(next?.getAttribute('aria-checked')).toBe('true');
    expect(next?.tabIndex).toBe(0);
    expect(segs(container)[0]?.getAttribute('aria-checked')).toBe('false');
    expect(segs(container)[0]?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(next);
  });

  it('ArrowLeft wraps from the first to the last segment', async () => {
    const { container } = render(TaskPicker, {
      props: { task: 'translate' },
    });
    const first = segs(container)[0];
    if (!first) throw new Error('no segments rendered');
    await fireEvent.keyDown(first, { key: 'ArrowLeft' });
    await tick();
    const last = segs(container).at(-1);
    expect(last?.getAttribute('aria-checked')).toBe('true');
    expect(last?.tabIndex).toBe(0);
  });

  it('Home and End jump to the first / last segment', async () => {
    const { container } = render(TaskPicker, {
      props: { task: 'translate' },
    });
    const first = segs(container)[0];
    if (!first) throw new Error('no segments rendered');
    await fireEvent.keyDown(first, { key: 'End' });
    await tick();
    expect(segs(container).at(-1)?.getAttribute('aria-checked')).toBe('true');
    const current = segs(container).at(-1);
    if (!current) throw new Error('no segments rendered');
    await fireEvent.keyDown(current, { key: 'Home' });
    await tick();
    expect(segs(container)[0]?.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking a segment selects it', async () => {
    const { container } = render(TaskPicker, {
      props: { task: 'translate' },
    });
    const target = container.querySelector<HTMLButtonElement>('[data-ega-task="explain"]');
    if (!target) throw new Error('explain segment missing');
    await fireEvent.click(target);
    expect(target.getAttribute('aria-checked')).toBe('true');
    expect(target.tabIndex).toBe(0);
  });
});

describe('TaskPicker — arrows stay inside the picker', () => {
  const onWindowKey = vi.fn();
  afterEach(() => {
    window.removeEventListener('keydown', onWindowKey);
    onWindowKey.mockReset();
  });

  // The side panel's window handler moves focus to a conversation turn on the same keys.
  it.each(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'])(
    '%s does not reach the window',
    async (key) => {
      const { container } = render(TaskPicker, { props: { task: 'reword' } });
      window.addEventListener('keydown', onWindowKey);
      const current = container.querySelector<HTMLButtonElement>('[data-ega-task="reword"]');
      if (!current) throw new Error('reword segment missing');
      await fireEvent.keyDown(current, { key });
      expect(onWindowKey).not.toHaveBeenCalled();
      // The key was still handled, not just swallowed.
      expect(current.getAttribute('aria-checked')).toBe('false');
    },
  );

  it('other keys still bubble to the window', async () => {
    const { container } = render(TaskPicker, { props: { task: 'reword' } });
    window.addEventListener('keydown', onWindowKey);
    const current = container.querySelector<HTMLButtonElement>('[data-ega-task="reword"]');
    if (!current) throw new Error('reword segment missing');
    await fireEvent.keyDown(current, { key: 'c' });
    expect(onWindowKey).toHaveBeenCalledTimes(1);
  });
});
