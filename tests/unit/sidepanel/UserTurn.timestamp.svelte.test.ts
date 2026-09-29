// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

const FIXED_NOW = 1_718_000_300_000; // +5 min after FIXED_TS
const FIXED_TS = 1_718_000_000_000;

afterEach(() => {
  vi.restoreAllMocks();
});

function mkUserTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 'u1',
    role: 'user',
    createdAt: 1,
    kind: 'translate',
    status: 'idle',
    content: 'hello',
    ...overrides,
  };
}

describe('UserTurn timestamp', () => {
  it('renders [data-ega-timestamp] with non-empty text when createdAt is set', () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const turn = mkUserTurn({ createdAt: FIXED_TS });
    const { container } = render(UserTurn, { props: { turn } });
    const el = container.querySelector('[data-ega-timestamp]');
    expect(el).not.toBeNull();
    expect(String(el?.textContent).trim()).not.toBe('');
  });

  // Migrated from native `title` to the shared data-tooltip
  // mechanism so the timestamp tooltip matches the rest of the card.
  it('[data-ega-timestamp] exposes the absolute datetime via data-tooltip, not native title', () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const turn = mkUserTurn({ createdAt: FIXED_TS });
    const { container } = render(UserTurn, { props: { turn } });
    const el = container.querySelector('[data-ega-timestamp]');
    expect(el?.hasAttribute('title')).toBe(false);
    expect(el?.getAttribute('data-tooltip')).toBe(new Date(FIXED_TS).toLocaleString());
    expect(el?.getAttribute('data-tooltip-placement')).toBe('top');
  });
});
