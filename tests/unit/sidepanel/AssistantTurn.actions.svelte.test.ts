// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

function doneTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 'a1',
    role: 'assistant',
    createdAt: 1,
    kind: 'translate',
    status: 'done',
    content: 'result',
    attachedToTurnId: 'u1',
    ...overrides,
  };
}

describe('AssistantTurn — per-turn actions', () => {
  it('renders regenerate button when done + canRetry=true', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), canRetry: true },
    });
    expect(container.querySelector('[data-ega-regenerate]')).not.toBeNull();
  });

  it('regenerate click fires onRegenerate(id)', async () => {
    const onRegenerate = vi.fn();
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), canRetry: true, onRegenerate },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-regenerate]');
    if (!btn) throw new Error('regenerate btn missing');
    await fireEvent.click(btn);
    expect(onRegenerate).toHaveBeenCalledWith('a1');
  });

  it('omits regenerate button when canRetry=false', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), canRetry: false },
    });
    expect(container.querySelector('[data-ega-regenerate]')).toBeNull();
  });

  it('omits regenerate button when status is not done', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: doneTurn({ status: 'streaming', content: 'partial' }),
        onRetry: vi.fn(),
        canRetry: true,
      },
    });
    expect(container.querySelector('[data-ega-regenerate]')).toBeNull();
  });

  it('renders bookmark button on done turn', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-bookmark]')).not.toBeNull();
  });

  it('bookmark aria-pressed reflects turn.bookmarked', () => {
    const notBookmarked = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn() },
    });
    expect(
      notBookmarked.container.querySelector('[data-ega-bookmark]')?.getAttribute('aria-pressed'),
    ).toBe('false');
    notBookmarked.unmount();

    const bookmarked = render(AssistantTurn, {
      props: { turn: doneTurn({ bookmarked: true }), onRetry: vi.fn() },
    });
    expect(
      bookmarked.container.querySelector('[data-ega-bookmark]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    bookmarked.unmount();
  });

  it('bookmark click fires onBookmark(id)', async () => {
    const onBookmark = vi.fn();
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), onBookmark },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-bookmark]');
    if (!btn) throw new Error('bookmark btn missing');
    await fireEvent.click(btn);
    expect(onBookmark).toHaveBeenCalledWith('a1');
  });

  it('renders delete button on done turn', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-delete]')).not.toBeNull();
  });

  it('delete click fires onDelete(id)', async () => {
    const onDelete = vi.fn();
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), onDelete },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-delete]');
    if (!btn) throw new Error('delete btn missing');
    await fireEvent.click(btn);
    expect(onDelete).toHaveBeenCalledWith('a1');
  });

  it('puts delete last, so the destructive action is not the first thing under the cursor', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), onDelete: vi.fn() },
    });
    const footer = container.querySelector('.ega-turn-actions');
    const buttons = Array.from(footer?.querySelectorAll('button') ?? []);
    expect(buttons.at(-1)?.getAttribute('data-ega-delete')).toBe('true');
  });

  it('action row is in the DOM when status=done (keyboard-reachable)', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-turn-actions')).not.toBeNull();
  });
});
