// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSelectionInfo } from '@/content/selection';

function selectMiddleWord(): void {
  const art = document.getElementById('art');
  const first = art?.firstChild;
  if (!first) throw new Error('article text node missing');
  const r = document.createRange();
  r.setStart(first, 6);
  r.setEnd(first, 10);
  const sel = window.getSelection();
  if (!sel) throw new Error('no selection API');
  sel.removeAllRanges();
  sel.addRange(r);
}

describe('getSelectionInfo with context off', () => {
  beforeEach(() => {
    document.body.innerHTML = '<article id="art">alpha beta gamma delta</article>';
    selectMiddleWord();
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('still returns the selected text and its rect', () => {
    const info = getSelectionInfo(undefined, false);
    expect(info?.text).toBe('beta');
    expect(info?.rect).toBeDefined();
  });

  it('returns empty before and after text', () => {
    const info = getSelectionInfo(undefined, false);
    expect(info?.beforeText).toBe('');
    expect(info?.afterText).toBe('');
  });

  it('does not walk the page text nodes', () => {
    const walk = vi.spyOn(document, 'createTreeWalker');
    getSelectionInfo(undefined, false);
    expect(walk).not.toHaveBeenCalled();
  });

  it('still collects the surrounding text by default', () => {
    const info = getSelectionInfo();
    expect(info?.beforeText).toBe('alpha ');
    expect(info?.afterText).toBe(' gamma delta');
  });
});
