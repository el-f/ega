// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import { sel } from '@tests/_helpers/lang';
import { openMenu } from './_reply';

const MIN = 60_000;
const u = (id: string, content: string, createdAt = 1, over: Partial<Turn> = {}): Turn =>
  ({
    createdAt,
    id,
    role: 'user',
    kind: 'translate',
    status: 'idle',
    content,
    dispatch: { sourceLang: sel('es'), targetLang: sel('en'), stream: false },
    ...over,
  }) as Turn;
const a = (id: string, content: string, attached: string, createdAt = 1): Turn => ({
  createdAt,
  id,
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content,
  attachedToTurnId: attached,
});

const base = {
  focusedTurnId: null,
  onRetry: vi.fn(),
  onFocusChange: vi.fn(),
};

describe('the thread', () => {
  it('puts a day line over the first message and over one 30+ minutes after the last', () => {
    const t0 = new Date(2026, 9, 6, 10, 0).getTime();
    const turns = [
      u('u1', 'hola', t0),
      a('a1', 'hello', 'u1', t0),
      u('u2', 'adios', t0 + 5 * MIN),
      a('a2', 'bye', 'u2', t0 + 5 * MIN),
      u('u3', 'gracias', t0 + 60 * MIN),
      a('a3', 'thanks', 'u3', t0 + 60 * MIN),
    ];
    const { container } = render(ConversationStream, { props: { ...base, turns } });
    const lines = container.querySelectorAll('[data-ega-day-separator]');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.nextElementSibling?.getAttribute('data-turn-id')).toBe('u1');
    expect(lines[1]?.nextElementSibling?.getAttribute('data-turn-id')).toBe('u3');
    expect(lines[0]?.querySelector('time')?.getAttribute('datetime')).toBe(
      new Date(t0).toISOString(),
    );
  });

  it('names a message task only where it changes', () => {
    const turns = [
      u('u1', 'hola'),
      a('a1', 'hello', 'u1'),
      u('u2', 'why', 2, { kind: 'explain' }),
      a('a2', 'because', 'u2', 2),
      u('u3', 'and', 3, { kind: 'explain' }),
      a('a3', 'so', 'u3', 3),
    ];
    const { container } = render(ConversationStream, { props: { ...base, turns } });
    const labels = Array.from(container.querySelectorAll('.ega-task-label')).map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(['Explain']);
  });

  it('only the newest reply keeps its row in view; older ones are marked', () => {
    const turns = [u('u1', 'a'), a('a1', 'A', 'u1'), u('u2', 'b', 2), a('a2', 'B', 'u2', 2)];
    const { container } = render(ConversationStream, {
      props: { ...base, turns, latestTurnId: 'a2' },
    });
    const replies = container.querySelectorAll('[data-ega-reply]');
    expect(replies[0]?.classList.contains('older')).toBe(true);
    expect(replies[1]?.classList.contains('older')).toBe(false);
  });

  it('a filtered list never makes a bookmarked older reply the newest', () => {
    const turns = [u('u1', 'a'), a('a1', 'A', 'u1')];
    const { container } = render(ConversationStream, {
      props: { ...base, turns, latestTurnId: 'a9' },
    });
    expect(container.querySelector('[data-ega-reply]')?.classList.contains('older')).toBe(true);
  });

  it('mounts the 60 newest turns and offers the rest', async () => {
    const turns: Turn[] = [];
    for (let i = 0; i < 35; i++)
      turns.push(u(`u${i}`, `m${i}`, i), a(`a${i}`, `r${i}`, `u${i}`, i));
    const { container } = render(ConversationStream, { props: { ...base, turns } });
    const more = container.querySelector<HTMLElement>('[data-ega-show-earlier]');
    expect(more?.textContent.trim()).toBe('Show 10 earlier messages');
    await fireEvent.click(more as HTMLElement);
    expect(container.querySelectorAll('[data-turn-id]')).toHaveLength(70);
  });

  // The last batch removes the button that was pressed; the cursor goes to the first message it showed (spec §8.5).
  it('moves focus to the first message shown when Show earlier goes away, and keeps it while one stays', async () => {
    const turns = (pairs: number): Turn[] => {
      const out: Turn[] = [];
      for (let i = 0; i < pairs; i++)
        out.push(u(`u${i}`, `m${i}`, i), a(`a${i}`, `r${i}`, `u${i}`, i));
      return out;
    };
    const onFocusChange = vi.fn();
    const last = render(ConversationStream, {
      props: { ...base, onFocusChange, turns: turns(35) },
    });
    await fireEvent.click(last.container.querySelector('[data-ega-show-earlier]') as HTMLElement);
    await waitFor(() => expect(onFocusChange).toHaveBeenCalledWith('u0'));
    document.body.innerHTML = '';
    onFocusChange.mockClear();
    const more = render(ConversationStream, {
      props: { ...base, onFocusChange, turns: turns(70) },
    });
    const button = more.container.querySelector<HTMLElement>('[data-ega-show-earlier]');
    await fireEvent.click(button as HTMLElement);
    await tick();
    expect(more.container.querySelector('[data-ega-show-earlier]')).toBe(button);
    expect(onFocusChange).not.toHaveBeenCalled();
  });

  it('the scroller is a log that does not announce its own children', () => {
    const { container } = render(ConversationStream, {
      props: { ...base, turns: [u('u1', 'a'), a('a1', 'A', 'u1')] },
    });
    const log = container.querySelector('[role="log"]');
    expect(log?.getAttribute('aria-live')).toBe('off');
  });

  it('gives each reply the text it answers, for About this reply', async () => {
    const turns = [
      u('u1', 'a long article to shorten'),
      { ...a('a1', 'Short', 'u1'), contextSent: null } as Turn,
    ];
    const { container } = render(ConversationStream, { props: { ...base, turns } });
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-ega-inspector]')).not.toBeNull());
    const row = [...container.querySelectorAll('.reply-details dt')].find(
      (d) => d.textContent.trim() === 'Your text',
    );
    expect(row?.nextElementSibling?.textContent.trim()).toBe('a long article to shorten');
  });
});

