import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

/** Holds the read of `key` open, so a save can land inside the origin-switch window. */
function stallRead(key: string): { release: () => void } {
  let release = (): void => {};
  const gate = new Promise<void>((r) => (release = r));
  const original = chrome.storage.local.get.bind(chrome.storage.local);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(chrome.storage.local, 'get').mockImplementation((async (arg: unknown) => {
    if (arg === key) await gate;
    return await (original as (a: unknown) => Promise<Record<string, unknown>>)(arg);
  }) as typeof chrome.storage.local.get);
  return { release: () => release() };
}

beforeEach(() => {
  (
    chrome.runtime.sendMessage as unknown as { mockResolvedValue: (v: unknown) => void }
  ).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an origin switch never leaks one site thread into another key', () => {
  it('a pagehide flush inside the switch window saves to the origin still on screen', async () => {
    await saveThread('https://a.test', [userTurn('au', 'A-turn')]);
    const c = createConversation();
    await c.openConversation('https://a.test');
    expect(c.turns.map((t) => t.content)).toEqual(['A-turn']);

    const gate = stallRead('ega:conv:t:https://b.test');
    const switching = c.openConversation('https://b.test');
    // The b.test read is the one that stalls, so this waits until the load itself is in flight.
    await vi.waitFor(() =>
      expect(chrome.storage.local.get).toHaveBeenCalledWith('ega:conv:t:https://b.test'),
    );

    const wrote = vi.spyOn(chrome.storage.local, 'set');
    const flushing = c.flush();
    gate.release();
    await Promise.all([flushing, switching]);

    expect((await loadThreadResult('https://b.test')).turns).toEqual([]);
    expect((await loadThreadResult('https://a.test')).turns.map((t) => t.content)).toEqual([
      'A-turn',
    ]);
    expect(c.turns).toEqual([]);
    // The switch already flushed a.test; a second write inside the window would race the load.
    expect(
      wrote.mock.calls.some((call) => 'ega:conv:t:https://a.test' in (call[0] as object)),
    ).toBe(false);
  });
});
