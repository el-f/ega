// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getSelectionInfo } from '@/content/selection';

describe('getSelectionInfo', () => {
  it('returns null when no selection', () => {
    window.getSelection()?.removeAllRanges();
    expect(getSelectionInfo()).toBeNull();
  });
  it('returns text and bounding rect when selection exists', () => {
    const p = document.createElement('p');
    p.textContent = 'hello world';
    document.body.appendChild(p);
    const r = document.createRange();
    const first = p.firstChild;
    if (!first) throw new Error('test setup: p.firstChild');
    r.setStart(first, 0);
    r.setEnd(first, 5);
    const sel = window.getSelection();
    if (!sel) throw new Error('test setup: no selection');
    sel.removeAllRanges();
    sel.addRange(r);
    const info = getSelectionInfo();
    expect(info?.text).toBe('hello');
    expect(info?.rect).toBeDefined();
  });
});
