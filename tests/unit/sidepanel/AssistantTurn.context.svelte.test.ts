// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import type { PageContext } from '@/shared/types';

const ctx: PageContext = {
  pageUrl: 'https://x.test',
  pageTitle: 'X',
  beforeText: 'foo',
};

/** Opens the reply's details panel, where what was sent now lives. */
async function openedPreview(container: HTMLElement): Promise<Element | null> {
  const btn = container.querySelector<HTMLButtonElement>('[data-ega-inspector-toggle]');
  if (btn) await fireEvent.click(btn);
  return container.querySelector('[data-ega-context-preview]');
}

describe('AssistantTurn — what was sent parity', () => {
  // what was sent shows only on the latest turn — history turns flatten to
  // bare body, so these latest-turn cases pass isLatest.
  it('renders what was sent when turn.contextSent is set', async () => {
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
    expect(await openedPreview(container)).not.toBeNull();
  });

  it('renders what was sent when contextSent is null (context off)', async () => {
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
    expect(await openedPreview(container)).not.toBeNull();
  });

  it('keeps what was sent on a history turn, so "what was sent" is not only on the newest', async () => {
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
    expect(await openedPreview(container)).not.toBeNull();
  });

  it('omits what was sent when turn.contextSent is undefined', async () => {
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
    expect(await openedPreview(container)).toBeNull();
  });

  it('does NOT render what was sent while status=streaming even if contextSent is set', async () => {
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
    expect(await openedPreview(container)).toBeNull();
  });

  it('does NOT render what was sent while status=pending even if contextSent is set', async () => {
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
    expect(await openedPreview(container)).toBeNull();
  });
});
