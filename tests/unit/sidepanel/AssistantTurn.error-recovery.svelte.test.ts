// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';

function errorTurn(code: string, overrides: Partial<AssistantTurnData> = {}): AssistantTurnData {
  return {
    id: 'a1',
    role: 'assistant',
    createdAt: 1,
    kind: 'translate',
    status: 'error',
    content: '',
    attachedToTurnId: 'u1',
    error: { code, message: 'it broke' },
    ...overrides,
  };
}

function emptyDoneTurn(overrides: Partial<AssistantTurnData> = {}): AssistantTurnData {
  return {
    id: 'a1',
    role: 'assistant',
    createdAt: 1,
    kind: 'translate',
    status: 'done',
    content: '',
    attachedToTurnId: 'u1',
    ...overrides,
  };
}

function retryButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('.ega-retry-btn');
}

describe('the error card offers the recovery the code allows', () => {
  it('deep-links to settings for every code a setting can fix, quota included', () => {
    for (const code of ['AUTH', 'QUOTA', 'NATIVE_SPAWN_FAIL', 'NO_BACKEND']) {
      const { container, unmount } = render(AssistantTurn, {
        props: { turn: errorTurn(code), onRetry: vi.fn() },
      });
      expect(
        container.querySelector('[data-ega-sidepanel-open-options]'),
        `${code} should offer Open settings`,
      ).not.toBeNull();
      unmount();
    }
  });

  it('routes a REQUEST by the tab its own sentence names, not by the code', () => {
    // One REQUEST covers max-tokens (Translate), an unknown model (Backends) and an oversize request.
    const named = render(AssistantTurn, {
      props: {
        turn: errorTurn('REQUEST', {
          error: {
            code: 'REQUEST',
            message: 'Reply hit the cap. Raise it in Settings → Translate.',
          },
        }),
        onRetry: vi.fn(),
      },
    });
    expect(named.container.querySelector('[data-ega-sidepanel-open-options]')).not.toBeNull();
    named.unmount();

    const bare = render(AssistantTurn, {
      props: { turn: errorTurn('REQUEST'), onRetry: vi.fn() },
    });
    expect(bare.container.querySelector('[data-ega-sidepanel-open-options]')).toBeNull();
    bare.unmount();
  });

  it('offers the backend list after a second failure the code names no setting for', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('NETWORK', { retries: 1 }), onRetry: vi.fn() },
    });
    const btn = container.querySelector('[data-ega-sidepanel-open-options]');
    expect(btn?.textContent.trim()).toBe('Check your backends');
  });

  it('offers no settings link for a code no setting fixes', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('NETWORK'), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-sidepanel-open-options]')).toBeNull();
  });

  it('offers Retry for a malformed reply', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('PARSE'), onRetry: vi.fn() },
    });
    expect(retryButton(container)).not.toBeNull();
  });

  it('disables Retry while another reply is streaming and says why', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('NETWORK'), onRetry: vi.fn(), inflight: true },
    });
    const btn = retryButton(container);
    if (!btn) throw new Error('retry button missing');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('finishes');
  });

  it('enables Retry after a click while idle', async () => {
    const onRetry = vi.fn();
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('NETWORK'), onRetry },
    });
    const btn = retryButton(container);
    if (!btn) throw new Error('retry button missing');
    await fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledWith('a1');
  });

  it('enables Retry once nothing is in flight', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('NETWORK'), onRetry: vi.fn(), inflight: false },
    });
    expect(retryButton(container)?.disabled).toBe(false);
  });

  it('says a reply came back empty instead of rendering a blank card', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: emptyDoneTurn(),
        onRetry: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-empty-body]')?.textContent).toMatch(
      /No reply came back/,
    );
  });

  it('keeps an explain-only reply as it is', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: emptyDoneTurn({ explain: 'the subtext' }),
        onRetry: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-empty-body]')).toBeNull();
  });
});

describe('a send that never left the panel keeps its Retry', () => {
  it('offers Retry and no settings link for dispatch-failed', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('dispatch-failed'), onRetry: vi.fn(), canRetry: true },
    });
    expect(container.querySelector('.ega-retry-btn')).not.toBeNull();
    // No setting fixes a dead port, so the options link must stay away.
    expect(container.querySelector('[data-ega-sidepanel-open-options]')).toBeNull();
  });

  it('still renders it as a failure, not a cancel', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('dispatch-failed'), onRetry: vi.fn(), canRetry: true },
    });
    expect(container.querySelector('.ega-assistant-error')).not.toBeNull();
    expect(container.querySelector('[data-ega-cancelled]')).toBeNull();
  });
});
