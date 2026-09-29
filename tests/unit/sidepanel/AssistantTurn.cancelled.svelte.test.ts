// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

const cancelledTurn = (code: string): Turn => ({
  createdAt: 1,
  id: `c-${code}`,
  role: 'assistant',
  kind: 'translate',
  status: 'error',
  content: '',
  error: { code, message: 'Canceled' },
});

describe('AssistantTurn — neutral Canceled state', () => {
  it("renders a muted 'Canceled' block, not a red error, for a user cancel", () => {
    for (const code of ['cancelled', 'ABORTED']) {
      const { container, unmount } = render(AssistantTurn, {
        props: { turn: cancelledTurn(code), onRetry: vi.fn(), canRetry: true },
      });
      const block = container.querySelector('[data-ega-cancelled]');
      expect(block).not.toBeNull();
      expect(block?.textContent).toBe('Canceled');
      expect(block?.getAttribute('role')).toBe('status');
      // No failure framing: no danger block, no alert role, no "Error:" prefix.
      expect(container.querySelector('.ega-assistant-error')).toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.textContent).not.toContain('Error:');
      unmount();
    }
  });

  // Both codes reach the panel: a local stop reads 'cancelled', a stop from another surface 'ABORTED'.
  it.each(['cancelled', 'ABORTED'])('keeps Retry available on a %s turn', (code) => {
    const { container } = render(AssistantTurn, {
      props: { turn: cancelledTurn(code), onRetry: vi.fn(), canRetry: true },
    });
    expect(container.querySelector('.ega-retry-btn')).not.toBeNull();
  });

  it('a real error still renders the red alert block', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'err',
      role: 'assistant',
      kind: 'translate',
      status: 'error',
      content: '',
      error: { code: 'NETWORK', message: 'Network issue: down' },
    };
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    expect(container.querySelector('[data-ega-cancelled]')).toBeNull();
    const err = container.querySelector('.ega-assistant-error');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
  });
});
