// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

const singleTurn = (overrides: Partial<Turn> = {}): Turn => ({
  id: 'a1',
  role: 'assistant',
  createdAt: 1,
  kind: 'translate',
  status: 'done',
  content: 'hello',
  ...overrides,
});

const turnWithVariants = (overrides: Partial<Turn> = {}): Turn => ({
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

  it('the task select shows the variant task', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: turnWithVariants(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const select = container.querySelector<HTMLSelectElement>('[data-ega-task-switch]');
    expect(select?.value).toBe('explain');
  });
});

describe('AssistantTurn — image turns only offer the tasks that reach the vision model', () => {
  it('offers translate and explain only', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: singleTurn({ kind: 'image-translate' }),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const values = [...container.querySelectorAll('[data-ega-task-switch] option')].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(['translate', 'explain']);
  });

  it('restricts an Explain turn whose paired user turn carried an image', () => {
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
    const values = [...container.querySelectorAll('[data-ega-task-switch] option')].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(['translate', 'explain']);
  });

  it('still offers every task on a text turn', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: singleTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const values = [...container.querySelectorAll('[data-ega-task-switch] option')].map(
      (o) => (o as HTMLOptionElement).value,
    );
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
