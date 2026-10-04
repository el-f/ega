// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

const stoppedTurn = (code: string, content: string): Turn => ({
  id: `p-${code}`,
  role: 'assistant',
  createdAt: 1,
  kind: 'translate',
  status: 'error',
  content,
  attachedToTurnId: 'u1',
  error: { code, message: code === 'cancelled' ? 'Canceled' : 'the stream dropped' },
});

describe('AssistantTurn — a stopped or dropped stream keeps the text it already showed', () => {
  it('renders the partial text on a canceled turn', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: stoppedTurn('cancelled', 'Hello par'), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-streaming-plain')?.textContent).toBe('Hello par');
    expect(container.querySelector('[data-ega-cancelled]')).not.toBeNull();
  });

  it('offers Copy for the partial text and writes it to the clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { getByLabelText } = render(AssistantTurn, {
      props: { turn: stoppedTurn('cancelled', 'Hello par'), onRetry: vi.fn() },
    });
    await fireEvent.click(getByLabelText('Copy partial reply'));
    expect(writeText).toHaveBeenCalledWith('Hello par');
  });

  it('marks the text as partial', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: stoppedTurn('cancelled', 'Hello par'), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-partial-note')?.textContent).toBe('(partial)');
  });

  it('shows no body and no Copy when nothing streamed before the failure', () => {
    const { container, queryByLabelText } = render(AssistantTurn, {
      props: { turn: stoppedTurn('AUTH', ''), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-streaming-plain')).toBeNull();
    expect(container.querySelector('.ega-partial-note')).toBeNull();
    expect(queryByLabelText('Copy partial reply')).toBeNull();
  });

  it('shows the error alert, the partial text and Retry together on a dropped stream', () => {
    const { container, getByLabelText } = render(AssistantTurn, {
      props: { turn: stoppedTurn('PROTOCOL', 'half an answer'), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-assistant-error')).not.toBeNull();
    expect(container.querySelector('.ega-streaming-plain')?.textContent).toBe('half an answer');
    expect(getByLabelText('Copy partial reply')).not.toBeNull();
    expect(container.querySelector('.ega-retry-btn')).not.toBeNull();
  });
});
