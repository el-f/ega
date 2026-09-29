// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installSelectionRestore } from '@/content/selection-restore';
import { resetSelectionRestore } from '@/content/selection-restore.test-utils';
import { mountShadowHost, getContainer } from '@/content/shadowHost';

// The cache lives for five minutes, so an un-dropped range comes back on any later window focus.

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

function selectionText(): string {
  return window.getSelection()?.toString().trim() ?? '';
}

describe('selection-restore — a user deselect stays deselected', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="target">yarayt rase fade add rasak</p><p id="other">x</p>';
    document.documentElement.removeAttribute('data-ega-host-installed');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    resetSelectionRestore();
    document.body.innerHTML = '';
  });

  it('a click that collapses the selection drops the cache, so refocus does not resurrect it', async () => {
    installSelectionRestore();
    selectParagraph();

    const other = document.getElementById('other');
    other?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clearSelection();

    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 0));

    expect(selectionText()).toBe('');
  });

  it('a keypress that collapses the selection drops the cache too', async () => {
    installSelectionRestore();
    selectParagraph();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    clearSelection();

    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 0));

    expect(selectionText()).toBe('');
  });

  it('a browser-driven collapse still restores, so the tab-switch fix survives', async () => {
    installSelectionRestore();
    selectParagraph();

    document.dispatchEvent(new Event('visibilitychange'));
    clearSelection();

    await new Promise((r) => setTimeout(r, 0));
    expect(selectionText()).toBe('yarayt rase fade add rasak');
  });

  it('clicking ega own UI is not a deselect', async () => {
    mountShadowHost();
    installSelectionRestore();
    selectParagraph();

    // Events inside the open shadow root retarget to the host element.
    getContainer().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    document.dispatchEvent(new Event('visibilitychange'));
    clearSelection();

    await new Promise((r) => setTimeout(r, 0));
    expect(selectionText()).toBe('yarayt rase fade add rasak');
  });
});
