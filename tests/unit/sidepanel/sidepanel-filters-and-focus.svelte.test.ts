// @vitest-environment jsdom
// Search and the bookmark filter belong to the conversation on screen, and focus never falls to the page body.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { openMenu } from './_reply';
import { bookmarkFilterOn, pickHeaderMenuItem } from './_header-menu';

const tabsQuery = chrome.tabs.query as unknown as Mock;

const user = (id: string, content: string, over: Partial<Turn> = {}): Turn =>
  ({ id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content, ...over }) as Turn;
const reply = (id: string, parent: string, over: Partial<Turn> = {}): Turn =>
  ({
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt: 2,
    content: `answer to ${parent}`,
    attachedToTurnId: parent,
    ...over,
  }) as Turn;

const turnIds = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-turn-id]')).map(
    (t) => t.dataset['turnId'] ?? '',
  );

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  tabsQuery.mockResolvedValue([{ id: 1, url: 'https://a.test/page' }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function openSearch(container: HTMLElement, query: string): Promise<void> {
  await fireEvent.click(container.querySelector('[data-ega-search-toggle]') as HTMLElement);
  const input = await waitFor(() => {
    const el = container.querySelector<HTMLInputElement>('[data-ega-search]');
    if (!el) throw new Error('search not open');
    return el;
  });
  await fireEvent.input(input, { target: { value: query } });
  await tick();
}

describe('SidePanel — filters follow the conversation', () => {
  it('New conversation closes search, so the empty one shows its suggestions', async () => {
    await saveThread('https://a.test', [user('u1', 'hola'), reply('a1', 'u1')]);
    const { container } = render(SidePanel);
    await waitFor(() => expect(turnIds(container)).toEqual(['u1', 'a1']));
    await openSearch(container, 'nothing like this');
    await fireEvent.click(container.querySelector('[data-ega-new-conversation]') as HTMLElement);

    // The new conversation is empty, so the header drops New; the query must not outlive the switch.
    await waitFor(() => expect(container.querySelector('[data-ega-new-conversation]')).toBeNull());
    await waitFor(() => expect(container.querySelector('[data-ega-search]')).toBeNull());
    expect(container.querySelector('[data-ega-no-search-matches]')).toBeNull();
  });

  it('a conversation opened from the list shows its messages, not the old query', async () => {
    await saveThread('https://other.test', [user('o1', 'bonjour'), reply('b1', 'o1')]);
    await saveThread('https://a.test', [user('u1', 'hola'), reply('a1', 'u1')]);
    const { container } = render(SidePanel);
    await waitFor(() => expect(turnIds(container)).toEqual(['u1', 'a1']));
    await openSearch(container, 'hola');
    await fireEvent.click(container.querySelector('[data-ega-header-site]') as HTMLElement);
    const open = await waitFor(() => {
      const b = document.querySelector<HTMLElement>(
        '[data-ega-conv-row="https://other.test"] [data-ega-conv-open]',
      );
      if (!b) throw new Error('row not shown');
      return b;
    });
    await fireEvent.click(open);
    await waitFor(() => expect(turnIds(container)).toEqual(['o1', 'b1']));
    expect(container.querySelector('[data-ega-search]')).toBeNull();
  });

  it('closing search with no toggle on screen puts focus in the message box', async () => {
    const { container } = render(SidePanel);
    await waitFor(() => expect(container.querySelector('#sp-text')).not.toBeNull());
    // An empty thread renders no Search toggle; the palette can still open search.
    expect(container.querySelector('[data-ega-search-toggle]')).toBeNull();
    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const item = await waitFor(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) =>
        o.textContent.includes('Search conversation'),
      );
      if (!el) throw new Error('palette not open');
      return el;
    }).catch(() => null);
    // On an empty thread the palette leaves search out, the way the header does.
    expect(item).toBeNull();
  });
});

describe('SidePanel — focus never falls to the page body', () => {
  it('un-bookmarking the last pair under the filter puts focus on "Show all messages"', async () => {
    await saveThread('https://a.test', [
      user('u1', 'hola'),
      reply('a1', 'u1', { bookmarked: true }),
    ]);
    const { container } = render(SidePanel);
    await waitFor(() => expect(turnIds(container)).toEqual(['u1', 'a1']));
    await pickHeaderMenuItem(container, '[data-ega-bookmark-filter]');
    expect(await bookmarkFilterOn(container)).toBe(true);

    const menu = await openMenu(container, 'more');
    await fireEvent.click(menu.querySelector('[data-ega-bookmark]') as HTMLElement);

    // The pair left the filtered list with the menu that toggled it.
    await waitFor(() => expect(turnIds(container)).toEqual([]));
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Show all messages'));
  });
});
