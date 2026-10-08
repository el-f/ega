// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { sendToPage } from '@/popup/tab-actions';

const NONE = 'Could not establish connection. Receiving end does not exist.';

/** A page whose content script lands when the test says; `delivered` lists the actions it got. */
function loadingPage(): { delivered: string[]; load: () => void } {
  let loaded = false;
  const delivered: string[] = [];
  (chrome.tabs.query as unknown as Mock).mockResolvedValue([
    { id: 42, url: 'https://example.com/', status: 'loading' },
  ]);
  (chrome.tabs.sendMessage as unknown as Mock).mockImplementation(
    async (_id: number, msg: { kind: string }) => {
      if (!loaded) throw new Error(NONE);
      delivered.push(msg.kind);
      return { ok: true };
    },
  );
  (chrome.tabs.get as unknown as Mock).mockImplementation(async () => ({
    id: 42,
    status: loaded ? 'complete' : 'loading',
  }));
  return { delivered, load: () => (loaded = true) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  (chrome.tabs.query as unknown as Mock).mockResolvedValue([]);
  (chrome.tabs.get as unknown as Mock).mockResolvedValue({ id: 1, url: '' });
  (chrome.tabs.sendMessage as unknown as Mock).mockResolvedValue({ ok: true });
});

describe('sendToPage on a page that is still loading', () => {
  it('reports the wait, and only the latest of several presses runs', async () => {
    vi.useFakeTimers();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const page = loadingPage();
    const onWait = vi.fn();
    const onError = vi.fn();
    const presses = [
      sendToPage({ kind: 'page:translateAll' }, { onWait, onError }),
      sendToPage({ kind: 'page:chooseAreas' }, { onWait, onError }),
      sendToPage({ kind: 'page:chooseAreas' }, { onWait, onError }),
    ];
    // Several polls while the page loads, then the content script lands.
    await vi.advanceTimersByTimeAsync(1000);
    page.load();
    // Long enough for every waiting press to try again more than once.
    await vi.advanceTimersByTimeAsync(2000);
    expect(await Promise.all(presses)).toEqual([false, false, true]);
    // A second Choose areas would have closed the mode the first one opened.
    expect(page.delivered).toEqual(['page:chooseAreas']);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onWait).toHaveBeenCalled();
  });
});
