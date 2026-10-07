// @vitest-environment jsdom
// The real deleteConversation switches away from the open conversation and saves the index before it returns.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { pendingDeleteIds, forgetPendingDeletes } from '@/shared/saved-conversations';
import type { Turn } from '@/sidepanel/state/conversation';

const tabsQuery = chrome.tabs.query as unknown as Mock;
const sendMessage = chrome.runtime.sendMessage as Mock;

const user = (id: string, content: string): Turn =>
  ({ id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content }) as Turn;

const turnIds = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-turn-id]')).map(
    (t) => t.dataset['turnId'] ?? '',
  );

function row(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-ega-conv-row="${CSS.escape(id)}"]`);
}

async function openList(container: HTMLElement): Promise<void> {
  const title = await waitFor(() => {
    const el = container.querySelector<HTMLElement>('[data-ega-header-site]');
    if (!el) throw new Error('header not mounted');
    return el;
  });
  await fireEvent.click(title);
  await waitFor(() => {
    if (!row('https://a.test')?.querySelector('[data-ega-conv-open]'))
      throw new Error('row not shown');
  });
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
  tabsQuery.mockResolvedValue([{ id: 1, url: 'https://a.test/page' }]);
  await saveThread('https://other.test', [user('o1', 'bonjour')]);
  await saveThread('https://a.test', [user('a1', 'hola')]);
});

afterEach(() => {
  forgetPendingDeletes();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SidePanel — delete the open conversation from the list', () => {
  it('turns its row into "Conversation deleted · Undo" with focus on Undo, and Undo cancels the delete', async () => {
    const { container } = render(SidePanel);
    await waitFor(() => expect(turnIds(container)).toEqual(['a1']));
    await openList(container);
    const open = row('https://a.test')?.querySelector<HTMLElement>('[data-ega-conv-open]');
    expect(open?.getAttribute('aria-current')).toBe('true');

    const del = row('https://a.test')?.querySelector<HTMLElement>('[data-ega-conv-delete]');
    if (!del) throw new Error('delete not shown');
    await fireEvent.click(del);

    // The panel moved to an empty conversation for the site, and the list kept the row as its Undo line.
    await waitFor(() => expect(turnIds(container)).toEqual([]));
    const undo = await waitFor(() => {
      const b = row('https://a.test')?.querySelector<HTMLElement>('[data-ega-conv-undo]');
      if (!b) throw new Error('no Undo line');
      return b;
    });
    expect(row('https://a.test')?.textContent).toContain('Conversation deleted');
    await waitFor(() => expect(document.activeElement).toBe(undo));
    expect(pendingDeleteIds().has('https://a.test')).toBe(true);

    await fireEvent.click(undo);
    await waitFor(() =>
      expect(row('https://a.test')?.querySelector('[data-ega-conv-open]')).not.toBeNull(),
    );
    expect(pendingDeleteIds().has('https://a.test')).toBe(false);
  });

  it('a second Delete while the first one runs schedules nothing more', async () => {
    const { container } = render(SidePanel);
    await waitFor(() => expect(turnIds(container)).toEqual(['a1']));
    await openList(container);
    const open = row('https://a.test')?.querySelector<HTMLElement>('[data-ega-conv-open]');
    if (!open) throw new Error('open not shown');
    open.focus();
    // Both presses land before the row re-renders, the way a key repeat does.
    const press = (): boolean =>
      open.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    press();
    press();

    const undo = await waitFor(() => {
      const b = row('https://a.test')?.querySelector<HTMLElement>('[data-ega-conv-undo]');
      if (!b) throw new Error('no Undo line');
      return b;
    });
    await fireEvent.click(undo);
    // One Undo cancels everything this row scheduled: no second delete is left waiting.
    await waitFor(() => expect(pendingDeleteIds().size).toBe(0));
  });

  it('closing the panel inside the Undo window sends the delete at once', async () => {
    const { container } = render(SidePanel);
    await waitFor(() => expect(turnIds(container)).toEqual(['a1']));
    await openList(container);
    const del = row('https://other.test')?.querySelector<HTMLElement>('[data-ega-conv-delete]');
    if (!del) throw new Error('delete not shown');
    await fireEvent.click(del);
    await waitFor(() =>
      expect(row('https://other.test')?.querySelector('[data-ega-conv-undo]')).not.toBeNull(),
    );
    const deletes = (): unknown[] =>
      sendMessage.mock.calls
        .map((c) => c[0] as { kind?: string })
        .filter((m) => m.kind === 'conversations:delete');
    expect(deletes()).toHaveLength(0);

    window.dispatchEvent(new Event('pagehide'));

    expect(deletes()).toEqual([{ kind: 'conversations:delete', ids: ['https://other.test'] }]);
  });
});
