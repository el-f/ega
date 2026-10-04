// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { UserTurnData } from '@/sidepanel/state/conversation';

function mkTurn(overrides: Partial<UserTurnData> = {}): UserTurnData {
  return {
    id: 'u1',
    role: 'user',
    createdAt: 1,
    kind: 'translate',
    status: 'idle',
    content: 'hello source',
    ...overrides,
  };
}

describe('UserTurn — per-turn actions', () => {
  beforeEach(() => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  });

  it('an older message hides its actions until hover or focus; a bookmarked one keeps them', () => {
    const article = (props: Record<string, unknown>): Element | null =>
      render(UserTurn, { props: { turn: mkTurn(), ...props } }).container.querySelector('article');
    expect(article({})?.classList.contains('quiet')).toBe(true);
    expect(article({ latest: true })?.classList.contains('quiet')).toBe(false);
    expect(article({ focused: true })?.classList.contains('quiet')).toBe(false);
    expect(
      render(UserTurn, { props: { turn: mkTurn({ bookmarked: true }) } })
        .container.querySelector('article')
        ?.classList.contains('quiet'),
    ).toBe(false);
    // jsdom runs no media queries, so the hiding rule itself is checked in the source.
    const src = readFileSync('src/sidepanel/conversation/UserTurn.svelte', 'utf8');
    expect(src).toMatch(
      /\.ega-user-turn\.quiet:not\(:hover\):not\(:focus-within\) \.ega-turn-actions \{\s*opacity: 0;/,
    );
  });

  it('renders copy-source button', () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn() } });
    expect(container.querySelector('[data-ega-copy-source]')).not.toBeNull();
  });

  it('copy-source click writes turn.content to clipboard', async () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn() } });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-copy-source]');
    if (!btn) throw new Error('copy-source btn missing');
    await fireEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello source');
  });

  it('renders bookmark button', () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn() } });
    expect(container.querySelector('[data-ega-bookmark]')).not.toBeNull();
  });

  it('bookmark button has aria-pressed=false when turn not bookmarked', () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn() } });
    const btn = container.querySelector('[data-ega-bookmark]');
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('bookmark button has aria-pressed=true when turn.bookmarked=true', () => {
    const { container } = render(UserTurn, {
      props: { turn: mkTurn({ bookmarked: true }) },
    });
    const btn = container.querySelector('[data-ega-bookmark]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('bookmark click fires onBookmark(id)', async () => {
    const onBookmark = vi.fn();
    const { container } = render(UserTurn, {
      props: { turn: mkTurn(), onBookmark },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-bookmark]');
    if (!btn) throw new Error('bookmark btn missing');
    await fireEvent.click(btn);
    expect(onBookmark).toHaveBeenCalledWith('u1');
  });

  it('renders delete button', () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn() } });
    expect(container.querySelector('[data-ega-delete]')).not.toBeNull();
  });

  it('delete click fires onDelete(id)', async () => {
    const onDelete = vi.fn();
    const { container } = render(UserTurn, {
      props: { turn: mkTurn(), onDelete },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-delete]');
    if (!btn) throw new Error('delete btn missing');
    await fireEvent.click(btn);
    expect(onDelete).toHaveBeenCalledWith('u1');
  });

  it('action row is in the DOM (always keyboard-reachable)', () => {
    const { container } = render(UserTurn, { props: { turn: mkTurn() } });
    expect(container.querySelector('.ega-turn-actions')).not.toBeNull();
  });
});
