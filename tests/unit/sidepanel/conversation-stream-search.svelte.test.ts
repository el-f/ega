// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
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

describe('ConversationStream — search empty state', () => {
  it('shows "No matches" when emptySearch is true', () => {
    const { container } = render(ConversationStream, {
      props: {
        turns: [],
        emptySearch: true,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-no-search-matches]')).not.toBeNull();
    expect(container.textContent).toContain('No matches');
  });

  it('does not show "No matches" text when emptySearch is false and turns empty', () => {
    const { container } = render(ConversationStream, {
      props: {
        turns: [],
        emptySearch: false,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-no-search-matches]')).toBeNull();
  });

  it('renders filtered turns when search produces results', () => {
    const turns: Turn[] = [u('u1', 'hello'), a('a1', 'bonjour', 'u1')];
    const { container } = render(ConversationStream, {
      props: {
        turns,
        emptySearch: false,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-no-search-matches]')).toBeNull();
    expect(container.querySelector('.ega-user-turn')).not.toBeNull();
    expect(container.querySelector('.ega-assistant-turn')).not.toBeNull();
  });
});
