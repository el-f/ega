// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { INDEX_KEY, loadThreadResult, threadKey } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

/** Fails rather than returning early: a sweep that never ran would make the whole test vacuous. */
async function until(what: string, ready: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (ready()) return;
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`timed out waiting for ${what}`);
}

// The sweep is module-once, so one file gets one shot at observing it.
describe('the orphan sweep against an index this build cannot read', () => {
  it('reads it, then touches nothing — it says nothing about which blobs are live', async () => {
    const orphan = threadKey('https://orphan.example');
    const futureIndex = { version: 99, threads: [{ origin: 'https://a.example', bytes: 1 }] };
    await chrome.storage.local.set({
      [INDEX_KEY]: futureIndex,
      [orphan]: {
        version: 1,
        origin: 'https://orphan.example',
        updatedAt: 1,
        turns: [userTurn('o')],
      },
      'ega:conv:t:junk': 'not a thread at all',
    });

    const getSpy = vi.spyOn(chrome.storage.local, 'get');
    const setSpy = vi.spyOn(chrome.storage.local, 'set');
    const removeSpy = vi.spyOn(chrome.storage.local, 'remove');

    await loadThreadResult('https://somewhere.example');
    await until('the sweep to read the index', () =>
      getSpy.mock.calls.some((c) => c[0] === INDEX_KEY),
    );
    for (let i = 0; i < 30; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect((await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY]).toEqual(futureIndex);
    expect((await chrome.storage.local.get(orphan))[orphan]).toBeDefined();
    // Even the value that is not a thread survives: the sweep never decided anything.
    expect((await chrome.storage.local.get('ega:conv:t:junk'))['ega:conv:t:junk']).toBe(
      'not a thread at all',
    );
  });
});
