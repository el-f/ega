import { describe, it, expect, beforeEach } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

function userTurn(turnId: string, content: string, createdAt = 1): Turn {
  return { id: turnId, role: 'user', kind: 'translate', status: 'idle', createdAt, content };
}

beforeEach(() => {
  (
    chrome.runtime.sendMessage as unknown as { mockResolvedValue: (v: unknown) => void }
  ).mockResolvedValue({ ok: true });
});

describe('New conversation records tombstones', () => {
  it("a second window's next save cannot bring the cleared thread back", async () => {
    const o = 'https://cleared.com';
    const seeded = [userTurn('t1', 'one', 10), userTurn('t2', 'two', 20)];
    await saveThread(o, seeded);

    const a = createConversation();
    await a.setActiveOrigin(o);
    expect(a.turns).toHaveLength(2);
    await a.clearActiveThread();

    // Window B never saw the clear: it saves the view it still holds in memory.
    await saveThread(o, seeded, { knownIds: new Set(['t1', 't2']) });

    expect((await loadThreadResult(o)).turns).toEqual([]);
  });

  it('the next thread on the same origin is not filtered by the old tombstones', async () => {
    const o = 'https://cleared-then-reused.com';
    await saveThread(o, [userTurn('old', 'gone')]);

    const a = createConversation();
    await a.setActiveOrigin(o);
    await a.clearActiveThread();

    await saveThread(o, [userTurn('fresh', 'kept', 30)], { knownIds: new Set(['fresh']) });

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['fresh']);
  });
});

describe('undo after the thread moved', () => {
  it('does not restore a deleted turn into another site thread', async () => {
    const from = 'https://from.com';
    const to = 'https://to.com';
    await saveThread(from, [userTurn('d1', 'delete me', 10)]);
    await saveThread(to, [userTurn('k1', 'other site', 20)]);

    const c = createConversation();
    await c.setActiveOrigin(from);
    const slice = c.deleteTurn('d1');
    expect(slice).not.toBeNull();

    await c.setActiveOrigin(to);
    if (slice) c.restoreTurns(slice);
    await c.flush();

    expect(c.turns.map((t) => t.id)).toEqual(['k1']);
    expect((await loadThreadResult(to)).turns.map((t) => t.id)).toEqual(['k1']);
  });
});
