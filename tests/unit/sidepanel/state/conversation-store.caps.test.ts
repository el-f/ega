import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadThreadResult,
  saveThread,
  MAX_TURNS_PER_THREAD,
  MAX_THREADS,
} from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { userTurn } from '@tests/_helpers/turns';

function assistantTurn(id: string, parent: string): Turn {
  return {
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt: 2,
    content: id,
    attachedToTurnId: parent,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('caps', () => {
  it('trims to the most recent MAX_TURNS_PER_THREAD turns', async () => {
    const turns = Array.from({ length: MAX_TURNS_PER_THREAD + 5 }, (_, i) => userTurn(`t${i}`));
    await saveThread('https://big.com', turns);
    const loaded = (await loadThreadResult('https://big.com')).turns;
    expect(loaded).toHaveLength(MAX_TURNS_PER_THREAD);
    expect(loaded[0]?.id).toBe('t5'); // oldest 5 dropped
    expect(loaded.at(-1)?.id).toBe(`t${MAX_TURNS_PER_THREAD + 4}`);
  });

  it('drops an answer whose question the trim cut away', async () => {
    const turns: Turn[] = [];
    for (let i = 0; i < MAX_TURNS_PER_THREAD / 2; i++) {
      turns.push(userTurn(`u${i}`), assistantTurn(`a${i}`, `u${i}`));
    }
    // One over the cap, so the slice lands between a question and its answer.
    turns.push(userTurn('tail'));
    await saveThread('https://orphan-head.com', turns);
    const loaded = (await loadThreadResult('https://orphan-head.com')).turns;
    expect(loaded[0]?.role).toBe('user');
  });

  it('evicts the least-recently-updated thread past MAX_THREADS', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1_000));
    for (let i = 0; i < MAX_THREADS; i++) {
      await saveThread(`https://s${i}.com`, [userTurn(`s${i}`)]);
    }
    const result = await saveThread('https://overflow.com', [userTurn('overflow')]);
    expect((await loadThreadResult('https://s0.com')).turns).toEqual([]);
    expect((await loadThreadResult('https://overflow.com')).turns).toEqual([userTurn('overflow')]);
    expect((await loadThreadResult('https://s1.com')).turns).toEqual([userTurn('s1')]);
    // The deletion is reported, so the panel can tell the user which site it lost.
    expect(result.evictedOrigin).toBe('https://s0.com');
  });

  it('reports no eviction when a save deletes nothing', async () => {
    const result = await saveThread('https://only.com', [userTurn('only')]);
    expect(result.evictedOrigin).toBeUndefined();
  });

  it('re-saving an existing origin does not evict (refreshes recency)', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1_000));
    for (let i = 0; i < MAX_THREADS; i++) {
      await saveThread(`https://s${i}.com`, [userTurn(`s${i}`)]);
    }
    await saveThread('https://s0.com', [userTurn('s0-fresh')]); // touch oldest
    expect((await loadThreadResult('https://s0.com')).turns).toEqual([userTurn('s0-fresh')]);
    expect((await loadThreadResult('https://s1.com')).turns).toEqual([userTurn('s1')]);
  });
});
