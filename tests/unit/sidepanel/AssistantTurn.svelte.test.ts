// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

describe('AssistantTurn.svelte', () => {
  it('renders streaming cursor while status=streaming', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'streaming',
      content: 'partial',
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    // Inside the text span, or it wraps to a line of its own once the answer fills the bubble.
    expect(container.querySelector('.ega-streaming-plain > .ega-cursor')).not.toBeNull();
    // Copy/retry actions hidden while streaming.
    expect(container.querySelector('.ega-assistant-actions')).toBeNull();
  });

  it('hides streaming cursor + shows actions when status=done', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'done',
      confidence: 0.9,
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-cursor')).toBeNull();
    expect(container.querySelector('.ega-assistant-actions')).not.toBeNull();
    // 90% confidence pill rendered.
    expect(container.textContent).toContain('90%');
  });

  it('streaming skeleton names the task gerund (Explaining…, not Translating…)', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'e1',
      role: 'assistant',
      kind: 'explain',
      status: 'pending',
      content: '',
    };
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    const label = container.querySelector('.ega-stream-skeleton-label');
    expect(label?.textContent).toBe('Explaining…');
  });

  it('renders error block + retry button when status=error', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'error',
      content: '',
      error: { code: 'NETWORK', message: 'Network issue: down' },
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-assistant-error')).not.toBeNull();
    expect(container.textContent).toContain('Network issue');
    expect(container.querySelector('.ega-retry-btn')).not.toBeNull();
    // NETWORK isn't a config-fixable error — no Open settings CTA.
    expect(container.querySelector('[data-ega-sidepanel-open-options]')).toBeNull();
  });

  it('surfaces Open settings CTA on config-fixable error codes', () => {
    for (const code of ['AUTH', 'NATIVE_NOT_INSTALLED', 'UNSUPPORTED'] as const) {
      const turn: Turn = {
        createdAt: 1,
        id: `a-${code}`,
        role: 'assistant',
        kind: 'translate',
        status: 'error',
        content: '',
        error: { code, message: 'detail' },
      };
      const { container, unmount } = render(AssistantTurn, {
        props: { turn, onRetry: vi.fn() },
      });
      expect(container.querySelector('[data-ega-sidepanel-open-options]')).not.toBeNull();
      unmount();
    }
  });

  // Retrying the same request cannot succeed, but each of these is fixed in Settings → Backends, after which Retry works.
  it('keeps Retry on terminal codes Settings can fix (AUTH / QUOTA / NATIVE_*)', () => {
    for (const code of ['AUTH', 'QUOTA', 'NATIVE_NOT_INSTALLED', 'NATIVE_SPAWN_FAIL'] as const) {
      const turn: Turn = {
        createdAt: 1,
        id: `nr-${code}`,
        role: 'assistant',
        kind: 'translate',
        status: 'error',
        content: '',
        error: { code, message: 'detail' },
      };
      const { container, unmount } = render(AssistantTurn, {
        props: { turn, onRetry: vi.fn(), canRetry: true },
      });
      expect(container.querySelector('.ega-retry-btn')).not.toBeNull();
      expect(container.querySelector('[data-ega-sidepanel-open-options]')).not.toBeNull();
      unmount();
    }
  });

  it('shows Retry on retryable error codes (NETWORK / TIMEOUT / RATE_LIMIT)', () => {
    for (const code of ['NETWORK', 'TIMEOUT', 'RATE_LIMIT'] as const) {
      const turn: Turn = {
        createdAt: 1,
        id: `r-${code}`,
        role: 'assistant',
        kind: 'translate',
        status: 'error',
        content: '',
        error: { code, message: 'detail' },
      };
      const { container, unmount } = render(AssistantTurn, {
        props: { turn, onRetry: vi.fn(), canRetry: true },
      });
      expect(container.querySelector('.ega-retry-btn')).not.toBeNull();
      unmount();
    }
  });

  it('hides Retry on a retryable code when canRetry=false (no dispatch to replay)', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'nr-canretry',
      role: 'assistant',
      kind: 'translate',
      status: 'error',
      content: '',
      error: { code: 'NETWORK', message: 'detail' },
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), canRetry: false },
    });
    expect(container.querySelector('.ega-retry-btn')).toBeNull();
  });

  it('keeps Retry for synthetic / unclassified codes (preserve recoverable case)', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'syn',
      role: 'assistant',
      kind: 'translate',
      status: 'error',
      content: '',
      error: { code: 'cancelled', message: 'user canceled' },
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), canRetry: true },
    });
    expect(container.querySelector('.ega-retry-btn')).not.toBeNull();
  });

  it('Open settings button carries a leading icon + neutral action class', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'auth-icon',
      role: 'assistant',
      kind: 'translate',
      status: 'error',
      content: '',
      error: { code: 'AUTH', message: 'bad key' },
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    const openBtn = container.querySelector('[data-ega-sidepanel-open-options]');
    expect(openBtn).not.toBeNull();
    expect(openBtn?.classList.contains('ega-error-action-btn')).toBe(true);
    // Lucide renders an inline <svg> as the leading icon.
    expect(openBtn?.querySelector('svg')).not.toBeNull();
  });

  it('confidence pill says what it measures in its own text', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'conf',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'done',
      confidence: 0.9,
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    const pill = container.querySelector('[data-ega-confidence]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent.trim()).toBe('90% confident');
    // aria-label on a role-less span is a prohibited naming target; the visible text names it now.
    expect(pill?.getAttribute('aria-label')).toBeNull();
  });

  it('hides the confidence pill when the confidencePill setting is off or confidence is 0', () => {
    const turn = (confidence: number): Turn => ({
      createdAt: 1,
      id: 'conf',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'done',
      confidence,
    });
    const pillText = (t: Turn, confidencePill?: boolean) => {
      const r = render(AssistantTurn, {
        props: {
          turn: t,
          onRetry: vi.fn(),
          ...(confidencePill === undefined ? {} : { confidencePill }),
        },
      });
      const text = r.container.querySelector('[data-ega-confidence]')?.textContent.trim() ?? null;
      r.unmount();
      return text;
    };
    expect(pillText(turn(0.9), false)).toBeNull();
    expect(pillText(turn(0))).toBeNull();
    expect(pillText(turn(0.9))).toBe('90% confident');
  });

  it('shows the Try as button only on the latest reply', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
    };
    const latest = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), onSwap: vi.fn(), isLatest: true },
    });
    expect(latest.container.querySelector('[data-ega-task-switch]')).not.toBeNull();
    latest.unmount();

    const history = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), onSwap: vi.fn(), isLatest: false },
    });
    expect(history.container.querySelector('[data-ega-task-switch]')).toBeNull();
    history.unmount();
  });

  it('omits the Refine button and its chips on history turns (isLatest=false)', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
    };
    const { container } = render(AssistantTurn, {
      props: {
        turn,
        onRetry: vi.fn(),
        onRefine: vi.fn(),
        isLatest: false,
      },
    });
    expect(container.querySelector('[data-ega-refine-toggle]')).toBeNull();
    expect(container.querySelector('[data-ega-quick-refine]')).toBeNull();
  });

  it('offers the Refine button on the latest turn, chips closed (isLatest=true)', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
    };
    const { container } = render(AssistantTurn, {
      props: {
        turn,
        onRetry: vi.fn(),
        onRefine: vi.fn(),
        isLatest: true,
      },
    });
    expect(container.querySelector('[data-ega-refine-toggle]')).not.toBeNull();
    expect(container.querySelector('[data-ega-quick-refine]')).toBeNull();
  });
});
