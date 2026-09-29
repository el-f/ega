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
describe('the orphan sweep with no index at all', () => {
  it('reads the index, then leaves the unlisted blob alone instead of reclaiming it', async () => {
    const orphan = threadKey('https://orphan.example');
    await chrome.storage.local.set({
      [orphan]: {
        version: 1,
        origin: 'https://orphan.example',
        updatedAt: 1,
        turns: [userTurn('o')],
      },
    });
    expect((await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY]).toBeUndefined();

    const getSpy = vi.spyOn(chrome.storage.local, 'get');
    const setSpy = vi.spyOn(chrome.storage.local, 'set');
    const removeSpy = vi.spyOn(chrome.storage.local, 'remove');

    await loadThreadResult('https://somewhere.example');
    await until('the sweep to read the index', () =>
      getSpy.mock.calls.some((c) => c[0] === INDEX_KEY),
    );
    // Past the guard it would take the write lock and commit; give it every chance to.
    for (let i = 0; i < 30; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect((await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY]).toBeUndefined();
    expect((await chrome.storage.local.get(orphan))[orphan]).toBeDefined();
  });
});
