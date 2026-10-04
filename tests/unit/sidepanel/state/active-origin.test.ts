import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { getActiveOrigin, startOriginFollower } from '@/sidepanel/state/active-origin';
import { GENERAL_ORIGIN } from '@/sidepanel/state/conversation-store';

beforeEach(() => {
  (chrome.tabs.query as Mock).mockReset();
  (chrome.windows.getCurrent as Mock).mockReset();
  (chrome.windows.getCurrent as Mock).mockResolvedValue({ id: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getActiveOrigin', () => {
  it('derives the active tab url origin', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7, url: 'https://nytimes.com/a' }]);
    expect(await getActiveOrigin()).toBe('https://nytimes.com');
  });
  it('falls back to general when no active tab / no url', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([]);
    expect(await getActiveOrigin()).toBe(GENERAL_ORIGIN);
  });
  it('falls back to general when query rejects', async () => {
    (chrome.tabs.query as Mock).mockRejectedValue(new Error('no perm'));
    expect(await getActiveOrigin()).toBe(GENERAL_ORIGIN);
  });
});

describe('startOriginFollower', () => {
  it('emits the new origin on tab activation (debounced)', async () => {
    vi.useFakeTimers();
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 2, url: 'https://b.com/y' }]);
    const seen: string[] = [];
    const stop = startOriginFollower((o) => seen.push(o));
    (chrome.tabs.onActivated as unknown as { emit: (i: chrome.tabs.OnActivatedInfo) => void }).emit(
      { tabId: 2, windowId: 1 },
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(seen).toContain('https://b.com');
    stop();
    vi.useRealTimers();
  });

  it('emits on url change for the active tab via onUpdated', async () => {
    vi.useFakeTimers();
    // Mock returns the new url — by debounce fire time the tab has navigated.
    (chrome.tabs.query as Mock).mockResolvedValue([
      { id: 5, active: true, url: 'https://new.com/p' },
    ]);
    const seen: string[] = [];
    const stop = startOriginFollower((o) => seen.push(o));
    (
      chrome.tabs.onUpdated as unknown as {
        emit: (id: number, ci: chrome.tabs.OnUpdatedInfo, t: chrome.tabs.Tab) => void;
      }
    ).emit(
      5,
      { url: 'https://new.com/p' } as chrome.tabs.OnUpdatedInfo,
      { id: 5, active: true } as chrome.tabs.Tab,
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(seen).toContain('https://new.com');
    stop();
    vi.useRealTimers();
  });

  it('stop() removes the listeners', () => {
    const stop = startOriginFollower(() => {});
    stop();
    const seen: string[] = [];
    const stop2 = startOriginFollower((o) => seen.push(o));
    stop2();
    (chrome.tabs.onActivated as unknown as { emit: (i: chrome.tabs.OnActivatedInfo) => void }).emit(
      { tabId: 1, windowId: 1 },
    );
    expect(seen).toEqual([]);
  });

  it('stop() cancels a pending debounced emit', async () => {
    vi.useFakeTimers();
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 1, url: 'https://a.com' }]);
    const seen: string[] = [];
    const stop = startOriginFollower((o) => seen.push(o));
    (chrome.tabs.onActivated as unknown as { emit: (i: chrome.tabs.OnActivatedInfo) => void }).emit(
      { tabId: 1, windowId: 1 },
    );
    stop(); // before the 150ms debounce fires
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toEqual([]);
    vi.useRealTimers();
  });
});

describe('the panel follows only its own window', () => {
  it('asks for the active tab of its own window, not the focused one', async () => {
    vi.useFakeTimers();
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 9, url: 'https://mine.com/a' }]);
    const stop = startOriginFollower(() => {});
    await vi.advanceTimersByTimeAsync(0);
    (chrome.tabs.onActivated as unknown as { emit: (i: chrome.tabs.OnActivatedInfo) => void }).emit(
      { tabId: 9, windowId: 1 },
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, windowId: 1 });
    stop();
  });

  it('falls back to the focused window when nobody asked for a specific one', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 9, url: 'https://mine.com/a' }]);
    await getActiveOrigin();
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
  });

  it('still follows its own window when the window id is unavailable', async () => {
    vi.useFakeTimers();
    (chrome.windows.getCurrent as Mock).mockRejectedValue(new Error('no api'));
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 9, url: 'https://other.com/a' }]);
    const seen: string[] = [];
    const stop = startOriginFollower((o) => seen.push(o));
    await vi.advanceTimersByTimeAsync(0);

    (chrome.tabs.onActivated as unknown as { emit: (i: chrome.tabs.OnActivatedInfo) => void }).emit(
      { tabId: 9, windowId: 2 },
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toEqual(['https://other.com']);
    stop();
  });

  it('ignores a tab switch in another window', async () => {
    vi.useFakeTimers();
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 9, url: 'https://other.com/a' }]);
    const seen: string[] = [];
    const stop = startOriginFollower((o) => seen.push(o));
    await vi.advanceTimersByTimeAsync(0); // let ownWindowId resolve

    (chrome.tabs.onActivated as unknown as { emit: (i: chrome.tabs.OnActivatedInfo) => void }).emit(
      { tabId: 9, windowId: 2 },
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toEqual([]);

    (chrome.tabs.onActivated as unknown as { emit: (i: chrome.tabs.OnActivatedInfo) => void }).emit(
      { tabId: 9, windowId: 1 },
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toEqual(['https://other.com']);
    stop();
  });

  it('ignores a navigation in another window', async () => {
    vi.useFakeTimers();
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 9, url: 'https://other.com/a' }]);
    const seen: string[] = [];
    const stop = startOriginFollower((o) => seen.push(o));
    await vi.advanceTimersByTimeAsync(0);

    (
      chrome.tabs.onUpdated as unknown as {
        emit: (id: number, ci: chrome.tabs.OnUpdatedInfo, t: chrome.tabs.Tab) => void;
      }
    ).emit(9, { url: 'https://x.com' }, { active: true, windowId: 2 } as chrome.tabs.Tab);
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toEqual([]);

    (
      chrome.tabs.onUpdated as unknown as {
        emit: (id: number, ci: chrome.tabs.OnUpdatedInfo, t: chrome.tabs.Tab) => void;
      }
    ).emit(9, { url: 'https://x.com' }, { active: true, windowId: 1 } as chrome.tabs.Tab);
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toEqual(['https://other.com']);
    stop();
  });
});
