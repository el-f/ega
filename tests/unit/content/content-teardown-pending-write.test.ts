// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setRuntimeId } from '@tests/_helpers/runtime';
import { ensureSettings } from '@/content/settings-cache';
import { drainAsync } from '@tests/_helpers/async';
import '@/content/index';

// Own file: teardown removes the content script's listeners for the whole module, so it must run last.

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

describe('content teardown and work already in flight', () => {
  it('a selection still in flight when the context dies writes no session storage', async () => {
    const setSpy = vi.spyOn(chrome.storage.session, 'set');
    selectMiddleWord();
    document.dispatchEvent(new Event('selectionchange'));
    setRuntimeId(undefined);

    document.dispatchEvent(new Event('selectionchange'));
    // The first handler is still running; everything it does after its settings read is over after a drain.
    await ensureSettings().catch(() => undefined);
    await drainAsync();

    expect(setSpy).not.toHaveBeenCalled();
  });
});
