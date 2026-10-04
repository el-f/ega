// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';

const FIXED_NOW = 1_718_000_300_000; // +5 min after FIXED_TS
const FIXED_TS = 1_718_000_000_000;

afterEach(() => {
  vi.restoreAllMocks();
});

function mkAssistantTurn(overrides: Partial<AssistantTurnData> = {}): AssistantTurnData {
  return {
    id: 'a1',
    role: 'assistant',
    createdAt: 1,
    kind: 'translate',
    status: 'done',
    content: 'translation result',
    ...overrides,
  };
}

describe('AssistantTurn timestamp', () => {
  it('renders [data-ega-timestamp] with non-empty text when createdAt is set', () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const turn = mkAssistantTurn({ createdAt: FIXED_TS });
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    const el = container.querySelector('[data-ega-timestamp]');
    expect(el).not.toBeNull();
    expect(String(el?.textContent).trim()).not.toBe('');
  });

  it('[data-ega-timestamp] exposes the absolute datetime via tooltip', () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const turn = mkAssistantTurn({ createdAt: FIXED_TS });
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    const el = container.querySelector('[data-ega-timestamp]');
    expect(el?.getAttribute('data-tooltip')).toBe(new Date(FIXED_TS).toLocaleString());
  });

  it('timestamp sits outside the hover-gated action footer so it shows at rest', () => {
    // Inside .ega-turn-actions it would hide until hover; it must show at rest like the user turn's.
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const turn = mkAssistantTurn({ createdAt: FIXED_TS });
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    const el = container.querySelector('[data-ega-timestamp]');
    expect(el).not.toBeNull();
    expect(el?.closest('.ega-turn-actions')).toBeNull();
  });
});
