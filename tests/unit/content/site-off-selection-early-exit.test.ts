// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@/content/index';
import { ensureSettings, setSettings } from '@/content/settings-cache';
import { selectionRestoreInternal } from '@/content/selection-restore';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

function selectWord(): void {
  document.body.innerHTML = '<article id="art">alpha beta gamma delta</article>';
  const first = document.getElementById('art')?.firstChild;
  if (!first) throw new Error('article text node missing');
  const r = document.createRange();
  r.setStart(first, 6);
  r.setEnd(first, 10);
  const s = window.getSelection();
  if (!s) throw new Error('no selection API');
  s.removeAllRanges();
  s.addRange(r);
}

beforeEach(async () => {
  await ensureSettings();
  selectionRestoreInternal.cached = null;
});

afterEach(() => {
  setSettings(DEFAULT_SETTINGS);
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('a site the user turned Ega off for', () => {
  it('a selection does no layout read and caches nothing', () => {
    setSettings({ ...DEFAULT_SETTINGS, sitePrefs: { [location.origin]: { disabled: true } } });
    selectWord();
    const rectRead = vi.spyOn(Range.prototype, 'getBoundingClientRect');

    document.dispatchEvent(new Event('selectionchange'));

    expect(rectRead).not.toHaveBeenCalled();
    expect(selectionRestoreInternal.cached).toBeNull();
  });

  it('control: the same selection on an enabled site does both', () => {
    setSettings(DEFAULT_SETTINGS);
    selectWord();
    const rectRead = vi.spyOn(Range.prototype, 'getBoundingClientRect');

    document.dispatchEvent(new Event('selectionchange'));

    expect(rectRead).toHaveBeenCalled();
    expect(selectionRestoreInternal.cached).not.toBeNull();
  });
});
