// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import { asBackendIdUnsafe } from '@/shared/brands';

function doneTurn(overrides: Partial<AssistantTurnData> = {}): AssistantTurnData {
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

/** Opens the reply's More menu from the keyboard; its items render in a portal on document.body. */
async function openMoreMenu(container: HTMLElement): Promise<void> {
  const trigger = container.querySelector<HTMLElement>('[data-ega-action="more"]');
  if (!trigger) throw new Error('More trigger missing');
  await fireEvent.keyDown(trigger, { key: 'Enter' });
  await waitFor(() => {
    if (!document.querySelector('[data-ega-delete]')) throw new Error('menu not open');
  });
}

function menuItem(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`${selector} missing`);
  return el;
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

  it('hides regenerate while another reply runs, instead of a disabled button with a hidden reason', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), canRetry: true, inflight: true },
    });
    expect(container.querySelector('[data-ega-regenerate]')).toBeNull();
    expect(container.querySelector('.ega-turn-actions button:disabled')).toBeNull();
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

  it('keeps Bookmark and Delete out of the row, so it does not wrap at 400px', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), onBookmark: vi.fn(), onDelete: vi.fn() },
    });
    const footer = container.querySelector('.ega-turn-actions');
    expect(footer?.querySelector('[data-ega-bookmark]')).toBeNull();
    expect(footer?.querySelector('[data-ega-delete]')).toBeNull();
    const more = footer?.querySelector('[data-ega-action="more"]');
    expect(more?.getAttribute('aria-label')).toBe('More reply actions');
    expect(more?.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('keeps the pills beside the time, so the action row holds only buttons', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: doneTurn({
          confidence: 0.93,
          detectedLang: 'ar',
          meta: { backendId: asBackendIdUnsafe('anthropic'), latencyMs: 1, cacheHit: false },
        }),
        onRetry: vi.fn(),
      },
    });
    const footer = container.querySelector('.ega-turn-actions');
    expect(footer?.querySelector('.ega-pill')).toBeNull();
    expect(container.querySelectorAll('.ega-assistant-meta .ega-pill').length).toBe(3);
  });

  it('the More menu checks Bookmark when the reply is bookmarked', async () => {
    const notBookmarked = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn() },
    });
    await openMoreMenu(notBookmarked.container);
    expect(menuItem('[data-ega-bookmark]').getAttribute('aria-checked')).toBe('false');
    notBookmarked.unmount();

    const bookmarked = render(AssistantTurn, {
      props: { turn: doneTurn({ bookmarked: true }), onRetry: vi.fn() },
    });
    await openMoreMenu(bookmarked.container);
    expect(menuItem('[data-ega-bookmark]').getAttribute('aria-checked')).toBe('true');
    bookmarked.unmount();
  });

  it('shows a bookmarked reply as bookmarked without opening the menu', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn({ bookmarked: true }), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-bookmarked-mark]')?.getAttribute('aria-label')).toBe(
      'Bookmarked',
    );
    const plain = render(AssistantTurn, { props: { turn: doneTurn(), onRetry: vi.fn() } });
    expect(plain.container.querySelector('[data-ega-bookmarked-mark]')).toBeNull();
  });

  it('Bookmark in the More menu fires onBookmark(id)', async () => {
    const onBookmark = vi.fn();
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), onBookmark },
    });
    await openMoreMenu(container);
    await fireEvent.click(menuItem('[data-ega-bookmark]'));
    await tick();
    expect(onBookmark).toHaveBeenCalledTimes(1);
    expect(onBookmark).toHaveBeenCalledWith('a1');
  });

  it('Delete in the More menu fires onDelete(id)', async () => {
    const onDelete = vi.fn();
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), onDelete },
    });
    await openMoreMenu(container);
    await fireEvent.click(menuItem('[data-ega-delete]'));
    await tick();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('a1');
  });

  it('puts delete last, so a keyboard open does not land on it', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), onDelete: vi.fn() },
    });
    const footer = container.querySelector('.ega-turn-actions');
    const buttons = Array.from(footer?.querySelectorAll('button') ?? []);
    expect(buttons.at(-1)?.getAttribute('data-ega-action')).toBe('more');
    await openMoreMenu(container);
    const items = [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')];
    expect(items.at(-1)?.hasAttribute('data-ega-delete')).toBe(true);
    expect(items.at(0)?.hasAttribute('data-ega-bookmark')).toBe(true);
  });

  it('arrows reach the More button in the row and land focus on it', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), canRetry: true },
    });
    const toolbar = container.querySelector<HTMLElement>('[role="toolbar"]');
    if (!toolbar) throw new Error('toolbar missing');
    const keys = (): string[] =>
      [...toolbar.querySelectorAll('[data-ega-action]')].map(
        (b) => b.getAttribute('data-ega-action') ?? '',
      );
    expect(keys().at(-1)).toBe('more');
    await fireEvent.keyDown(toolbar, { key: 'End' });
    await tick();
    const more = toolbar.querySelector<HTMLElement>('[data-ega-action="more"]');
    expect(document.activeElement).toBe(more);
    expect(more?.getAttribute('tabindex')).toBe('0');
    expect(toolbar.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('action row is in the DOM when status=done (keyboard-reachable)', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-turn-actions')).not.toBeNull();
  });
});
