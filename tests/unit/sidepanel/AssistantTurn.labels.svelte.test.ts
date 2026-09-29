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

const baseTurn = (overrides: Partial<Turn> = {}): Turn => ({
  id: 'a1',
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content: 'hello',
  createdAt: 1716595200000,
  ...overrides,
});

describe('AssistantTurn — context preview, labels and tooltips', () => {
  it('renders ContextPreview only on the latest turn', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn({ contextSent: ctx }), onRetry: vi.fn(), isLatest: true },
    });
    expect(container.querySelector('[data-ega-context-preview]')).not.toBeNull();
  });

  it('keeps ContextPreview on a history turn — every settled turn can show what was sent', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn({ contextSent: ctx }), onRetry: vi.fn(), isLatest: false },
    });
    expect(container.querySelector('[data-ega-context-preview]')).not.toBeNull();
  });

  it('task-switch select carries a visible label, because a select never shows a tooltip', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: baseTurn(),
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        onTaskSwitch: vi.fn(),
      },
    });
    const select = container.querySelector('[data-ega-task-switch]');
    // Empty while idle: the global [data-tooltip] rule ignores an empty value, and the visible
    // <label> is the name. It only fills in while another reply streams.
    expect(select?.getAttribute('data-tooltip')).toBe('');
    const label = container.querySelector(`label[for="${select?.getAttribute('id') ?? ''}"]`);
    expect(label?.textContent.trim()).toBe('Re-run as');
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
    expect(pill?.textContent.trim()).toBe('90% sure');
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
