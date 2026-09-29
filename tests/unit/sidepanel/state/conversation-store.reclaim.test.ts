import { describe, it, expect } from 'vitest';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

/** The sweep runs after the load without blocking it, so give it its own turns of the event loop. */
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

// The sweep runs once per session, so the first load in this file is the one that reclaims.
describe('orphan reclaim', () => {
  it('re-lists a thread blob the index does not list, and keeps the listed one', async () => {
    await saveThread('https://kept.com', [userTurn('k')]);
    const orphanKey = 'ega:conv:t:https://orphan.com';
    await chrome.storage.local.set({
      [orphanKey]: {
        version: 1,
        origin: 'https://orphan.com',
        updatedAt: 1,
        turns: [userTurn('o')],
      },
    });

    expect((await loadThreadResult('https://kept.com')).turns).toHaveLength(1);
    await drain();

    expect((await loadThreadResult('https://orphan.com')).turns).toHaveLength(1);
    const idx = (await chrome.storage.local.get('ega:conv:index'))['ega:conv:index'] as {
      threads: { origin: string }[];
    };
    expect(idx.threads.map((t) => t.origin).sort()).toEqual([
      'https://kept.com',
      'https://orphan.com',
    ]);
  });
});
