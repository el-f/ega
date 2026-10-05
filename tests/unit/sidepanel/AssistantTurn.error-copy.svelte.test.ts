// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

function errorTurn(code: string, message: string): Turn {
  return {
    createdAt: 1,
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: 'error',
    content: '',
    error: { code, message },
  };
}

const AUTH_MESSAGE =
  'The backend rejected the API key. Check it in Settings → Backends.\nAnthropic HTTP 401: bad key';

describe('AssistantTurn — an error fixed in Settings can be retried', () => {
  it('offers Retry beside Open settings for a rejected key, so the fixed key can be tried', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('AUTH', AUTH_MESSAGE), onRetry: vi.fn(), canRetry: true },
    });
    expect(container.querySelector('.ega-retry-btn')).not.toBeNull();
    expect(container.querySelector('[data-ega-sidepanel-open-options]')).not.toBeNull();
  });

  it('puts an alert icon in the error heading', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('AUTH', AUTH_MESSAGE), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-error-title svg')).not.toBeNull();
  });
});

describe('AssistantTurn — a failed turn reads as heading, body, details', () => {
  it('puts the label in the heading, the advice in the body, and the HTTP fragment behind Details', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('AUTH', AUTH_MESSAGE), onRetry: vi.fn() },
    });
    const block = container.querySelector('.ega-assistant-error');
    expect(block?.getAttribute('role')).toBe('alert');
    expect(block?.querySelector('.ega-error-title')?.textContent).toBe('Authentication failed');
    expect(block?.querySelector('.ega-error-body')?.textContent).toBe(
      'The backend rejected the API key. Check it in Settings → Backends.',
    );
    const details = block?.querySelector<HTMLDetailsElement>('details');
    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('Details');
    expect(details?.querySelector('code')?.textContent).toBe('Anthropic HTTP 401: bad key');
    // No colon stack: the visible text never reads "Error: Authentication failed:".
    expect(block?.textContent).not.toContain('Error:');
    expect(block?.textContent).not.toContain('Authentication failed:');
  });

  it('renders no Details when the message has no provider fragment', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: errorTurn('TIMEOUT', 'The backend took too long to answer. Try again.'),
        onRetry: vi.fn(),
      },
    });
    expect(container.querySelector('.ega-error-title')?.textContent).toBe('Timed out');
    expect(container.querySelector('.ega-error-body')?.textContent).toBe(
      'The backend took too long to answer. Try again.',
    );
    expect(container.querySelector('details')).toBeNull();
  });

  it('a thread saved with the label baked into the message does not show it twice', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('NETWORK', 'Network issue: connection refused'), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-error-title')?.textContent).toBe('Network issue');
    expect(container.querySelector('.ega-error-body')?.textContent).toBe('connection refused');
  });

  it('a synthetic code keeps the plain "Error" heading', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: errorTurn(
          'dispatch-failed',
          'Ega could not send this. Try again, or reload the extension.',
        ),
        onRetry: vi.fn(),
      },
    });
    expect(container.querySelector('.ega-error-title')?.textContent).toBe('Error');
    expect(container.querySelector('.ega-error-body')?.textContent).toContain('could not send');
  });

  it('the Settings CTA still reads the tab off the advice sentence', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: errorTurn('AUTH', AUTH_MESSAGE), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-sidepanel-open-options]')?.textContent).toContain(
      'Open settings',
    );
  });
});
