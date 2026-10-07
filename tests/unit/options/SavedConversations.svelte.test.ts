// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { toastStore } from '@/shared/components/toastStore';
import SavedConversations from '@/options/components/SavedConversations.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

function userTurn(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

// The row's first line: the conversation's title, or its site when the row has no facts.
const sites = (c: HTMLElement): string[] =>
  [...c.querySelectorAll('[data-ega-conv-title]')].map((e) => e.textContent.trim());

describe('SavedConversations', () => {
  beforeEach(() => {
    vi.mocked(confirmDialog).mockReset();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('lists each site that has a conversation, with its size', async () => {
    await saveThread('https://example.com', [userTurn('e1', 'x'.repeat(3000))]);
    await saveThread('general', [userTurn('g1', 'pdf text')]);
    const { container } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));
    expect(sites(container).sort()).toEqual(['Other pages', 'example.com']);
    expect(container.textContent).toMatch(/3 KB/);
  });

  it('shows the empty state when nothing is saved', async () => {
    const { findByText } = render(SavedConversations);
    expect(await findByText('No saved conversations')).toBeTruthy();
  });

  it('Delete asks first, then empties that thread and drops its row', async () => {
    await saveThread('https://gone.test', [userTurn('g1', 'one')]);
    await saveThread('https://kept.test', [userTurn('k1', 'two')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));

    await fireEvent.click(getByRole('button', { name: 'Delete conversation for gone.test' }));

    await waitFor(() => expect(sites(container)).toEqual(['kept.test']));
    expect(vi.mocked(confirmDialog)).toHaveBeenCalledTimes(1);
    expect((await loadThreadResult('https://gone.test')).turns).toEqual([]);
    expect((await loadThreadResult('https://kept.test')).turns).toHaveLength(1);
  });

  it('a cancelled Delete keeps the thread', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);
    await saveThread('https://stays.test', [userTurn('s1', 'one')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toEqual(['stays.test']));

    await fireEvent.click(getByRole('button', { name: 'Delete conversation for stays.test' }));

    await waitFor(() => expect(vi.mocked(confirmDialog)).toHaveBeenCalled());
    expect((await loadThreadResult('https://stays.test')).turns).toHaveLength(1);
    expect(sites(container)).toEqual(['stays.test']);
  });

  it('a failed Delete offers Try again, which deletes without asking again', async () => {
    await saveThread('https://retry.test', [userTurn('r1', 'one')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toEqual(['retry.test']));
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));

    await fireEvent.click(getByRole('button', { name: 'Delete conversation for retry.test' }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(sites(container)).toEqual(['retry.test']);
    const action = push.mock.calls[0]?.[0].action;
    expect(action?.label).toBe('Try again');

    action?.onClick();
    await waitFor(() => expect(sites(container)).toEqual([]));
    expect(vi.mocked(confirmDialog)).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('Clear all removes every thread and shows the empty state', async () => {
    await saveThread('https://a.test', [userTurn('a1', 'a')]);
    await saveThread('https://b.test', [userTurn('b1', 'b')]);
    const { container, getByRole, findByText } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));

    await fireEvent.click(getByRole('button', { name: 'Delete all' }));

    expect(await findByText('No saved conversations')).toBeTruthy();
    expect(vi.mocked(confirmDialog).mock.calls[0]?.[0].body).toMatch(/all 2 saved conversations/);
    expect(await chrome.storage.local.get('ega:conv:index')).toEqual({
      'ega:conv:index': undefined,
    });
  });

  it('after a delete, focus goes to the next row, else the card title', async () => {
    await saveThread('https://a.test', [userTurn('a1', 'a')]);
    await saveThread('https://b.test', [userTurn('b1', 'b')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));
    const first = sites(container)[0] ?? '';
    const second = sites(container)[1] ?? '';

    await fireEvent.click(getByRole('button', { name: `Delete conversation for ${first}` }));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        `Delete conversation for ${second}`,
      ),
    );
    // The confirm says nothing about an open side panel: with several conversations per site it may not empty.
    expect(vi.mocked(confirmDialog).mock.calls[0]?.[0].body).not.toMatch(/side panel empties/);

    await fireEvent.click(getByRole('button', { name: 'Delete all' }));
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Saved conversations'));
  });

  it('picks up a thread a side panel saves while the page is open', async () => {
    const { container } = render(SavedConversations);
    await waitFor(() => expect(container.textContent).toMatch(/No saved conversations/));
    await saveThread('https://late.test', [userTurn('l1', 'late')]);
    await waitFor(() => expect(sites(container)).toEqual(['late.test']));
  });
});

