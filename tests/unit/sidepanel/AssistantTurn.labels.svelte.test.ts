// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
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

const baseTurn = (overrides: Partial<AssistantTurnData> = {}): AssistantTurnData => ({
  id: 'a1',
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content: 'hello',
  createdAt: 1716595200000,
  ...overrides,
});

describe('AssistantTurn — context preview, labels and tooltips', () => {
  it('renders what was sent only on the latest turn', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn({ contextSent: ctx }), onRetry: vi.fn(), isLatest: true },
    });
    expect(await openedPreview(container)).not.toBeNull();
  });

  it('keeps what was sent on a history turn — every settled turn can show what was sent', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn({ contextSent: ctx }), onRetry: vi.fn(), isLatest: false },
    });
    expect(await openedPreview(container)).not.toBeNull();
  });

  it('the Re-run as icon button names itself and shows the same bits tooltip as its neighbours', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const trigger = container.querySelector<HTMLElement>('[data-ega-task-switch]');
    // Not the page-wide data-tooltip: the IconButtons beside it use bits' Tooltip, and both must look the same.
    expect(trigger?.hasAttribute('data-tooltip')).toBe(false);
    trigger?.focus();
    await waitFor(() => {
      expect(document.querySelector('.ega-icon-btn-tooltip')?.textContent.trim()).toBe(
        'Re-run as…',
      );
    });
    expect(trigger?.getAttribute('aria-label')).toBe('Re-run with another task or language');
    expect(trigger?.textContent.trim()).toBe('');
  });

  it('timestamp uses data-tooltip (not native title)', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn(), onRetry: vi.fn(), isLatest: true },
    });
    const ts = container.querySelector('[data-ega-timestamp]');
    expect(ts?.getAttribute('title')).toBeNull();
    expect(ts?.getAttribute('data-tooltip')).not.toBeNull();
  });

  it('confidence pill names itself on screen, and explains itself on hover', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn({ confidence: 0.9 }), onRetry: vi.fn(), isLatest: true },
    });
    const pill = container.querySelector('[data-ega-confidence]');
    expect(pill?.textContent.trim()).toBe('90% confident');
    expect(pill?.getAttribute('data-tooltip')).toBe('How sure the model is about this reply');
    expect(pill?.getAttribute('title')).toBeNull();
  });

  it('detected-language pill uses data-tooltip (not native title)', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn({ detectedLang: 'es' }),
        onRetry: vi.fn(),
        isLatest: true,
      },
    });
    const pill = container.querySelector('.ega-lang-pill');
    expect(pill).not.toBeNull();
    expect(pill?.getAttribute('title')).toBeNull();
    expect(pill?.getAttribute('data-tooltip')).not.toBeNull();
  });
});
