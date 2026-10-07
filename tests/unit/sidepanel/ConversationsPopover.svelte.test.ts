// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ConversationsPopover from '@/sidepanel/ConversationsPopover.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

function userTurn(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

function anchor(): HTMLElement {
  const a = document.createElement('button');
  document.body.appendChild(a);
  return a;
}

async function seed(): Promise<void> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000);
  await saveThread('https://a.test', [userTurn('a1', 'como estas')]);
  vi.setSystemTime(2_000);
  await saveThread('https://a.test#x', [
    userTurn('a2', 'Hola, me llamo Ana\nsegunda'),
    userTurn('a3', 'b'),
  ]);
  vi.setSystemTime(3_000);
  await saveThread('https://other.test', [userTurn('o1', 'Bonjour à tous')]);
  vi.useRealTimers();
}

function rows(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[data-ega-conv-row]'));
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Conversations popover', () => {
  it('lists this site first, then other sites, newest first, and marks the open one', async () => {
    await seed();
    render(ConversationsPopover, {
      props: {
        open: true,
        anchor: anchor(),
        activeId: 'https://a.test',
        tabSite: 'https://a.test',
        onClose: () => {},
        onOpen: async () => true,
        onDelete: async () => ({ undo: () => {} }),
      },
    });
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows().map((r) => r.dataset['egaConvRow'])).toEqual([
      'https://a.test#x',
      'https://a.test',
      'https://other.test',
    ]);
    const titles = rows().map((r) => r.querySelector('[data-ega-conv-title]')?.textContent);
    expect(titles).toEqual(['Hola, me llamo Ana', 'como estas', 'Bonjour à tous']);
    expect(rows()[0]?.textContent).toContain('2 messages');
    expect(rows()[2]?.textContent).toContain('other.test ·');
    const current = rows()[1]?.querySelector('[data-ega-conv-open]');
    expect(current?.getAttribute('aria-current')).toBe('true');
    expect(current?.getAttribute('aria-label')).toMatch(/, open now$/);
    expect(document.body.textContent).toContain('Keeps your 50 latest conversations');
  });

  it('marks a title as allowed to end in an ellipsis, with the full title in its row name', async () => {
    await seed();
    render(ConversationsPopover, {
      props: {
        open: true,
        anchor: anchor(),
        activeId: 'https://a.test',
        tabSite: 'https://a.test',
        onClose: () => {},
        onOpen: async () => true,
        onDelete: async () => ({ undo: () => {} }),
      },
    });
    await waitFor(() => expect(rows()).toHaveLength(3));
    for (const row of rows()) {
      const title = row.querySelector('[data-ega-conv-title]');
      // The design-rules check flags every ellipsis that lacks this mark.
      expect(title?.hasAttribute('data-ega-truncates')).toBe(true);
      const name = row.querySelector('[data-ega-conv-open]')?.getAttribute('aria-label') ?? '';
      expect(name.startsWith(title?.textContent ?? '?')).toBe(true);
    }
  });

  it('Open hands the id over; delete turns the row into Undo, and Undo puts it back', async () => {
    await seed();
    const onOpen = vi.fn(async () => true);
    const undo = vi.fn();
    const onDelete = vi.fn(async () => ({ undo }));
    render(ConversationsPopover, {
      props: {
        open: true,
        anchor: anchor(),
        activeId: 'https://a.test',
        tabSite: 'https://a.test',
        onClose: () => {},
        onOpen,
        onDelete,
      },
    });
    await waitFor(() => expect(rows()).toHaveLength(3));
    await fireEvent.click(rows()[2]?.querySelector('[data-ega-conv-open]') as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith('https://other.test');

    await fireEvent.click(rows()[0]?.querySelector('[data-ega-conv-delete]') as HTMLElement);
    const undoBtn = await waitFor(() => {
      const b = rows()[0]?.querySelector<HTMLElement>('[data-ega-conv-undo]');
      if (!b) throw new Error('no undo yet');
      return b;
    });
    expect(rows()[0]?.textContent).toContain('Conversation deleted');
    expect(document.activeElement).toBe(undoBtn);
    await fireEvent.click(undoBtn);
    expect(undo).toHaveBeenCalledOnce();
    await waitFor(() => expect(rows()[0]?.querySelector('[data-ega-conv-open]')).not.toBeNull());
  });

  it('a delete the worker refused brings the row back with its reason', async () => {
    await seed();
    let fail: () => void = () => {};
    render(ConversationsPopover, {
      props: {
        open: true,
        anchor: anchor(),
        activeId: 'https://a.test',
        tabSite: 'https://a.test',
        onClose: () => {},
        onOpen: async () => true,
        onDelete: async (_id: string, onFail: () => void) => {
          fail = onFail;
          return { undo: () => {} };
        },
      },
    });
    await waitFor(() => expect(rows()).toHaveLength(3));
    await fireEvent.click(rows()[0]?.querySelector('[data-ega-conv-delete]') as HTMLElement);
    fail();
    await waitFor(() => expect(document.body.textContent).toContain("Couldn't delete. Try again."));
    expect(rows()[0]?.querySelector('[data-ega-conv-open]')).not.toBeNull();
  });

  it('arrows walk the rows, Right reaches Delete, and the Delete key deletes', async () => {
    await seed();
    const onDelete = vi.fn(async () => ({ undo: () => {} }));
    render(ConversationsPopover, {
      props: {
        open: true,
        anchor: anchor(),
        activeId: 'https://a.test',
        tabSite: 'https://a.test',
        onClose: () => {},
        onOpen: async () => true,
        onDelete,
      },
    });
    await waitFor(() => expect(rows()).toHaveLength(3));
    const first = rows()[0]?.querySelector<HTMLElement>('[data-ega-conv-open]') as HTMLElement;
    first.focus();
    await fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows()[1]?.querySelector('[data-ega-conv-open]'));
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(rows()[1]?.querySelector('[data-ega-conv-delete]'));
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledWith('https://a.test', expect.any(Function));
  });

  it('says so when there is nothing to list', async () => {
    render(ConversationsPopover, {
      props: {
        open: true,
        anchor: anchor(),
        activeId: 'https://none.test#n',
        tabSite: 'https://none.test',
        onClose: () => {},
        onOpen: async () => true,
        onDelete: async () => ({ undo: () => {} }),
      },
    });
    await waitFor(() => expect(document.body.textContent).toContain('No other conversations yet'));
  });

  it('follows the index while open: a conversation saved elsewhere appears', async () => {
    await seed();
    render(ConversationsPopover, {
      props: {
        open: true,
        anchor: anchor(),
        activeId: 'https://a.test',
        tabSite: 'https://a.test',
        onClose: () => {},
        onOpen: async () => true,
        onDelete: async () => ({ undo: () => {} }),
      },
    });
    await waitFor(() => expect(rows()).toHaveLength(3));

    // Another window's save writes the index; the open list hears it through storage.onChanged.
    await saveThread('https://new.test', [userTurn('n1', 'from another window')]);

    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(rows().map((r) => r.dataset['egaConvRow'])).toContain('https://new.test');
  });
});
