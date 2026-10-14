import { describe, it, expect } from 'vitest';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

function unreadableThread(origin: string): unknown {
  return { version: 99, origin, updatedAt: 1, turns: [userTurn('kept')] };
}

describe('a store version this build cannot read', () => {
  // The orphan sweep runs once per module, so this first load is the one that could delete.
  it('reads as empty for the session and leaves every blob in place', async () => {
    const keyA = 'ega:conv:t:https://vera.com';
    const keyB = 'ega:conv:t:https://verb.com';
    await chrome.storage.local.set({
      [keyA]: unreadableThread('https://vera.com'),
      [keyB]: unreadableThread('https://verb.com'),
      'ega:conv:index': { version: 99, threads: [{ origin: 'https://vera.com', updatedAt: 1 }] },
    });

    expect((await loadThreadResult('https://vera.com')).turns).toEqual([]);

    const after = await chrome.storage.local.get(null);
    expect(
      Object.keys(after)
        .filter((k) => k.startsWith('ega:conv:t:'))
        .sort(),
    ).toEqual([keyA, keyB]);
  });

  it('a save overwrites the unreadable blob rather than merging into it', async () => {
    const o = 'https://ver-save.com';
    await chrome.storage.local.set({ [`ega:conv:t:${o}`]: unreadableThread(o) });
    await saveThread(o, [userTurn('fresh')], { knownIds: new Set(['fresh']) });
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['fresh']);
  });
});
