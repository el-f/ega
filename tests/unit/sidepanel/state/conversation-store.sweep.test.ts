import { describe, it, expect } from 'vitest';
import { loadThreadResult } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

function thread(origin: string, version: number, updatedAt: number): unknown {
  return { version, origin, updatedAt, turns: [userTurn('t')] };
}

/** The sweep runs after the load without blocking it, so give it its own turns of the event loop. */
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

// The sweep runs once per module, so this is the only test here that can observe it.
describe('the orphan sweep', () => {
  it('re-lists an unlisted thread and drops only what is not one', async () => {
    const live = 'ega:conv:t:https://live.com';
    // Older than the listed thread, and still real turns: a save whose index write was rejected.
    const rescued = 'ega:conv:t:https://rescued.com';
    const unreadable = 'ega:conv:t:https://unreadable.com';
    const junk = 'ega:conv:t:https://junk.com';
    await chrome.storage.local.set({
      [live]: thread('https://live.com', 1, 5_000),
      [rescued]: thread('https://rescued.com', 1, 1_000),
      [unreadable]: thread('https://unreadable.com', 99, 1_000),
      [junk]: 'not a thread',
      'ega:conv:index': {
        version: 1,
        threads: [{ origin: 'https://live.com', updatedAt: 5_000, bytes: 10 }],
      },
    });

    await loadThreadResult('https://live.com');
    await drain();

    const after = await chrome.storage.local.get(null);
    expect(after[live]).toBeDefined();
    expect(after[rescued]).toBeDefined();
    expect(after[unreadable]).toBeDefined();
    expect(after[junk]).toBeUndefined();

    const origins = (after['ega:conv:index'] as { threads: { origin: string }[] }).threads.map(
      (t) => t.origin,
    );
    expect(origins).toContain('https://rescued.com');
    expect((await loadThreadResult('https://rescued.com')).turns).toHaveLength(1);
  });
});
