// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

const u = (id: string, content: string): Turn => ({
  createdAt: 1,
  id,
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content,
});
const a = (id: string, content: string, attached: string): Turn => ({
  createdAt: 1,
  id,
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content,
  attachedToTurnId: attached,
});

describe('ConversationStream.svelte', () => {
  it('renders empty-state when turns is empty', () => {
    const { container } = render(ConversationStream, {
      props: {
        turns: [],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-sidepanel-empty]')).not.toBeNull();
    expect(container.textContent).toContain('Start a conversation');
  });

  it('empty-state hint names more than just translate', () => {
    const { container } = render(ConversationStream, {
      props: {
        turns: [],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const text = container.textContent;
    expect(text).toContain('translate');
    expect(text).toContain('explain');
    expect(text).toContain('reword');
  });

  it('empty state links to the shortcuts overlay instead of listing keys', async () => {
    const onShowShortcuts = vi.fn();
    const { container, getByRole } = render(ConversationStream, {
      props: {
        turns: [],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
        onShowShortcuts,
      },
    });
    expect(container.querySelector('kbd')).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('empty placeholder is NOT nested inside the role=log live region', () => {
    const { container } = render(ConversationStream, {
      props: {
        turns: [],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    // No log region when empty, so a polite status is never nested inside a polite log.
    expect(container.querySelector('[role="log"]')).toBeNull();
    const empty = container.querySelector('[data-ega-sidepanel-empty]');
    expect(empty?.closest('[role="log"]')).toBeNull();
  });

  it('renders the role=log live region only once turns exist', () => {
    const turns: Turn[] = [u('u1', 'hi'), a('a1', 'reply', 'u1')];
    const { container } = render(ConversationStream, {
      props: {
        turns,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    expect(container.querySelector('[role="log"]')).not.toBeNull();
  });

  it('renders alternating user / assistant bubbles', () => {
    const turns: Turn[] = [u('u1', 'hi'), a('a1', 'reply', 'u1')];
    const { container } = render(ConversationStream, {
      props: {
        turns,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    expect(container.querySelector('.ega-user-turn')).not.toBeNull();
    expect(container.querySelector('.ega-assistant-turn')).not.toBeNull();
  });

  it('only the LAST assistant turn carries is-latest chrome', () => {
    const turns: Turn[] = [
      u('u1', 'hi'),
      a('a1', 'first', 'u1'),
      u('u2', 'hi again'),
      a('a2', 'second', 'u2'),
    ];
    const { container } = render(ConversationStream, {
      props: {
        turns,
        latestTurnId: 'a2',
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const assistants = container.querySelectorAll('.ega-assistant-turn');
    expect(assistants).toHaveLength(2);
    expect(assistants[0]?.classList.contains('is-latest')).toBe(false);
    expect(assistants[1]?.classList.contains('is-latest')).toBe(true);
  });

  it('bookmarked mid-turn does not get is-latest when filter narrows list', () => {
    // Full conversation: u1→a1→u2→a2. a2 is truly latest.
    // Filter produces only [u1, a1] (a1 is bookmarked). a1 must NOT be is-latest.
    const turns: Turn[] = [
      u('u1', 'first'),
      { ...a('a1', 'reply-one', 'u1'), bookmarked: true } as Turn,
    ];
    const { container } = render(ConversationStream, {
      props: {
        turns,
        latestTurnId: 'a2', // true last turn in FULL conversation is a2 (not in filtered list)
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const assistantTurn = container.querySelector('.ega-assistant-turn');
    expect(assistantTurn).not.toBeNull();
    if (!assistantTurn) throw new Error('assistant turn not rendered');
    expect(assistantTurn.classList.contains('is-latest')).toBe(false);
    expect(container.querySelector('[data-ega-swap]')).toBeNull();
    expect(container.querySelector('[data-ega-task-switch]')).toBeNull();
  });

  it('true latest turn gets is-latest when visible (filter off or matches)', () => {
    const turns: Turn[] = [
      u('u1', 'first'),
      { ...a('a1', 'reply-one', 'u1'), bookmarked: true } as Turn,
    ];
    const { container } = render(ConversationStream, {
      props: {
        turns,
        latestTurnId: 'a1', // a1 IS the true last turn — visible, so should be is-latest
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const assistantTurn = container.querySelector('.ega-assistant-turn');
    if (!assistantTurn) throw new Error('assistant turn not rendered');
    expect(assistantTurn.classList.contains('is-latest')).toBe(true);
  });

  it('auto-scrolls to bottom on new turn append', async () => {
    const turns: Turn[] = [u('u1', 'first')];
    const { container, rerender } = render(ConversationStream, {
      props: {
        turns,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    // jsdom has no layout; fake scrollHeight to check that auto-scroll sets scrollTop to it.
    Object.defineProperty(scroller, 'scrollHeight', {
      value: 1000,
      configurable: true,
    });
    const turns2: Turn[] = [u('u1', 'first'), a('a1', 'second', 'u1')];
    await rerender({
      turns: turns2,
      focusedTurnId: null,
      onRetry: vi.fn(),
      onFocusChange: vi.fn(),
    });
    await tick();
    // After auto-scroll, scrollTop === scrollHeight.
    expect(scroller.scrollTop).toBe(1000);
  });
});
