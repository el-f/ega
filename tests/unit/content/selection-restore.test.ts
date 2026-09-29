// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installSelectionRestore } from '@/content/selection-restore';
import { resetSelectionRestore } from '@/content/selection-restore.test-utils';

// Reproduces the real Chrome tab-switch-back event order, which `page.bringToFront()` does not.

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

function clearSelection(): void {
  const sel = window.getSelection();
  if (!sel) throw new Error('no selection API');
  sel.removeAllRanges();
  document.dispatchEvent(new Event('selectionchange'));
}

function currentSelectionText(): string {
  const sel = window.getSelection();
  return sel ? sel.toString().trim() : '';
}

describe('selection-restore grace window', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="target">yarayt rase fade add rasak</p>';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    resetSelectionRestore();
    document.body.innerHTML = '';
  });

  it('restores the cached Range when selection is cleared after visibility-return', async () => {
    installSelectionRestore();

    selectParagraph();
    expect(currentSelectionText()).toBe('yarayt rase fade add rasak');

    // Real Chrome clears the Selection first, then fires visibilitychange.
    clearSelection();
    expect(currentSelectionText()).toBe('');

    document.dispatchEvent(new Event('visibilitychange'));

    // The handler restores within a microtask.
    await new Promise((r) => setTimeout(r, 0));
    expect(currentSelectionText()).toBe('yarayt rase fade add rasak');
  });

  it('restores when Chrome fires empty selectionchange WITHIN 500ms after visibilitychange', async () => {
    installSelectionRestore();

    selectParagraph();

    document.dispatchEvent(new Event('visibilitychange'));
    expect(currentSelectionText()).toBe('yarayt rase fade add rasak');

    // Chrome drops the Selection a frame later, after visibilitychange.
    clearSelection();

    // Grace window re-asserts.
    await new Promise((r) => setTimeout(r, 0));
    expect(currentSelectionText()).toBe('yarayt rase fade add rasak');
  });

  it('also re-restores on window-focus + delayed empty selectionchange', async () => {
    installSelectionRestore();

    selectParagraph();

    window.dispatchEvent(new Event('focus'));
    clearSelection();

    await new Promise((r) => setTimeout(r, 0));
    expect(currentSelectionText()).toBe('yarayt rase fade add rasak');
  });

  it('does NOT re-restore after the 500ms grace window closes', async () => {
    vi.useFakeTimers();
    try {
      installSelectionRestore();

      selectParagraph();

      document.dispatchEvent(new Event('visibilitychange'));

      vi.advanceTimersByTime(600);

      clearSelection();

      await Promise.resolve();
      expect(currentSelectionText()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not resurrect selections older than the 5-minute TTL', async () => {
    vi.useFakeTimers();
    try {
      installSelectionRestore();

      selectParagraph();

      // Jump 6 minutes forward — cache is stale.
      vi.advanceTimersByTime(6 * 60 * 1000);

      clearSelection();
      document.dispatchEvent(new Event('visibilitychange'));

      await Promise.resolve();
      expect(currentSelectionText()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('install is idempotent — double-install does not double-fire listeners', async () => {
    installSelectionRestore();
    installSelectionRestore();

    selectParagraph();
    clearSelection();
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise((r) => setTimeout(r, 0));
    expect(currentSelectionText()).toBe('yarayt rase fade add rasak');
  });

  it('never puts a selection back on a site the user turned Ega off for', async () => {
    let off = false;
    installSelectionRestore(() => off);

    selectParagraph();
    off = true;
    clearSelection();
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise((r) => setTimeout(r, 0));
    expect(currentSelectionText()).toBe('');
  });
});
