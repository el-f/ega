// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import { checkedTask, openTaskMenu, taskMenuItems } from './_task-menu';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';

const singleTurn = (overrides: Partial<AssistantTurnData> = {}): AssistantTurnData => ({
  id: 'a1',
  role: 'assistant',
  createdAt: 1,
  kind: 'translate',
  status: 'done',
  content: 'hello',
  ...overrides,
});

const turnWithVariants = (overrides: Partial<AssistantTurnData> = {}): AssistantTurnData => ({
  id: 'a1',
  role: 'assistant',
  createdAt: 1,
  kind: 'translate',
  status: 'done',
  content: 'hello',
  variants: [
    { id: 'v0', status: 'done', content: 'hello' },
    { id: 'v1', status: 'done', content: 'a summary', task: 'explain' },
  ],
  activeVariantIdx: 1,
  ...overrides,
});

describe('AssistantTurn — a task-switch variant says which task answered', () => {
  it('labels the active task variant with its own task', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: turnWithVariants(), onRetry: vi.fn(), isLatest: true },
    });
    expect(container.querySelector('.ega-task-chip')?.textContent.trim()).toBe('Explain');
    // It states what answered, like the language chip; "Re-run as" read as a control.
    expect(container.querySelector('.ega-task-chip')?.getAttribute('data-tooltip')).toBe(
      'Answered as Explain',
    );
  });

  it('drops the chip when the original variant is active again', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: turnWithVariants({ activeVariantIdx: 0 }),
        onRetry: vi.fn(),
        isLatest: true,
      },
    });
    expect(container.querySelector('.ega-task-chip')).toBeNull();
  });

  it('the streaming skeleton names the variant task, not the turn kind', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: turnWithVariants({
          status: 'pending',
          content: '',
          variants: [{ id: 'v1', status: 'pending', content: '', task: 'summarize' }],
          activeVariantIdx: 0,
        }),
        onRetry: vi.fn(),
        isLatest: true,
      },
    });
    expect(container.querySelector('.ega-stream-skeleton-label')?.textContent).toContain(
      'Summarizing',
    );
  });

  it('the Try as menu shows the variant task checked', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: turnWithVariants(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    expect(await checkedTask(container)).toBe('explain');
  });
});

describe('AssistantTurn — image turns only offer the tasks that reach the vision model', () => {
  it('offers translate and explain only', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: singleTurn({ kind: 'image-translate' }),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    await openTaskMenu(container);
    const values = taskMenuItems().map(([id]) => id);
    expect(values).toEqual(['translate', 'explain']);
  });

  it('restricts an Explain turn whose paired user turn carried an image', async () => {
    // The assistant turn's own kind is 'explain'; the stream tells it about the image.
    const { container } = render(AssistantTurn, {
      props: {
        turn: singleTurn({ kind: 'explain' }),
        onRetry: vi.fn(),
        isLatest: true,
        hasImage: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    await openTaskMenu(container);
    const values = taskMenuItems().map(([id]) => id);
    expect(values).toEqual(['translate', 'explain']);
  });

  it('still offers every task on a text turn', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: singleTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    await openTaskMenu(container);
    const values = taskMenuItems().map(([id]) => id);
    expect(values.length).toBeGreaterThan(2);
    expect(values).toContain('summarize');
  });
});

describe('AssistantTurn — re-run controls need a dispatch to replay', () => {
  it('hides swap and task-switch when the turn cannot be retried', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: singleTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        canRetry: false,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-swap]')).toBeNull();
    expect(container.querySelector('[data-ega-task-switch]')).toBeNull();
  });

  it('shows them when it can', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: singleTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        canRetry: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-swap]')).not.toBeNull();
    expect(container.querySelector('[data-ega-task-switch]')).not.toBeNull();
  });
});
