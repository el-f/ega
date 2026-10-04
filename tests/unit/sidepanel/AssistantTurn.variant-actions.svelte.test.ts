// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';

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
  it('renders swap button and task-switch select when isLatest + done + onSwap provided', () => {
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

  it('changing task-switch select calls onTaskSwitch(turnId, task)', async () => {
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
    const select = container.querySelector<HTMLSelectElement>('[data-ega-task-switch]');
    if (!select) throw new Error('task-switch select missing');
    await fireEvent.change(select, { target: { value: 'summarize' } });
    expect(onTaskSwitch).toHaveBeenCalledWith('a1', 'summarize');
  });

  it('a busy task switch gives its reason on a wrapper, since a native select draws no ::after', () => {
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
    const select = container.querySelector<HTMLSelectElement>('[data-ega-task-switch]');
    expect(select?.disabled).toBe(true);
    expect(select?.hasAttribute('data-tooltip')).toBe(false);
    expect(select?.closest('[data-tooltip]')?.getAttribute('data-tooltip')).toBe(
      'Wait for this reply to finish',
    );
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

  it('swap button is disabled when swapDisabled is true', () => {
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
    expect(btn?.disabled).toBe(true);
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
    expect(btn?.disabled).toBe(false);
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
    const select = container.querySelector<HTMLSelectElement>('[data-ega-task-switch]');
    // A visible <label> is the accessible name now; an aria-label beside it would override the text.
    expect(select?.getAttribute('aria-label')).toBeNull();
    expect(container.querySelector(`label[for="${select?.id ?? ''}"]`)?.textContent.trim()).toBe(
      'Re-run as',
    );
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