// Spec §5.2 item 3 and F12: a bookmark belongs to the pair, set from either half.
describe('bookmarks', () => {
  const marked = (t: Turn): Turn => ({ ...t, bookmarked: true });
  const openUserMore = async (container: HTMLElement): Promise<HTMLElement> => {
    const trigger = container.querySelector<HTMLElement>(
      '[data-ega-user-turn] [data-ega-action="more"]',
    );
    if (!trigger) throw new Error('message More missing');
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    return waitFor(() => {
      const menu = document.querySelector<HTMLElement>('[role="menu"]');
      if (!menu) throw new Error('menu not open');
      return menu;
    });
  };
  const checked = (menu: HTMLElement): string | null | undefined =>
    menu.querySelector('[data-ega-bookmark]')?.getAttribute('aria-checked');

  it('a bookmark set on the message shows on its reply, in the meta line and in both menus', async () => {
    const turns = [marked(u('u1', 'hola')), a('a1', 'hello', 'u1')];
    const { container } = render(ConversationStream, { props: { ...base, turns } });
    const meta = Array.from(container.querySelectorAll('[data-ega-meta-item]')).map((e) =>
      e.textContent.trim(),
    );
    expect(meta).toContain('Bookmarked');
    expect(checked(await openMenu(container, 'more'))).toBe('true');
    document.body.innerHTML = '';
    const other = render(ConversationStream, {
      props: { ...base, turns: [u('u1', 'hola'), marked(a('a1', 'hello', 'u1'))] },
    });
    expect(checked(await openUserMore(other.container))).toBe('true');
  });

  it('unchecking either half clears the pair; checking marks the half it was set on', async () => {
    const onBookmark = vi.fn();
    const on = render(ConversationStream, {
      props: { ...base, onBookmark, turns: [marked(u('u1', 'hola')), a('a1', 'hello', 'u1')] },
    });
    await openMenu(on.container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-bookmark]') as HTMLElement);
    expect(onBookmark.mock.calls).toEqual([['u1']]);
    document.body.innerHTML = '';
    onBookmark.mockClear();
    const off = render(ConversationStream, {
      props: { ...base, onBookmark, turns: [u('u1', 'hola'), a('a1', 'hello', 'u1')] },
    });
    await openMenu(off.container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-bookmark]') as HTMLElement);
    expect(onBookmark.mock.calls).toEqual([['a1']]);
  });
});

