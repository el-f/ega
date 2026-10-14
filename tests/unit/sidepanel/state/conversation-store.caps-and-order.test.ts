// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_TURNS_PER_THREAD,
  mergeStoredThread,
  saveThread,
  loadThreadResult,
  threadKey,
} from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

const ORIGIN = 'https://caps-order.example';

function turn(id: string, createdAt: number): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt, content: id };
}

function view(turns: Turn[]): Parameters<typeof mergeStoredThread>[1] {
  return { turns, tombstones: new Map() };
}

const noOpts = {
  inflightId: null,
  knownIds: new Set<string>(),
  deletedAt: new Map<string, number>(),
  revivedAt: new Map<string, number>(),
};

describe('a turn another window wrote lands by createdAt', () => {
  it('goes to the front when it is the oldest', () => {
    const local = [turn('b', 20), turn('c', 30)];

    const { turns } = mergeStoredThread(local, view([turn('a', 10)]), noOpts);

    expect(turns.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('goes into the middle when it belongs there', () => {
    const local = [turn('a', 10), turn('c', 30)];

    const { turns } = mergeStoredThread(local, view([turn('b', 20)]), noOpts);

    expect(turns.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('goes to the end when it is the newest', () => {
    const local = [turn('a', 10), turn('b', 20)];

    const { turns } = mergeStoredThread(local, view([turn('c', 30)]), noOpts);

    expect(turns.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('slots several at once, each to its own place', () => {
    const local = [turn('b', 20), turn('d', 40)];
    const foreign = [turn('e', 50), turn('a', 10), turn('c', 30)];

    const { turns } = mergeStoredThread(local, view(foreign), noOpts);

    expect(turns.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('leaves a local list that is not sorted in the order this window had it', () => {
    // The local half keeps its place; only the foreign turn is positioned.
    const local = [turn('late', 90), turn('early', 10)];

    const { turns } = mergeStoredThread(local, view([turn('mid', 50)]), noOpts);

    expect(turns.map((t) => t.id).slice(0, 2)).toEqual(['late', 'early']);
    expect(turns.map((t) => t.id)).toContain('mid');
  });
});

describe('the per-thread turn cap', () => {
  it('keeps the newest MAX_TURNS_PER_THREAD and drops the oldest', async () => {
    await chrome.storage.local.remove(threadKey(ORIGIN));
    const many = Array.from({ length: MAX_TURNS_PER_THREAD + 25 }, (_, i) =>
      turn(`t${String(i).padStart(4, '0')}`, i + 1),
    );

    const result = await saveThread(ORIGIN, many);
    const stored = (await loadThreadResult(ORIGIN)).turns;

    expect(stored).toHaveLength(MAX_TURNS_PER_THREAD);
    expect(stored.at(-1)?.id).toBe(many.at(-1)?.id);
    expect(stored.map((t) => t.id)).not.toContain('t0000');
    expect(result.droppedTurns).toBe(25);
  });

  it('keeps a thread exactly at the cap whole, and reports nothing dropped', async () => {
    await chrome.storage.local.remove(threadKey(ORIGIN));
    const exact = Array.from({ length: MAX_TURNS_PER_THREAD }, (_, i) =>
      turn(`e${String(i).padStart(4, '0')}`, i + 1),
    );

    const result = await saveThread(ORIGIN, exact);

    expect((await loadThreadResult(ORIGIN)).turns).toHaveLength(MAX_TURNS_PER_THREAD);
    expect(result.droppedTurns).toBeUndefined();
  });
});

describe('the writer stamp on a blob', () => {
  it('is written when the caller identifies itself, and left off when it does not', async () => {
    await chrome.storage.local.remove(threadKey(ORIGIN));
    const read = async (): Promise<Record<string, unknown>> =>
      (await chrome.storage.local.get(threadKey(ORIGIN)))[threadKey(ORIGIN)] as Record<
        string,
        unknown
      >;

    await saveThread(ORIGIN, [turn('a', 1)], { writer: 'panel-1' });
    expect((await read())['writer']).toBe('panel-1');

    await saveThread(ORIGIN, [turn('a', 1)]);
    expect('writer' in (await read())).toBe(false);
  });
});
