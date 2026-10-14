import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadThreadResult,
  saveThread,
  MAX_TURNS_PER_THREAD,
} from '@/sidepanel/state/conversation-store';
import type { UserTurnData } from '@/sidepanel/state/conversation';

function turn(id: string, createdAt: number, extra: Partial<UserTurnData> = {}): UserTurnData {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt, content: id, ...extra };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tombstones outlive a clear of a full thread', () => {
  it("clearing MAX_TURNS_PER_THREAD turns leaves nothing for the other window's save to write back", async () => {
    const o = 'https://full-clear.com';
    const full = Array.from({ length: MAX_TURNS_PER_THREAD }, (_, i) => turn(`t${i}`, i + 1));
    const ids = new Set(full.map((t) => t.id));
    await saveThread(o, full);

    // Window A: New conversation — every id becomes a tombstone.
    await saveThread(o, [], { knownIds: ids, deletedAt: new Map([...ids].map((id) => [id, 1])) });
    // Window B never saw the clear and saves the view it still holds.
    await saveThread(o, full, { knownIds: ids });

    expect((await loadThreadResult(o)).turns).toEqual([]);
  });
});

describe('mergeTurnsById keeps the caller order', () => {
  it("slots a foreign turn in by createdAt without re-sorting this window's turns", async () => {
    const o = 'https://merge-order.com';
    await saveThread(o, [turn('t1', 10), turn('t2', 20), turn('t3', 30)]);
    // An Undo put t1 back after t3; t2 was written by another window and is foreign here.
    await saveThread(o, [turn('t3', 30), turn('t1', 10)], { knownIds: new Set(['t1', 't3']) });

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t3', 't1', 't2']);
  });
});

describe('saveThread reports when it shed images to fit', () => {
  it('resolves shedImages when only the lean write fit', async () => {
    const o = 'https://shed.com';
    const img = 'data:image/png;base64,' + 'A'.repeat(1024);
    let blobWrites = 0;
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      const keys = Object.keys(items as Record<string, unknown>);
      if (keys.some((k) => k.startsWith('ega:conv:t:'))) {
        blobWrites++;
        // The first blob write is the full thread; the second is the lean retry.
        if (blobWrites === 1) return Promise.reject(new Error('QUOTA_BYTES exceeded'));
      }
      return originalSet(items as Record<string, unknown>);
    });

    await expect(
      saveThread(o, [turn('u1', 1, { kind: 'image-translate', imageDataUrl: img })]),
    ).resolves.toEqual({ shedImages: true });
    expect((await loadThreadResult(o)).turns[0]?.imageDataUrl).toBeUndefined();
  });

  it('a write that fit as-is carries no shedImages', async () => {
    await expect(saveThread('https://fit.com', [turn('u1', 1)])).resolves.toEqual({});
  });
});
