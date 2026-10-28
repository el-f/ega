import { describe, it, expect, vi } from 'vitest';
import { chromeMock } from '../../mocks/chrome';
import {
  INDEX_KEY,
  clearSavedConversations,
  conversationLabel,
  deleteSavedConversation,
  listSavedConversations,
  threadKey,
} from '@/shared/saved-conversations';
import { clearAllStorage } from '@/shared/storage';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

function userTurn(id: string, content: string, createdAt = 1): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt, content };
}

function convKeys(): string[] {
  return [...chromeMock.storage.local._raw.keys()].filter((k) => k.startsWith('ega:conv:'));
}

describe('listSavedConversations', () => {
  it('lists threads that hold turns, newest first, and leaves out an emptied one', async () => {
    // A fake clock, so the two saves get distinct updatedAt stamps without a real wait.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1_000);
      await saveThread('https://old.test', [userTurn('o1', 'old')]);
      vi.setSystemTime(2_000);
      await saveThread('https://new.test', [userTurn('n1', 'new')]);
      await saveThread('https://emptied.test', []);
    } finally {
      vi.useRealTimers();
    }
    expect((await listSavedConversations()).map((t) => t.origin)).toEqual([
      'https://new.test',
      'https://old.test',
    ]);
  });

  it('reads an index this build cannot parse as no rows', async () => {
    chromeMock.storage.local._raw.set(INDEX_KEY, { version: 99, threads: [] });
    expect(await listSavedConversations()).toEqual([]);
  });
});

describe('deleteSavedConversation', () => {
  it('empties the thread, keeps other sites, and drops it from the list', async () => {
    await saveThread('https://gone.test', [userTurn('g1', 'one'), userTurn('g2', 'two', 2)]);
    await saveThread('https://kept.test', [userTurn('k1', 'kept')]);

    await deleteSavedConversation('https://gone.test');

    expect((await loadThreadResult('https://gone.test')).turns).toEqual([]);
    expect((await loadThreadResult('https://kept.test')).turns.map((t) => t.id)).toEqual(['k1']);
    expect((await listSavedConversations()).map((t) => t.origin)).toEqual(['https://kept.test']);
  });

  it('a window that still holds the turns cannot save them back', async () => {
    const o = 'https://stale.test';
    const turns = [userTurn('s1', 'one'), userTurn('s2', 'two', 2)];
    await saveThread(o, turns, { writer: 'panel-a' });

    await deleteSavedConversation(o);
    // Window A never saw the delete: it saves the view it still holds.
    await saveThread(o, turns, { knownIds: new Set(['s1', 's2']), writer: 'panel-a' });

    expect((await loadThreadResult(o)).turns).toEqual([]);
  });

  it('a new conversation on the same site starts clean', async () => {
    const o = 'https://reused.test';
    await saveThread(o, [userTurn('old', 'gone')]);
    await deleteSavedConversation(o);
    // A turn written after the delete was created after it.
    await saveThread(o, [userTurn('fresh', 'kept', Date.now() + 1)], {
      knownIds: new Set(['fresh']),
    });
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['fresh']);
  });

  it('drops an index row whose thread blob is missing', async () => {
    await saveThread('https://listed.test', [userTurn('l1', 'x')]);
    chromeMock.storage.local._raw.delete(threadKey('https://listed.test'));
    await deleteSavedConversation('https://listed.test');
    const index = chromeMock.storage.local._raw.get(INDEX_KEY) as { threads: unknown[] };
    expect(index.threads).toEqual([]);
  });

  it('leaves an index this build cannot read as it is', async () => {
    const future = { version: 99, threads: [{ origin: 'https://x.test', bytes: 10 }] };
    chromeMock.storage.local._raw.set(INDEX_KEY, future);
    await deleteSavedConversation('https://x.test');
    expect(chromeMock.storage.local._raw.get(INDEX_KEY)).toEqual(future);
  });
});

describe('clearSavedConversations', () => {
  it('removes every thread and the index, and nothing else', async () => {
    await saveThread('https://a.test', [userTurn('a1', 'a')]);
    await saveThread('https://b.test', [userTurn('b1', 'b')]);
    chromeMock.storage.local._raw.set('ega.settings', { keep: true });

    await clearSavedConversations();

    expect(convKeys()).toEqual([]);
    expect(chromeMock.storage.local._raw.get('ega.settings')).toEqual({ keep: true });
  });
});

describe('a save that waits behind a purge', () => {
  const o = 'https://purged.test';
  const stale = [userTurn('p1', 'secret')];
  const staleOpts = { knownIds: new Set(['p1']), writer: 'panel-a' };

  it('Delete all conversations: the snapshot taken before it is not written back', async () => {
    await saveThread(o, stale, staleOpts);

    // The panel snapshotted before the purge and waits for the lock it holds.
    await Promise.all([clearSavedConversations(), saveThread(o, stale, staleOpts)]);

    expect(convKeys()).toEqual([]);
    // A turn the panel sends after its reset is written.
    await saveThread(o, [userTurn('n1', 'new', Date.now() + 1)], { knownIds: new Set(['n1']) });
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['n1']);
  });

  it('Delete all data: the snapshot taken before it is not written back', async () => {
    await saveThread(o, stale, staleOpts);
    const realClear = chrome.storage.local.clear.bind(chrome.storage.local);
    let waiting: Promise<unknown> = Promise.resolve();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const spy = vi.spyOn(chrome.storage.local, 'clear').mockImplementation(async () => {
      // The wipe holds every lock, so this save queues behind it.
      waiting = saveThread(o, stale, staleOpts);
      await realClear();
    });
    try {
      await clearAllStorage();
      await waiting;
    } finally {
      spy.mockRestore();
    }

    expect([...chromeMock.storage.local._raw.keys()]).toEqual([]);
  });
});

describe('conversationLabel', () => {
  it('names the shared bucket and drops only the https scheme', () => {
    expect(conversationLabel('general')).toBe('Other pages');
    expect(conversationLabel('https://example.com')).toBe('example.com');
    expect(conversationLabel('http://example.com')).toBe('http://example.com');
  });
});
