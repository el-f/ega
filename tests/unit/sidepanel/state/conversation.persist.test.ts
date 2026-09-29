import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';

/** Chunks reach a turn only through the live requestId — the routing key production uses. */
function lastRequestId(): string {
  const starts = (chrome.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
  const last = starts[starts.length - 1];
  if (!last) throw new Error('expected at least one translate:start call');
  return last['requestId'] as string;
}

function userTurn(turnId: string, content: string): Turn {
  return { id: turnId, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

const en = asLangIdUnsafe('en');

beforeEach(() => {
  (
    chrome.runtime.sendMessage as unknown as { mockResolvedValue: (v: unknown) => void }
  ).mockResolvedValue({ ok: true });
});

describe('per-origin persistence', () => {
  it('setActiveOrigin loads that origin thread into turns', async () => {
    await saveThread('https://a.com', [userTurn('seed', 'restored')]);
    const c = createConversation();
    await c.setActiveOrigin('https://a.com');
    expect(c.turns.map((t) => t.content)).toEqual(['restored']);
  });

  it('a completed send persists to the active origin (after flush)', async () => {
    const c = createConversation();
    await c.setActiveOrigin('https://b.com');
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 });
    await c.flush();
    const stored = (await loadThreadResult('https://b.com')).turns;
    expect(stored.some((t) => t.content === 'hola')).toBe(true);
  });

  it('switching origin saves the current thread and loads the new one', async () => {
    const c = createConversation();
    await c.setActiveOrigin('https://one.com');
    await c.send({
      content: 'first',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 });
    await c.setActiveOrigin('https://two.com');
    expect(c.turns).toEqual([]);
    await c.setActiveOrigin('https://one.com');
    expect(c.turns.some((t) => t.content === 'first')).toBe(true);
  });

  it('flushes the departing origin to storage on switch', async () => {
    const c = createConversation();
    await c.setActiveOrigin('https://dep.com');
    await c.send({
      content: 'kept',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 });
    await c.setActiveOrigin('https://other.com'); // triggers flush of dep.com
    expect((await loadThreadResult('https://dep.com')).turns).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'kept' })]),
    );
  });

  it('serializes concurrent origin switches — final active origin wins and shows its thread', async () => {
    await saveThread('https://a.com', [userTurn('au', 'A-turn')]);
    await saveThread('https://b.com', [userTurn('bu', 'B-turn')]);
    const c = createConversation();
    await c.setActiveOrigin('https://a.com'); // now on A with A-turn
    // Fire two switches without awaiting the first — simulates follower re-entrancy.
    const p1 = c.setActiveOrigin('https://b.com');
    const p2 = c.setActiveOrigin('https://a.com');
    await Promise.all([p1, p2]);
    // Last switch wins: panel shows A's thread, not B's.
    expect(c.turns.map((t) => t.content)).toEqual(['A-turn']);
  });

  it('a pending debounced save targets the origin active when it was scheduled, not at fire time', async () => {
    const c = createConversation();
    await c.setActiveOrigin('https://sched.com');
    await c.send({
      content: 'sched-turn',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 }); // schedules markDirty for sched.com
    // Switch before the 400ms debounce fires — flush() saves sched.com turns under
    // sched.com (target bound at schedule time) and cancels the pending timer.
    await c.setActiveOrigin('https://other.com');
    // sched-turn must be under sched.com; other.com must stay empty.
    expect(
      (await loadThreadResult('https://sched.com')).turns.some((t) => t.content === 'sched-turn'),
    ).toBe(true);
    expect((await loadThreadResult('https://other.com')).turns).toEqual([]);
  });

  it('clearActiveThread empties memory and storage', async () => {
    const c = createConversation();
    await c.setActiveOrigin('https://clr.com');
    await c.send({
      content: 'bye',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 });
    await c.flush();
    await c.clearActiveThread();
    expect(c.turns).toEqual([]);
    expect((await loadThreadResult('https://clr.com')).turns).toEqual([]);
  });
});
