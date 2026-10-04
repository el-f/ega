import { describe, it, expect, vi, afterEach } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';

import type * as StoredChanges from '@/shared/stored-changes';

type Module = typeof StoredChanges;

// The worker switch is module state, so each test takes a fresh copy.
async function load(): Promise<Module> {
  vi.resetModules();
  return await import('@/shared/stored-changes');
}

function emitFromWorker(msg: unknown, sender: object = { id: chromeMock.runtime.id }): void {
  (
    chrome.runtime.onMessage as unknown as {
      emit: (m: unknown, s: object, r: (x: unknown) => void) => void;
    }
  ).emit(msg, sender, () => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('onStoredChange', () => {
  it('listens to storage.local by default', async () => {
    const { onStoredChange } = await load();
    const seen = vi.fn();
    const off = onStoredChange(seen);
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: { theme: 'dark' } });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it('in a content script, never listens to storage.local and takes the worker message instead', async () => {
    const { onStoredChange, takeStoredChangesFromWorker } = await load();
    const added = vi.spyOn(chrome.storage.local.onChanged, 'addListener');
    takeStoredChangesFromWorker();
    const seen = vi.fn();
    const off = onStoredChange(seen);

    expect(added).not.toHaveBeenCalled();
    await chrome.storage.local.set({ 'ega:conv:t:https://a.test': { turns: [] } });
    expect(seen).not.toHaveBeenCalled();

    emitFromWorker({ kind: 'content:storage-changed', keys: [STORAGE_KEYS.customLanguages] });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(Object.keys(seen.mock.calls[0]?.[0] as object)).toEqual([STORAGE_KEYS.customLanguages]);

    off();
    emitFromWorker({ kind: 'content:storage-changed', keys: [STORAGE_KEYS.settings] });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('ignores the message from anything but its own worker', async () => {
    const { onStoredChange, takeStoredChangesFromWorker } = await load();
    takeStoredChangesFromWorker();
    const seen = vi.fn();
    const off = onStoredChange(seen);
    emitFromWorker(
      { kind: 'content:storage-changed', keys: [STORAGE_KEYS.settings] },
      { id: chromeMock.runtime.id, tab: { id: 3 } },
    );
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});
