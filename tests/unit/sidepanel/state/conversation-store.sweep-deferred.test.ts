import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadThreadResult } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

function thread(origin: string, updatedAt: number): unknown {
  return { version: 1, origin, updatedAt, turns: [userTurn('t')] };
}

async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (chrome.storage.local as { getKeys?: unknown }).getKeys;
});

// The sweep runs once per module, so this file gets one test.
describe('the orphan sweep is off the first-paint path', () => {
  it('resolves the thread before it sweeps, and never dumps every stored value', async () => {
    const live = 'ega:conv:t:https://live.com';
    const stale = 'ega:conv:t:https://stale.com';
    await chrome.storage.local.set({
      [live]: thread('https://live.com', 5_000),
      [stale]: thread('https://stale.com', 1_000),
      'ega:conv:index': {
        version: 1,
        threads: [{ origin: 'https://live.com', updatedAt: 5_000, bytes: 10 }],
      },
    });
    const getKeys = vi.fn(async () => [live, stale, 'ega:conv:index', 'ega.settings']);
    Object.assign(chrome.storage.local, { getKeys });
    const getSpy = vi.spyOn(chrome.storage.local, 'get');

    const turns = (await loadThreadResult('https://live.com')).turns;
    expect(turns).toHaveLength(1);
    // The load must not have waited on the sweep.
    const idxBefore = (await chrome.storage.local.get('ega:conv:index'))['ega:conv:index'] as {
      threads: { origin: string }[];
    };
    expect(idxBefore.threads).toHaveLength(1);

    await drain();
    const idxAfter = (await chrome.storage.local.get('ega:conv:index'))['ega:conv:index'] as {
      threads: { origin: string }[];
    };
    expect(idxAfter.threads.map((t) => t.origin)).toContain('https://stale.com');
    expect((await chrome.storage.local.get(live))[live]).toBeDefined();

    // `get(null)` copies settings, the audit log and every thread into the page.
    const dumpedEverything = getSpy.mock.calls.some(([keys]) => keys === null);
    expect(dumpedEverything).toBe(false);
    expect(getKeys).toHaveBeenCalled();
  });
});
