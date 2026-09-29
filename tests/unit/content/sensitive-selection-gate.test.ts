// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';

await import('@/content/index');

function selectInside(html: string, hostId: string): void {
  document.body.innerHTML = html;
  const node = document.getElementById(hostId)?.firstChild;
  if (!node) throw new Error('test setup: text node missing');
  const r = document.createRange();
  r.setStart(node, 0);
  r.setEnd(node, node.textContent?.length ?? 0);
  const s = window.getSelection();
  if (!s) throw new Error('no selection API');
  s.removeAllRanges();
  s.addRange(r);
}

/** The cache write is debounced, so a fixed sleep would race it. */
async function selectionCached(): Promise<boolean> {
  document.dispatchEvent(new Event('selectionchange'));
  for (let i = 0; i < 40; i++) {
    if (chromeMock.storage.session._raw.has('ega.lastSelection')) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

beforeEach(async () => {
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  chromeMock.storage.session._raw.clear();
  resetSettingsCacheForTest();
  (chromeMock.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('a drag-selection inside a marked-private region never leaves the page', () => {
  it('honors data-ega-skip on an ancestor of the selection', async () => {
    selectInside('<div data-ega-skip><p id="p">my recovery phrase</p></div>', 'p');

    expect(await selectionCached()).toBe(false);
  });

  it('still caches an ordinary selection', async () => {
    selectInside('<article><p id="p">alpha beta gamma</p></article>', 'p');

    expect(await selectionCached()).toBe(true);
  });
});
