// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import SavedConversations from '@/options/components/SavedConversations.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

function userTurn(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

const sites = (c: HTMLElement): string[] =>
  [...c.querySelectorAll('.conv-site')].map((e) => e.textContent.trim());

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

    await fireEvent.click(getByRole('button', { name: 'Delete the conversation for gone.test' }));

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

    await fireEvent.click(getByRole('button', { name: 'Delete the conversation for stays.test' }));

    await waitFor(() => expect(vi.mocked(confirmDialog)).toHaveBeenCalled());
    expect((await loadThreadResult('https://stays.test')).turns).toHaveLength(1);
    expect(sites(container)).toEqual(['stays.test']);
  });

  it('Clear all removes every thread and shows the empty state', async () => {
    await saveThread('https://a.test', [userTurn('a1', 'a')]);
    await saveThread('https://b.test', [userTurn('b1', 'b')]);
    const { container, getByRole, findByText } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));

    await fireEvent.click(getByRole('button', { name: 'Clear all conversations' }));

    expect(await findByText('No saved conversations')).toBeTruthy();
    expect(vi.mocked(confirmDialog).mock.calls[0]?.[0].body).toMatch(/all 2 saved conversations/);
    expect(await chrome.storage.local.get('ega:conv:index')).toEqual({
      'ega:conv:index': undefined,
    });
  });

  it('picks up a thread a side panel saves while the page is open', async () => {
    const { container } = render(SavedConversations);
    await waitFor(() => expect(container.textContent).toMatch(/No saved conversations/));
    await saveThread('https://late.test', [userTurn('l1', 'late')]);
    await waitFor(() => expect(sites(container)).toEqual(['late.test']));
  });
});
