// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
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

describe('AssistantTurn — word-diff on variant supersede', () => {
  it('renders del + add diff markers when active variant differs from prior', () => {
    const turn = baseTurn({
      variants: [
        { id: 'v0', status: 'done', content: 'the cat sat' },
        { id: 'v1', status: 'done', content: 'the dog sat', refinementBody: 'shorter' },
      ],
      activeVariantIdx: 1,
      content: 'the dog sat',
      status: 'done',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    const del = container.querySelector('[data-ega-diff="del"]');
    const add = container.querySelector('[data-ega-diff="add"]');
    expect(del).not.toBeNull();
    expect(del?.textContent).toContain('cat');
    expect(add).not.toBeNull();
    expect(add?.textContent).toContain('dog');
  });

  it('renders no diff markers for a single-variant turn', () => {
    const turn = baseTurn({
      variants: [{ id: 'v0', status: 'done', content: 'the cat sat' }],
      activeVariantIdx: 0,
      content: 'the cat sat',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-diff]')).toBeNull();
  });

  it('renders no diff markers when both variants have identical content', () => {
    const turn = baseTurn({
      variants: [
        { id: 'v0', status: 'done', content: 'same text' },
        { id: 'v1', status: 'done', content: 'same text' },
      ],
      activeVariantIdx: 1,
      content: 'same text',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-diff]')).toBeNull();
  });

  it('renders no diff markers when active variant is not done', () => {
    const turn = baseTurn({
      variants: [
        { id: 'v0', status: 'done', content: 'the cat sat' },
        { id: 'v1', status: 'streaming', content: 'the dog' },
      ],
      activeVariantIdx: 1,
      content: 'the dog',
      status: 'streaming',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-diff]')).toBeNull();
  });

  it('diff container has dir="auto" for RTL correctness', () => {
    const turn = baseTurn({
      variants: [
        { id: 'v0', status: 'done', content: 'the cat sat' },
        { id: 'v1', status: 'done', content: 'the dog sat', refinementBody: 'shorter' },
      ],
      activeVariantIdx: 1,
      content: 'the dog sat',
      status: 'done',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    const body = container.querySelector('.ega-assistant-body');
    expect(body?.getAttribute('dir')).toBe('auto');
  });
});

describe('AssistantTurn — task-switch select value', () => {
  it('select reflects turn kind when task is valid', () => {
    const turn = baseTurn({ kind: 'summarize' });
    const { container } = render(AssistantTurn, {
      props: {
        turn,
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const sel = container.querySelector('[data-ega-task-switch]') as HTMLSelectElement | null;
    expect(sel).not.toBeNull();
    expect(sel?.value).toBe('summarize');
  });

  it('select defaults to translate for non-Task turn kinds', () => {
    const turn = baseTurn({ kind: 'image-translate' });
    const { container } = render(AssistantTurn, {
      props: {
        turn,
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const sel = container.querySelector('[data-ega-task-switch]') as HTMLSelectElement | null;
    expect(sel).not.toBeNull();
    expect(sel?.value).toBe('translate');
  });
});

describe('AssistantTurn — diff with a word changed more than once', () => {
  it('renders when the diff repeats an identical op (no duplicate-key crash)', () => {
    const turn = baseTurn({
      variants: [
        { id: 'v0', status: 'done', content: 'x A y A z' },
        { id: 'v1', status: 'done', content: 'x B y B z', refinementBody: 'swap' },
      ],
      activeVariantIdx: 1,
      content: 'x B y B z',
      status: 'done',
    });
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    expect(container.querySelectorAll('[data-ega-diff="del"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-ega-diff="add"]')).toHaveLength(2);
  });
});
