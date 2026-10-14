// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@/content/index';
import { getContainer } from '@/content/shadowHost';
import { setRuntimeId } from '@tests/_helpers/runtime';
import { drainAsync } from '@tests/_helpers/async';

function selectMiddleWord(): void {
  const art = document.getElementById('art');
  const first = art?.firstChild;
  if (!first) throw new Error('article text node missing');
  const r = document.createRange();
  r.setStart(first, 6);
  r.setEnd(first, 10);
  const s = window.getSelection();
  if (!s) throw new Error('no selection API');
  s.removeAllRanges();
  s.addRange(r);
}

function host(): HTMLElement | null {
  return document.getElementById('ega-shadow-host');
}

beforeEach(() => {
  document.body.innerHTML = '<article id="art">alpha beta gamma delta</article>';
  setRuntimeId('ega-test');
});

afterEach(() => {
  setRuntimeId('ega-test');
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('content script survives a dead extension context', () => {
  it('a failed settings read does not turn into an unhandled rejection', async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      seen.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const failedRead = vi
        .spyOn(chrome.storage.local, 'get')
        .mockRejectedValue(new Error('Extension context invalidated'));
      selectMiddleWord();

      document.dispatchEvent(new Event('selectionchange'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
      // The read has failed; Node reports an unhandled rejection by the end of the turns drained here.
      await vi.waitFor(() => expect(failedRead).toHaveBeenCalled());
      await drainAsync();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(seen).toEqual([]);
  });

  it('a selection after the context dies removes the listeners and the shadow host', () => {
    const docOff = vi.spyOn(document, 'removeEventListener');
    const winOff = vi.spyOn(window, 'removeEventListener');
    // The host is built on first use, so give teardown something to remove.
    getContainer();
    expect(host()).not.toBeNull();
    selectMiddleWord();
    setRuntimeId(undefined);

    document.dispatchEvent(new Event('selectionchange'));

    expect(docOff.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['selectionchange', 'keydown', 'visibilitychange']),
    );
    expect(winOff.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['popstate', 'hashchange', 'beforeunload', 'pagehide', 'focus']),
    );
    expect(host()).toBeNull();
  });
});
