// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installSelectionRestore, selectionRestoreInternal } from '@/content/selection-restore';
import { resetSelectionRestore } from '@tests/_helpers/selection-restore.test-utils';

function selectParagraph(): void {
  const p = document.getElementById('target');
  if (!p) throw new Error('target paragraph missing');
  const range = document.createRange();
  range.selectNodeContents(p);
  const sel = window.getSelection();
  if (!sel) throw new Error('no selection API');
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

function collapseSelection(): void {
  window.getSelection()?.removeAllRanges();
  document.dispatchEvent(new Event('selectionchange'));
}

describe('selection-restore cache purge', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="target">yarayt rase fade add rasak</p>';
  });

  afterEach(() => {
    resetSelectionRestore();
    document.body.innerHTML = '';
  });

  it('drops the cached range after the 5-minute TTL, with no restore attempt', () => {
    vi.useFakeTimers();
    try {
      installSelectionRestore();
      selectParagraph();

      vi.advanceTimersByTime(6 * 60 * 1000);
      collapseSelection();

      expect(selectionRestoreInternal.cached).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a live cached range that is still in the document', () => {
    installSelectionRestore();
    selectParagraph();
    collapseSelection();

    expect(selectionRestoreInternal.cached).not.toBeNull();
  });
});
