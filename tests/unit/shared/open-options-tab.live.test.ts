// openOptionsPage only focuses a page that is already open, so the parked tab is picked up live.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { onPendingOptionsTab } from '@/shared/open-options-tab';
import { chromeMock } from '@tests/mocks/chrome';
import { flushAsync } from '@tests/_helpers/async';

const KEY = 'ega.pendingOptionsTab';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('onPendingOptionsTab', () => {
  it('fires with the parked tab and consumes the key', async () => {
    const seen: string[] = [];
    const off = onPendingOptionsTab((tab) => seen.push(tab));
    // The mock fires onChanged from set(), the way Chrome does.
    await chrome.storage.local.set({ [KEY]: 'backends' });
    await vi.waitFor(() => expect(seen).toEqual(['backends']));
    expect((await chrome.storage.local.get(KEY))[KEY]).toBeUndefined();

    off();
    await chrome.storage.local.set({ [KEY]: 'display' });
    await flushAsync();
    expect(seen).toEqual(['backends']);
    // A live listener consumes the key, so the key still being there proves none ran.
    expect((await chrome.storage.local.get(KEY))[KEY]).toBe('display');
  });

  it('ignores other keys and other areas', async () => {
    const seen: string[] = [];
    const off = onPendingOptionsTab((tab) => seen.push(tab));
    await chrome.storage.local.set({ other: 1 });
    chromeMock.storage.sync._fire({ [KEY]: { newValue: 'x' } });
    await flushAsync();
    expect(seen).toEqual([]);
    // The same listener does answer the right key in the right area.
    await chrome.storage.local.set({ [KEY]: 'backends' });
    await vi.waitFor(() => expect(seen).toEqual(['backends']));
    off();
  });
});
