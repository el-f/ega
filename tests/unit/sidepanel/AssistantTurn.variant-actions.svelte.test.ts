// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import { openTaskMenu, pickTask } from './_task-menu';

const baseTurn = (overrides: Partial<AssistantTurnData> = {}): AssistantTurnData => ({
  id: 'a1',
  role: 'assistant',
  createdAt: 1,
  kind: 'translate',
  status: 'done',
  content: 'hello',
  variants: [
    {
      id: 'v1',
      status: 'done',
      content: 'hello',
    },
  ],
  activeVariantIdx: 0,
  ...overrides,
});

describe('AssistantTurn — swap + task-switch actions', () => {
  it('renders swap button and the Try as menu when isLatest + done + onSwap provided', () => {
    const onSwap = vi.fn();
    const onTaskSwitch = vi.fn();
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap,
        onTaskSwitch,
      },
    });
    expect(container.querySelector('[data-ega-swap]')).not.toBeNull();
    expect(container.querySelector('[data-ega-task-switch]')).not.toBeNull();
  });

  it('clicking swap button calls onSwap(turnId)', async () => {
    const onSwap = vi.fn();
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap,
        onTaskSwitch: vi.fn(),
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    if (!btn) throw new Error('swap btn missing');
    await fireEvent.click(btn);
    expect(onSwap).toHaveBeenCalledWith('a1');
  });

  it('picking a task in the Try as menu calls onTaskSwitch(turnId, task)', async () => {
    const onTaskSwitch = vi.fn();
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch,
      },
    });
    await pickTask(container, 'explain');
    expect(onTaskSwitch).toHaveBeenCalledTimes(1);
    expect(onTaskSwitch).toHaveBeenCalledWith('a1', 'explain');
  });

  it('arrow keys only move the highlight; Enter on the highlighted task re-runs once', async () => {
    const onTaskSwitch = vi.fn();
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch,
      },
    });
    await openTaskMenu(container);
    // A keyboard open focuses the first item; arrows then move focus, and the highlight follows it.
    const focusedItem = (): HTMLElement => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || !el.hasAttribute('data-ega-task-switch-item')) {
        throw new Error('no task item focused');
      }
      return el;
    };
    await waitFor(focusedItem);
    await fireEvent.keyDown(focusedItem(), { key: 'ArrowDown' });
    await fireEvent.keyDown(focusedItem(), { key: 'ArrowDown' });
    await tick();
    expect(onTaskSwitch).not.toHaveBeenCalled();
    const highlighted = focusedItem();
    expect(highlighted.getAttribute('data-ega-task-switch-item')).not.toBe('translate');
    await fireEvent.keyDown(highlighted, { key: 'Enter' });
    await tick();
    expect(onTaskSwitch).toHaveBeenCalledTimes(1);
    expect(onTaskSwitch).toHaveBeenCalledWith(
      'a1',
      highlighted.getAttribute('data-ega-task-switch-item'),
    );
  });

  it('picking the task that already answered re-runs nothing', async () => {
    const onTaskSwitch = vi.fn();
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch,
      },
    });
    await pickTask(container, 'translate');
    expect(onTaskSwitch).not.toHaveBeenCalled();
  });

  it('a busy Try as stays focusable, names its reason, and opens no menu', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
        inflight: true,
      },
    });
    const trigger = container.querySelector<HTMLButtonElement>('[data-ega-task-switch]');
    if (!trigger) throw new Error('trigger missing');
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.getAttribute('data-tooltip')).toBe('Wait for this reply to finish');
    expect(trigger.getAttribute('aria-label')).toBe('Try as… — wait for this reply to finish');
    // One gesture at a time: a key then a click would toggle twice and close an open menu.
    const menuOpens = (): Promise<void> =>
      waitFor(
        () => {
          if (!document.querySelector('[data-ega-task-switch-item]')) throw new Error('closed');
        },
        { timeout: 300 },
      );
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    await expect(menuOpens()).rejects.toThrow();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(trigger);
    await expect(menuOpens()).rejects.toThrow();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not render swap or task-switch when isLatest is false', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: false,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-swap]')).toBeNull();
    expect(container.querySelector('[data-ega-task-switch]')).toBeNull();
  });

  it('does not render when status is not done', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn({ status: 'streaming', variants: [] }),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-swap]')).toBeNull();
    expect(container.querySelector('[data-ega-task-switch]')).toBeNull();
  });

  it('swap button is aria-disabled when swapDisabled is true', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
        swapDisabled: true,
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
  });

  it('a blocked swap stays focusable, says why in its name, and does nothing on click', async () => {
    const onSwap = vi.fn();
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap,
        onTaskSwitch: vi.fn(),
        swapDisabled: true,
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    if (!btn) throw new Error('swap btn missing');
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.tabIndex).toBe(0);
    expect(btn.textContent.trim()).toBe('Swap');
    expect(btn.getAttribute('aria-label')).toBe(
      'Swap languages — no source language to swap from yet',
    );
    await fireEvent.click(btn);
    expect(onSwap).not.toHaveBeenCalled();
  });

  it('swap button is enabled when swapDisabled is false', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
        swapDisabled: false,
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    expect(btn?.getAttribute('aria-disabled')).toBe('false');
  });

  it('disabled swap button explains why via data-tooltip', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
        swapDisabled: true,
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    expect(btn?.getAttribute('data-tooltip')).toBe('No source language to swap from yet');
  });

  it('enabled swap button tooltip describes the action', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
        swapDisabled: false,
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    expect(btn?.getAttribute('data-tooltip')).toBe('Swap languages and re-run');
  });

  // The block is gated on latest+done+onSwap, NOT on task=translate, so the
  // copy must stay task-neutral — currentTaskValue can be explain/summarize.
  it('swap + task-switch copy is task-neutral for a non-translate turn', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn({ kind: 'explain' }),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
        swapDisabled: false,
      },
    });
    const swap = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    expect(swap?.getAttribute('aria-label')).toBe('Swap languages and re-run');
    expect(swap?.getAttribute('data-tooltip')).toBe('Swap languages and re-run');
    const trigger = container.querySelector<HTMLButtonElement>('[data-ega-task-switch]');
    // The visible text is the accessible name; an aria-label beside it would override the text.
    expect(trigger?.getAttribute('aria-label')).toBeNull();
    expect(trigger?.textContent.trim()).toBe('Try as…');
  });

  it('disabled swap tooltip is preserved (task-neutral did not break it)', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn({ kind: 'summarize' }),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
        swapDisabled: true,
      },
    });
    const swap = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    expect(swap?.getAttribute('data-tooltip')).toBe('No source language to swap from yet');
  });
});
