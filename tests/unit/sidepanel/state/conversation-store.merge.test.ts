import { describe, it, expect } from 'vitest';
import {
  loadThreadResult,
  mergeStoredThread,
  parseThreadChange,
  saveThread,
  type StoredThreadView,
} from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

function turn(id: string, createdAt: number): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt, content: id };
}

/** Reads the raw blob, so a test can assert what the tombstone list actually holds. */
async function readTombstones(
  origin: string,
): Promise<Array<{ id: string; at: number; ats?: number[] }>> {
  const key = `ega:conv:t:${origin}`;
  const blob = (await chrome.storage.local.get(key))[key] as
    { tombstones?: Array<{ id: string; at: number; ats?: number[] }> } | undefined;
  return blob?.tombstones ?? [];
}

/** Simulates the other Chrome window: writes straight to the blob this panel never re-read. */
async function foreignAppend(origin: string, extra: Turn): Promise<void> {
  const key = `ega:conv:t:${origin}`;
  const stored = (await chrome.storage.local.get(key))[key] as {
    version: number;
    origin: string;
    turns: Turn[];
    updatedAt: number;
  };
  await chrome.storage.local.set({ [key]: { ...stored, turns: [...stored.turns, extra] } });
}

describe('mergeTurnsById through saveThread', () => {
  it('keeps a turn another window wrote, ordered back in by createdAt', async () => {
    const o = 'https://merge-keep.com';
    await saveThread(o, [turn('t1', 10)]);
    await foreignAppend(o, turn('t2', 20));

    // This panel never loaded t2, so it is foreign and must survive our save.
    await saveThread(o, [turn('t1', 10), turn('t3', 30)], {
      knownIds: new Set(['t1', 't3']),
    });

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('a loaded-then-deleted turn stays deleted', async () => {
    const o = 'https://merge-delete.com';
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);

    await saveThread(o, [turn('t1', 10)], { knownIds: new Set(['t1', 't2']) });

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);
  });

  it('omitting knownIds writes the list as the whole thread', async () => {
    const o = 'https://merge-whole.com';
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);
    await saveThread(o, [turn('t1', 10)]);
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('per-thread tombstones', () => {
  it("a delete in one window survives the other window's next save", async () => {
    const o = 'https://tomb.com';
    const both = new Set(['t1', 't2']);
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);

    // Window A deletes t2.
    await saveThread(o, [turn('t1', 10)], { knownIds: both, deletedAt: new Map([['t2', 1]]) });
    // Window B still holds t2 in memory and saves its unchanged view.
    await saveThread(o, [turn('t1', 10), turn('t2', 20)], { knownIds: both });

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);
  });

  it('a tombstoned turn is not re-added as a foreign turn either', async () => {
    const o = 'https://tomb-foreign.com';
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);
    await saveThread(o, [turn('t1', 10)], {
      knownIds: new Set(['t1', 't2']),
      deletedAt: new Map([['t2', 1]]),
    });
    await foreignAppend(o, turn('t2', 20));

    await saveThread(o, [turn('t1', 10)], { knownIds: new Set(['t1']) });

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);
  });

  it('two windows deleting the same turn need two undos to bring it back', async () => {
    const o = 'https://tomb-two-deletes.com';
    const both = new Set(['t1', 't2']);
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);

    // A deletes t2 at 900, then B deletes it at 1000 without having seen A's write.
    await saveThread(o, [turn('t1', 10)], { knownIds: both, deletedAt: new Map([['t2', 900]]) });
    await saveThread(o, [turn('t1', 10)], { knownIds: both, deletedAt: new Map([['t2', 1000]]) });

    // B's undo answers B's delete; A's still stands, so the turn stays buried.
    await saveThread(o, [turn('t1', 10), turn('t2', 20)], {
      knownIds: both,
      revivedAt: new Map([['t2', 1000]]),
    });
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);

    // With A's delete undone too, nothing is left to keep it buried.
    await saveThread(o, [turn('t1', 10), turn('t2', 20)], {
      knownIds: both,
      revivedAt: new Map([['t2', 900]]),
    });
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('an undo of the older delete cannot answer the newer one', async () => {
    const o = 'https://tomb-older-undo.com';
    const both = new Set(['t1', 't2']);
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);

    // B buries t2 at 1000; A buries it at 1200 before reading B's write.
    await saveThread(o, [turn('t1', 10)], { knownIds: both, deletedAt: new Map([['t2', 1000]]) });
    await saveThread(o, [turn('t1', 10)], { knownIds: both, deletedAt: new Map([['t2', 1200]]) });

    await saveThread(o, [turn('t1', 10), turn('t2', 20)], {
      knownIds: both,
      revivedAt: new Map([['t2', 1000]]),
    });
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);
  });

  it('saving again with the same standing delete does not grow the tombstone', async () => {
    const o = 'https://tomb-repeat-save.com';
    const both = new Set(['t1', 't2']);
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);

    // `deletedAt` lives as long as the thread does, so every later save hands back the same stamp.
    for (let i = 0; i < 5; i++) {
      await saveThread(o, [turn('t1', 10)], { knownIds: both, deletedAt: new Map([['t2', 900]]) });
    }

    const tomb = (await readTombstones(o)).find((t) => t.id === 't2');
    expect(tomb?.ats ?? [tomb?.at]).toEqual([900]);

    await saveThread(o, [turn('t1', 10), turn('t2', 20)], {
      knownIds: both,
      revivedAt: new Map([['t2', 900]]),
    });
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('keeps only the newest delete stamps when many windows bury one turn', async () => {
    const o = 'https://tomb-many-windows.com';
    const both = new Set(['t1', 't2']);
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);

    for (let i = 1; i <= 12; i++) {
      await saveThread(o, [turn('t1', 10)], {
        knownIds: both,
        deletedAt: new Map([['t2', 1000 + i]]),
      });
    }

    const tomb = (await readTombstones(o)).find((t) => t.id === 't2');
    expect(tomb?.ats?.length).toBe(8);
    expect(tomb?.at).toBe(1012);
    expect(tomb?.ats?.[0]).toBe(1005);
  });

  it('a revive clears only the tombstone its own delete wrote', async () => {
    const o = 'https://tomb-revive-own.com';
    const both = new Set(['t1', 't2']);
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);

    // Another window buried t2 at 800; this window's own delete of it was later, at 1000.
    await saveThread(o, [turn('t1', 10)], { knownIds: both, deletedAt: new Map([['t2', 800]]) });
    await saveThread(o, [turn('t1', 10), turn('t2', 20)], {
      knownIds: both,
      revivedAt: new Map([['t2', 1000]]),
    });

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);
  });

  it('does not tombstone a turn nobody deleted', async () => {
    const o = 'https://tomb-none.com';
    await saveThread(o, [turn('t1', 10), turn('t2', 20)], {
      knownIds: new Set(['t1', 't2']),
      deletedAt: new Map(),
    });
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

function assistant(id: string, createdAt: number, over: Partial<Turn> = {}): Turn {
  return {
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt,
    content: 'the finished answer',
    attachedToTurnId: 'u1',
    ...over,
  };
}

describe('mergeTurnsById — a stale copy never overwrites a finished answer', () => {
  it('keeps the stored done turn over an interrupted copy', async () => {
    const o = 'https://two-windows.com';
    await saveThread(o, [assistant('a1', 10)]);

    // The other window loaded this turn mid-stream, so its copy is stamped interrupted.
    await saveThread(
      o,
      [
        assistant('a1', 10, {
          status: 'error',
          content: 'the fin',
          error: { code: 'interrupted', message: 'Interrupted' },
        }),
      ],
      { knownIds: new Set(['a1']) },
    );

    const loaded = (await loadThreadResult(o)).turns;
    expect(loaded[0]?.status).toBe('done');
    expect(loaded[0]?.content).toBe('the finished answer');
  });

  it('still lets a real failure overwrite a stored done turn', async () => {
    const o = 'https://real-failure.com';
    await saveThread(o, [assistant('a1', 10)]);

    await saveThread(
      o,
      [
        assistant('a1', 10, {
          status: 'error',
          error: { code: 'NETWORK', message: 'fetch failed' },
        }),
      ],
      { knownIds: new Set(['a1']) },
    );

    expect((await loadThreadResult(o)).turns[0]?.status).toBe('error');
  });

  it('writes an interrupted turn that storage has never seen', async () => {
    const o = 'https://fresh-interrupt.com';
    await saveThread(o, [
      assistant('a9', 10, {
        status: 'error',
        error: { code: 'interrupted', message: 'Interrupted' },
      }),
    ]);
    expect((await loadThreadResult(o)).turns[0]?.status).toBe('error');
  });

  it('keeps a stored settled failure over a pending copy another window still holds', async () => {
    const o = 'https://settled-error.com';
    const failed = {
      status: 'error' as const,
      error: { code: 'NETWORK', message: 'fetch failed' },
    };
    await saveThread(o, [assistant('a1', 10, failed)]);
    await saveThread(o, [assistant('a1', 10, { status: 'pending', content: '' })], {
      knownIds: new Set(['a1']),
    });
    expect((await loadThreadResult(o)).turns[0]?.error?.code).toBe('NETWORK');
  });

  it('keeps the stored done turn over a pending copy a save raced in with', async () => {
    const o = 'https://pending-race.com';
    await saveThread(o, [assistant('a1', 10)]);
    await saveThread(o, [assistant('a1', 10, { status: 'pending', content: '' })], {
      knownIds: new Set(['a1']),
    });
    expect((await loadThreadResult(o)).turns[0]?.content).toBe('the finished answer');
  });
});

describe('mergeStoredThread — another window wrote the thread this window is showing', () => {
  const none = new Set<string>();
  const opts = {
    inflightId: null,
    knownIds: none,
    deletedAt: new Map<string, number>(),
    revivedAt: new Map<string, number>(),
  };
  const view = (
    turns: Turn[],
    buried: Array<[string, number]> = [],
    extra: Record<string, number[]> = {},
  ): StoredThreadView => ({
    turns,
    tombstones: new Map(buried.map(([id, at]) => [id, { at, ats: [at, ...(extra[id] ?? [])] }])),
  });

  it('a stored done copy replaces a local interrupted one', () => {
    const local = [
      assistant('a1', 10, { status: 'error', error: { code: 'interrupted', message: 'x' } }),
    ];
    expect(mergeStoredThread(local, view([assistant('a1', 10)]), opts).turns[0]?.status).toBe(
      'done',
    );
  });

  it('the turn this window streams into is never replaced', () => {
    const local = [assistant('a1', 10, { status: 'streaming', content: 'half' })];
    const out = mergeStoredThread(local, view([assistant('a1', 10)]), {
      ...opts,
      inflightId: 'a1',
    });
    expect(out.turns[0]?.content).toBe('half');
  });

  it('a pending copy this window does not own takes the finished answer', () => {
    const local = [assistant('a1', 10, { status: 'pending', content: '' })];
    const out = mergeStoredThread(local, view([assistant('a1', 10)]), opts);
    expect(out.turns[0]?.status).toBe('done');
    expect(out.turns[0]?.content).toBe('the finished answer');
  });

  it('a stored unfinished copy never replaces a settled local one', () => {
    const local = [assistant('a1', 10)];
    for (const stale of [
      assistant('a1', 10, { status: 'error', error: { code: 'interrupted', message: 'x' } }),
      assistant('a1', 10, { status: 'pending', content: '' }),
      assistant('a1', 10, { status: 'streaming', content: 'half' }),
    ]) {
      expect(mergeStoredThread(local, view([stale]), opts).turns[0]?.status).toBe('done');
    }
    const failed = [
      assistant('a1', 10, { status: 'error', error: { code: 'NETWORK', message: 'x' } }),
    ];
    expect(
      mergeStoredThread(failed, view([assistant('a1', 10, { status: 'pending' })]), opts).turns[0]
        ?.status,
    ).toBe('error');
  });

  it('a tombstone drops the local copy unless this window revived it, and reports what it buried', () => {
    const local = [turn('t1', 10), turn('t2', 20)];
    const out = mergeStoredThread(local, view([turn('t1', 10)], [['t2', 100]]), opts);
    expect(out.turns.map((t) => t.id)).toEqual(['t1']);
    expect(out.buriedIds).toEqual(['t2']);
    // The revive stamp is the delete it answered, so it matches that burial exactly.
    const revived = mergeStoredThread(local, view([turn('t1', 10)], [['t2', 100]]), {
      ...opts,
      revivedAt: new Map([['t2', 100]]),
    });
    expect(revived.turns.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(revived.buriedIds).toEqual([]);
    // Any other burial stands, whether its stamp is older or newer than the one undone here.
    for (const at of [50, 300]) {
      const reburied = mergeStoredThread(local, view([turn('t1', 10)], [['t2', at]]), {
        ...opts,
        revivedAt: new Map([['t2', 100]]),
      });
      expect(reburied.turns.map((t) => t.id)).toEqual(['t1']);
      expect(reburied.buriedIds).toEqual(['t2']);
    }
  });

  it('a turn another window also buried stays buried after this window undoes its own delete', () => {
    const local = [turn('t1', 10), turn('t2', 20)];
    // Two deletes on file; this window's Undo answers only its own stamp.
    const out = mergeStoredThread(local, view([turn('t1', 10)], [['t2', 300]], { t2: [100] }), {
      ...opts,
      revivedAt: new Map([['t2', 300]]),
    });
    expect(out.turns.map((t) => t.id)).toEqual(['t1']);
    expect(out.buriedIds).toEqual(['t2']);

    // With the other delete undone too, nothing is left to bury it.
    const free = mergeStoredThread(local, view([turn('t1', 10)], [['t2', 300]]), {
      ...opts,
      revivedAt: new Map([['t2', 300]]),
    });
    expect(free.turns.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('a tombstone with a malformed stamp list still buries its turn', async () => {
    const o = 'https://tomb-bad-ats.com';
    const key = `ega:conv:t:${o}`;
    await saveThread(o, [turn('t1', 10), turn('t2', 20)]);
    const blob = (await chrome.storage.local.get(key))[key] as Record<string, unknown>;
    // A partial write or an older writer can leave any of these behind.
    for (const ats of [[], ['900'], 'nope', Array.from({ length: 40 }, (_, i) => i)]) {
      await chrome.storage.local.set({
        [key]: { ...blob, turns: [turn('t1', 10)], tombstones: [{ id: 't2', at: 900, ats }] },
      });
      await saveThread(o, [turn('t1', 10), turn('t2', 20)], { knownIds: new Set(['t1', 't2']) });
      expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);
    }
  });

  it('a foreign turn slots in by createdAt; one this window knew or deleted does not come back', () => {
    const local = [turn('t1', 10), turn('t3', 30)];
    const stored = [turn('t1', 10), turn('t2', 20), turn('t3', 30), turn('t4', 40)];
    const out = mergeStoredThread(local, view(stored), {
      ...opts,
      knownIds: new Set(['t1', 't3', 't4']),
      deletedAt: new Map([['t2', 1]]),
    });
    expect(out.turns.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(mergeStoredThread(local, view(stored), opts).turns.map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
      't4',
    ]);
  });

  it('a turn only this window holds stays', () => {
    const local = [turn('t1', 10), turn('mine', 50)];
    expect(mergeStoredThread(local, view([turn('t1', 10)]), opts).turns.map((t) => t.id)).toEqual([
      't1',
      'mine',
    ]);
  });
});

describe('parseThreadChange — the payload another window wrote', () => {
  it("returns null for this panel's own write, a removed key, and a foreign version", () => {
    const blob = { version: 1, origin: 'o', turns: [], updatedAt: 1, writer: 'me' };
    expect(parseThreadChange(blob, 'me')).toBeNull();
    expect(parseThreadChange(undefined, 'me')).toBeNull();
    expect(parseThreadChange({ ...blob, version: 999, writer: 'other' }, 'me')).toBeNull();
  });

  it('validates the turns and lifts the tombstone ids', () => {
    const blob = {
      version: 1,
      origin: 'o',
      turns: [turn('t1', 10), { id: 'bad' }],
      updatedAt: 1,
      tombstones: [{ id: 'gone', at: 5 }],
      writer: 'other',
    };
    const view = parseThreadChange(blob, 'me');
    expect(view?.turns.map((t) => t.id)).toEqual(['t1']);
    expect([...(view?.tombstones ?? [])]).toEqual([['gone', { at: 5, ats: [5] }]]);
  });
});
