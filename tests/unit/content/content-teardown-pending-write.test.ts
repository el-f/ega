// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setRuntimeId } from '@tests/_helpers/runtime';
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

describe('content teardown cancels work already in flight', () => {
  it('drops the queued popup-selection write instead of letting it fire', async () => {
    const setSpy = vi.spyOn(chrome.storage.session, 'set');
    selectMiddleWord();
    document.dispatchEvent(new Event('selectionchange'));
    setRuntimeId(undefined);

    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((r) => setTimeout(r, 200));

    expect(setSpy).not.toHaveBeenCalled();
  });
});
