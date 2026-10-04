import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { asLangSelection } from '@/shared/brands';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { deleteSavedConversation } from '@/shared/saved-conversations';
import type { Turn } from '@/sidepanel/state/conversation';

type Changes = Record<string, chrome.storage.StorageChange>;

const ORIGIN = 'https://deleted-from-options.test';

function userTurn(id: string, content: string, createdAt = 1): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt, content };
}

async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const listeners: Array<(changes: Changes, area: string) => void> = [];

/** A side panel on ORIGIN, wired to storage changes the way SidePanel.svelte wires it. */
async function openPanel(): Promise<ReturnType<typeof createConversation>> {
  const c = createConversation();
  const listener = (changes: Changes, area: string): void => {
    if (area === 'local') c.onStorageChanged(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  listeners.push(listener);
  await c.setActiveOrigin(ORIGIN);
  return c;
}

beforeEach(() => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  for (const l of listeners) chrome.storage.onChanged.removeListener(l);
  listeners.length = 0;
});

describe('deleting a saved conversation from the options page', () => {
  it('empties an open side panel on that site, and the panel does not save it back', async () => {
    await saveThread(ORIGIN, [userTurn('t1', 'one'), userTurn('t2', 'two', 2)]);
    const panel = await openPanel();
    expect(panel.turns.map((t) => t.id)).toEqual(['t1', 't2']);
    // The panel saves last, so the blob carries its writer stamp when the delete lands.
    panel.toggleBookmark('t1');
    await panel.flush();

    await deleteSavedConversation(ORIGIN);
    await drain();

    expect(panel.turns).toEqual([]);
    await panel.flush();
    expect((await loadThreadResult(ORIGIN)).turns).toEqual([]);
  });

  it('also drops a turn the size cap left only in the panel, so closing the panel writes nothing back', async () => {
    await saveThread(ORIGIN, [userTurn('old', 'oldest', 1), userTurn('t2', 'two', 2)]);
    const panel = await openPanel();
    // Another window's save without the oldest turn, as the 512 KB cap writes it: the panel keeps it in memory.
    await saveThread(ORIGIN, [userTurn('t2', 'two', 2)], { knownIds: new Set(['old', 't2']) });
    await drain();
    expect(panel.turns.map((t) => t.id)).toEqual(['old', 't2']);
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.id)).toEqual(['t2']);

    await deleteSavedConversation(ORIGIN);
    await drain();

    expect(panel.turns).toEqual([]);
    await panel.flush();
    expect((await loadThreadResult(ORIGIN)).turns).toEqual([]);
  });

  it('keeps a turn the panel creates after the delete', async () => {
    await saveThread(ORIGIN, [userTurn('t1', 'one', 1)]);
    await deleteSavedConversation(ORIGIN);
    const later = Date.now() + 1000;
    await saveThread(ORIGIN, [userTurn('fresh', 'new', later)]);
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.id)).toEqual(['fresh']);
  });

  it('keeps turns made after the panel saw the delete, even with the clock set back', async () => {
    await saveThread(ORIGIN, [userTurn('t1', 'one', 1)]);
    await deleteSavedConversation(ORIGIN);
    const { clearedAt } = await loadThreadResult(ORIGIN);
    expect(clearedAt).toBeDefined();
    const back = (clearedAt ?? 0) - 60_000;

    await saveThread(ORIGIN, [userTurn('late', 'clock went back', back)], {
      knownIds: new Set(['late']),
      ...(clearedAt !== undefined ? { seenClearedAt: clearedAt } : {}),
    });
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.id)).toEqual(['late']);

    // A writer that never saw the delete still cannot bring an older turn back.
    await saveThread(ORIGIN, [userTurn('stale', 'from before', back)], {
      knownIds: new Set(['stale']),
    });
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.id)).toEqual(['late']);
  });

  it('an open panel that saw the delete keeps what it sends next, whatever the clock', async () => {
    await saveThread(ORIGIN, [userTurn('t1', 'one', 1)]);
    const panel = await openPanel();
    await deleteSavedConversation(ORIGIN);
    await drain();
    expect(panel.turns).toEqual([]);
    const { clearedAt } = await loadThreadResult(ORIGIN);
    const now = vi.spyOn(Date, 'now').mockReturnValue((clearedAt ?? 0) - 60_000);
    try {
      await panel.send({
        content: 'after the clock moved back',
        kind: 'translate',
        sourceLang: asLangSelection('auto'),
        targetLang: asLangSelection('en'),
        stream: true,
      });
      await panel.flush();
    } finally {
      now.mockRestore();
    }
    expect(panel.turns.map((t) => t.content)).toContain('after the clock moved back');
    expect((await loadThreadResult(ORIGIN)).turns.length).toBeGreaterThan(0);
  });

  it('leaves a panel on another site alone', async () => {
    await saveThread(ORIGIN, [userTurn('mine', 'kept')]);
    await saveThread('https://other.test', [userTurn('x1', 'other')]);
    const panel = await openPanel();

    await deleteSavedConversation('https://other.test');
    await drain();

    expect(panel.turns.map((t) => t.id)).toEqual(['mine']);
  });
});
