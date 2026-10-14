import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

afterEach(() => vi.restoreAllMocks());

/** The index write runs first, so call #1 is the one to reject. */
function rejectNthSet(n: number): void {
  let calls = 0;
  const real = chrome.storage.local.set.bind(chrome.storage.local);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
    calls++;
    if (calls === n) return Promise.reject(new Error('QUOTA_BYTES exceeded'));
    return real(items as Record<string, unknown>);
  });
}

describe('an index write that fails', () => {
  it('still writes the blob, reports the failure, and survives the orphan sweep', async () => {
    // Seeds an index entry older than the blob below, which is what makes the sweep a real test.
    await saveThread('https://idx-seed.com', [userTurn('seed')]);

    rejectNthSet(1);
    await expect(saveThread('https://idx-fail.com', [userTurn('t1')])).rejects.toThrow(/quota/i);
    vi.restoreAllMocks();

    // First load of this module, so the sweep runs here against an index that never listed the blob.
    expect((await loadThreadResult('https://idx-fail.com')).turns.map((t) => t.id)).toEqual(['t1']);
  });
});