// The side panel now keeps several conversations per site and writes each row's facts into the index.
describe('SavedConversations: one row per conversation, with its facts', () => {
  async function seedIndex(threads: Record<string, unknown>[]): Promise<void> {
    await chrome.storage.local.set({ 'ega:conv:index': { version: 1, threads } });
  }
  const primary = (c: HTMLElement): string[] =>
    [...c.querySelectorAll('[data-ega-conv-title]')].map((e) => e.textContent.trim());
  const meta = (c: HTMLElement): string[] =>
    [...c.querySelectorAll('.conv-meta')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());

  it('names each conversation by its first message, then the site and the message count', async () => {
    await seedIndex([
      {
        origin: 'https://example.com#k1',
        updatedAt: 2_000,
        bytes: 2048,
        title: 'Hola, ¿cómo estás?',
        messages: 4,
      },
      {
        origin: 'https://example.com#k2',
        updatedAt: 1_000,
        bytes: 1024,
        imageFirst: true,
        messages: 1,
      },
    ]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(primary(container)).toEqual(['Hola, ¿cómo estás?', 'Image']));
    expect(meta(container)[0]).toMatch(/^example\.com · 4 messages · /);
    expect(meta(container)[1]).toMatch(/^example\.com · 1 message · /);
    expect(
      getByRole('button', { name: 'Delete conversation "Hola, ¿cómo estás?" on example.com' }),
    ).toBeTruthy();
  });

  it('a row saved before the facts existed shows its site, as before', async () => {
    await seedIndex([{ origin: 'https://old.test', updatedAt: 1_000, bytes: 1024 }]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(primary(container)).toEqual(['old.test']));
    expect(meta(container)[0]).not.toMatch(/old\.test|message/);
    expect(getByRole('button', { name: 'Delete conversation for old.test' })).toBeTruthy();
  });
});

// X14: error toasts collapse by key, and a failure's Try again must retry its own delete.
describe('SavedConversations: failed deletes', () => {
  beforeEach(() => {
    vi.mocked(confirmDialog).mockReset();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('two rows that fail keep two toasts, and deleting a row again closes its old one first', async () => {
    await saveThread('https://one.test', [userTurn('o1', 'one')]);
    await saveThread('https://two.test', [userTurn('t1', 'two')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const close = vi.spyOn(toastStore, 'close').mockImplementation(() => {});
    vi.spyOn(chrome.storage.local, 'set')
      .mockRejectedValueOnce(new Error('quota'))
      .mockRejectedValueOnce(new Error('quota'));

    await fireEvent.click(getByRole('button', { name: 'Delete conversation for one.test' }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    await fireEvent.click(getByRole('button', { name: 'Delete conversation for two.test' }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    const [first, second] = push.mock.calls.map((c) => c[0]);
    expect(first?.key).toBeDefined();
    expect(first?.key).not.toBe(second?.key);

    close.mockClear();
    await fireEvent.click(getByRole('button', { name: 'Delete conversation for one.test' }));
    await waitFor(() => expect(sites(container)).toEqual(['two.test']));
    expect(close).toHaveBeenCalledWith(first?.key);
    push.mockRestore();
    close.mockRestore();
  });
});