describe('the empty panel', () => {
  const props = {
    ...base,
    turns: [] as Turn[],
    onSuggestion: vi.fn(async () => 'no-selection' as const),
    onSetUpBackend: vi.fn(),
  };

  it('shows nothing until the first storage read lands, so no empty state flashes', () => {
    const { container } = render(ConversationStream, { props: { ...props, loaded: false } });
    expect(container.querySelector('[data-ega-sidepanel-empty]')).toBeNull();
  });

  it('offers three suggestions, and says why nothing was sent', async () => {
    const { container } = render(ConversationStream, { props });
    const empty = container.querySelector('[data-ega-sidepanel-empty]');
    expect(empty?.textContent).toContain('Translate or explain text on this page');
    const buttons = Array.from(empty?.querySelectorAll('[data-ega-suggestion]') ?? []).map((b) =>
      b.textContent.trim(),
    );
    expect(buttons).toEqual(['Translate selection', 'Explain selection', 'Translate this page']);
    await fireEvent.click(empty?.querySelector('[data-ega-suggestion]') as HTMLElement);
    await waitFor(() =>
      expect(container.querySelector('.ega-empty-status')?.textContent).toBe(
        'Select some text on the page first.',
      ),
    );
    expect(props.onSuggestion).toHaveBeenCalledWith('translate-selection');
  });

  it('with no backend, one call to set one up instead', async () => {
    const onSetUpBackend = vi.fn();
    const { container } = render(ConversationStream, {
      props: { ...props, backendReady: false, onSetUpBackend },
    });
    expect(container.textContent).toContain('Set up a backend to start');
    expect(container.querySelector('[data-ega-suggestion]')).toBeNull();
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Set up a backend',
    );
    await fireEvent.click(btn as HTMLElement);
    expect(onSetUpBackend).toHaveBeenCalledTimes(1);
  });

  it('a search with no match says so, with a way out', async () => {
    const onClearSearch = vi.fn();
    const { container } = render(ConversationStream, {
      props: { ...props, emptySearch: true, onClearSearch },
    });
    expect(container.textContent).toContain('No message here contains that text.');
    await fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.includes('Clear search'),
      ) as HTMLElement,
    );
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('an empty bookmark filter says where bookmarks come from', () => {
    const { container } = render(ConversationStream, {
      props: { ...props, emptyBookmarkFilter: true, onClearBookmarkFilter: vi.fn() },
    });
    expect(container.textContent).toContain(
      'Bookmark a message from its More menu to keep it here.',
    );
  });
});

describe('announcements', () => {
  it('says which conversation the panel now shows', async () => {
    const { container, rerender } = render(ConversationStream, {
      props: { ...base, turns: [u('u1', 'a'), a('a1', 'A', 'u1')] },
    });
    await rerender({
      ...base,
      turns: [u('u1', 'a'), a('a1', 'A', 'u1')],
      switchAnnouncement: 'Showing the conversation for lemonde.fr',
    });
    await tick();
    expect(container.querySelector('[data-ega-stream-live]')?.textContent).toBe(
      'Showing the conversation for lemonde.fr',
    );
  });
});
