// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import type { PageContext } from '@/shared/types';

const ctx: PageContext = {
  pageUrl: 'https://x.test',
  pageTitle: 'X',
  beforeText: 'foo',
};

describe('AssistantTurn — ContextPreview parity', () => {
  // ContextPreview shows only on the latest turn — history turns flatten to
  // bare body, so these latest-turn cases pass isLatest.
  it('renders ContextPreview when turn.contextSent is set', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      contextSent: ctx,
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), isLatest: true },
    });
    expect(container.querySelector('[data-ega-context-preview]')).not.toBeNull();
  });

  it('renders ContextPreview when contextSent is null (context off)', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      contextSent: null,
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), isLatest: true },
    });
    expect(container.querySelector('[data-ega-context-preview]')).not.toBeNull();
  });

  it('keeps ContextPreview on a history turn, so "what was sent" is not only on the newest', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      contextSent: ctx,
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), isLatest: false },
    });
    expect(container.querySelector('[data-ega-context-preview]')).not.toBeNull();
  });

  it('omits ContextPreview when turn.contextSent is undefined', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-context-preview]')).toBeNull();
  });

  it('does NOT render ContextPreview while status=streaming even if contextSent is set', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'streaming',
      content: 'partial',
      contextSent: ctx,
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-context-preview]')).toBeNull();
  });

  it('does NOT render ContextPreview while status=pending even if contextSent is set', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'pending',
      content: '',
      contextSent: ctx,
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-context-preview]')).toBeNull();
  });
});
