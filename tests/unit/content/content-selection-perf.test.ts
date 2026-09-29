// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import '@/content/index';
import { beginRequest, pending, rendererOwner, perfTimers } from '@/content/request-state';
import { sel } from '@tests/_helpers/lang';

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

function makeReq(id: string) {
  const auto = sel('auto');
  const en = sel('en');
  return {
    id,
    text: 'hello',
    rect: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect,
    sourceLang: auto,
    direction: { source: auto, target: en },
  };
}

beforeEach(() => {
  pending.clear();
  rendererOwner.clear();
  perfTimers.clear();
  document.body.innerHTML = '<article id="art">alpha beta gamma delta</article>';
  (chrome.runtime.sendMessage as Mock).mockReset();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(async () => {
  window.getSelection()?.removeAllRanges();
  // removeAllRanges re-arms the 100ms popup-selection debounce, which throws on a torn-down `location`.
  await new Promise((r) => setTimeout(r, 150));
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('selectionchange stays cheap', () => {
  it('does not walk the page text nodes on every selection event', async () => {
    selectMiddleWord();
    const walk = vi.spyOn(document, 'createTreeWalker');

    document.dispatchEvent(new Event('selectionchange'));

    expect(walk).not.toHaveBeenCalled();
    // Let the trailing popup-selection write run before the environment tears down.
    await new Promise((r) => setTimeout(r, 150));
  });
});

describe('cancel clears the perf timer', () => {
  it('popstate cancel removes the request from perfTimers', async () => {
    pending.set('r-perf-1', makeReq('r-perf-1'));
    beginRequest('r-perf-1', 'tooltip');
    perfTimers.set('r-perf-1', { startedAt: 0, firstDelta: null });

    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 0));

    expect(perfTimers.has('r-perf-1')).toBe(false);
  });
});
