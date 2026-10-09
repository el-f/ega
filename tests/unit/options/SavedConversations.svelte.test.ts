// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { toastStore } from '@/shared/components/toastStore';
import SavedConversations from '@/options/components/SavedConversations.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import {
  deleteSavedConversation,
  flushPendingDeletes,
  forgetPendingDeletes,
} from '@/shared/saved-conversations';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

function userTurn(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

// The row's first line: the conversation's title, or its site when the row has no facts.
const sites = (c: HTMLElement): string[] =>
  [...c.querySelectorAll('[data-ega-conv-title]')].map((e) => e.textContent.trim());

beforeEach(() => {
  const send = async (request: unknown): Promise<{ ok: boolean }> => {
    const msg = request as { kind: string; ids: readonly string[] };
    if (msg.kind === 'conversations:delete') {
      for (const id of msg.ids) await deleteSavedConversation(id);
    }
    return { ok: true };
  };
  // Chrome's callback overload says void; this worker fixture implements its Promise overload.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation(send);
});
afterEach(() => {
  forgetPendingDeletes();
  vi.restoreAllMocks();
});

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
    expect(sites(container)).toContain('pdf text');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toMatch(/3 KB/);
  });

  it('shows the empty state when nothing is saved', async () => {
    const { findByText } = render(SavedConversations);
    expect(await findByText('No saved conversations')).toBeTruthy();
  });

  it('Delete hides the row immediately and commits its own thread after Undo closes', async () => {
    await saveThread('https://gone.test', [userTurn('g1', 'one')]);
    await saveThread('https://kept.test', [userTurn('k1', 'two')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));

    await fireEvent.click(getByRole('button', { name: /Delete conversation.*gone.test/ }));

    await waitFor(() => expect(sites(container)).toEqual(['two']));
    expect(confirmDialog).not.toHaveBeenCalled();
    expect((await loadThreadResult('https://gone.test')).turns).toHaveLength(1);
    flushPendingDeletes();
    await waitFor(async () =>
      expect((await loadThreadResult('https://gone.test')).turns).toEqual([]),
    );
    expect((await loadThreadResult('https://kept.test')).turns).toHaveLength(1);
  });

  it('Undo keeps the thread and restores focus to its row', async () => {
    await saveThread('https://stays.test', [userTurn('s1', 'one')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toEqual(['one']));
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});

    await fireEvent.click(getByRole('button', { name: /Delete conversation.*stays.test/ }));

    push.mock.calls.at(-1)?.[0].action?.onClick();
    flushPendingDeletes();
    expect((await loadThreadResult('https://stays.test')).turns).toHaveLength(1);
    await waitFor(() => expect(sites(container)).toEqual(['one']));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        getByRole('button', { name: /Delete conversation.*stays.test/ }),
      ),
    );
  });

  it('a failed Delete offers Try again, which deletes without asking again', async () => {
    await saveThread('https://retry.test', [userTurn('r1', 'one')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toEqual(['one']));
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValueOnce(new Error('quota'));

    await fireEvent.click(getByRole('button', { name: /Delete conversation.*retry.test/ }));
    flushPendingDeletes();
    await waitFor(() => expect(push.mock.calls.at(-1)?.[0].action?.label).toBe('Try again'));
    await waitFor(() => expect(sites(container)).toEqual(['one']));
    const action = push.mock.calls.at(-1)?.[0].action;
    expect(action?.label).toBe('Try again');

    action?.onClick();
    flushPendingDeletes();
    await waitFor(() => expect(sites(container)).toEqual([]));
    expect(confirmDialog).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it('Clear all removes every thread and shows the empty state', async () => {
    await saveThread('https://a.test', [userTurn('a1', 'a')]);
    await saveThread('https://b.test', [userTurn('b1', 'b')]);
    const { container, getByRole, findByText } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));

    await fireEvent.click(getByRole('button', { name: 'Delete all' }));

    expect(await findByText('No saved conversations')).toBeTruthy();
    expect(confirmDialog).not.toHaveBeenCalled();
    flushPendingDeletes();
    await waitFor(async () => {
      expect((await loadThreadResult('https://a.test')).turns).toEqual([]);
      expect((await loadThreadResult('https://b.test')).turns).toEqual([]);
    });
  });

  it('after a delete, focus goes to the next row, else the card title', async () => {
    await saveThread('https://a.test', [userTurn('a1', 'a')]);
    await saveThread('https://b.test', [userTurn('b1', 'b')]);
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(sites(container)).toHaveLength(2));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-ega-conv-delete]')];
    const first = buttons[0]?.getAttribute('aria-label') ?? '';
    const second = buttons[1]?.getAttribute('aria-label') ?? '';

    await fireEvent.click(getByRole('button', { name: first }));
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe(second));
    expect(confirmDialog).not.toHaveBeenCalled();

    await fireEvent.click(getByRole('button', { name: 'Delete all' }));
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Saved conversations'));
  });

  it('picks up a thread a side panel saves while the page is open', async () => {
    const { container } = render(SavedConversations);
    await waitFor(() => expect(container.textContent).toMatch(/No saved conversations/));
    await saveThread('https://late.test', [userTurn('l1', 'late')]);
    await waitFor(() => expect(sites(container)).toEqual(['late']));
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

  it('says when a conversation was last used as a relative time; the full date is for screen readers', async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    await seedIndex([
      { origin: 'https://example.com#k1', updatedAt: twoHoursAgo, bytes: 2048, messages: 2 },
    ]);
    const { container } = render(SavedConversations);
    await waitFor(() => expect(meta(container)).toHaveLength(1));
    const when = container.querySelector('.conv-meta [aria-hidden="true"]');
    expect(when?.textContent).toBe('2h ago');
    expect(container.querySelector('.conv-meta .ega-sr-only')?.textContent).toBe(
      new Date(twoHoursAgo).toLocaleString(),
    );
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
    vi.mocked(chrome.runtime.sendMessage)
      .mockRejectedValueOnce(new Error('quota'))
      .mockRejectedValueOnce(new Error('quota'));

    await fireEvent.click(getByRole('button', { name: /Delete conversation.*one.test/ }));
    flushPendingDeletes();
    await waitFor(() =>
      expect(push.mock.calls.filter(([toast]) => toast.variant === 'danger')).toHaveLength(1),
    );
    await fireEvent.click(getByRole('button', { name: /Delete conversation.*two.test/ }));
    flushPendingDeletes();
    await waitFor(() =>
      expect(push.mock.calls.filter(([toast]) => toast.variant === 'danger')).toHaveLength(2),
    );
    const [first, second] = push.mock.calls
      .map((c) => c[0])
      .filter((toast) => toast.variant === 'danger');
    expect(first?.key).toBeDefined();
    expect(first?.key).not.toBe(second?.key);

    close.mockClear();
    await fireEvent.click(getByRole('button', { name: /Delete conversation.*one.test/ }));
    await waitFor(() => expect(sites(container)).toEqual(['two']));
    expect(close).toHaveBeenCalledWith(first?.key);
    push.mockRestore();
    close.mockRestore();
  });
});
