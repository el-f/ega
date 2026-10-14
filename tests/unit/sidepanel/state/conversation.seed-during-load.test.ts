// A seed can land during setActiveOrigin's `await loadThreadResult`, which then overwrites state.turns.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

beforeEach(() => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('seed arriving during setActiveOrigin load', () => {
  it('a seed appended mid-load is NOT clobbered by the loaded thread', async () => {
    await saveThread('https://race.com', [userTurn('restored', 'restored text')]);

    const c = createConversation();

    // Key on the thread prefix: the first get() is flush()'s index read, outside the race window.
    const realGet = chrome.storage.local.get.bind(chrome.storage.local);
    let seeded = false;
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(((keys: unknown) => {
      const p = realGet(keys as string);
      const key = Array.isArray(keys) ? keys[0] : (keys as string);
      if (!seeded && typeof key === 'string' && key.startsWith('ega:conv:t:')) {
        seeded = true;
        c.seedExternalImageTurn('req-race', 'https://img.example/pic.png');
      }
      return p;
    }) as typeof chrome.storage.local.get);

    await c.openConversation('https://race.com');

    const contents = c.turns.map((t) => t.content);
    expect(contents).toContain('restored text');
    expect(contents).toContain('[image]');
    // Still inflight, so later chunks route to it.
    const assistant = c.turns.find((t) => t.role === 'assistant' && t.kind === 'image-translate');
    expect(assistant).toBeDefined();
    expect(c.inflightId).toBe(assistant?.id);
  });

  it('does not double-seed the same requestId', async () => {
    await saveThread('https://race2.com', [userTurn('r', 'r')]);
    const c = createConversation();

    const realGet = chrome.storage.local.get.bind(chrome.storage.local);
    let seeded = false;
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(((keys: unknown) => {
      const p = realGet(keys as string);
      const key = Array.isArray(keys) ? keys[0] : (keys as string);
      if (!seeded && typeof key === 'string' && key.startsWith('ega:conv:t:')) {
        seeded = true;
        c.seedExternalImageTurn('req-dup', 'https://img.example/dup.png');
      }
      return p;
    }) as typeof chrome.storage.local.get);

    await c.openConversation('https://race2.com');

    const imageUserTurns = c.turns.filter((t) => t.role === 'user' && t.kind === 'image-translate');
    expect(imageUserTurns).toHaveLength(1);
  });
});
