import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

afterEach(() => vi.restoreAllMocks());

describe('a save serializes each turn once', () => {
  it('does not re-stringify every turn for the turn cap, the thread cap and the index', async () => {
    const turns = Array.from({ length: 10 }, (_, i) => userTurn(`t${i}`, `body ${i}`));
    const spy = vi.spyOn(JSON, 'stringify');

    await saveThread('https://once.com', turns);

    // One pass over the turns, plus slack for anything the store stringifies whole.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(turns.length + 2);
  });

  it('still records the exact serialized size in the index', async () => {
    const turns = Array.from({ length: 4 }, (_, i) => userTurn(`t${i}`, `body ${i}`));
    await saveThread('https://exact.com', turns);

    const index = (await chrome.storage.local.get('ega:conv:index'))['ega:conv:index'] as {
      threads: { origin: string; bytes: number }[];
    };
    const entry = index.threads.find((t) => t.origin === 'https://exact.com');
    const stored = (await loadThreadResult('https://exact.com')).turns;
    expect(entry?.bytes).toBe(JSON.stringify(stored).length);
  });
});
