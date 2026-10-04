// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { ensureSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { flushAsync } from '@tests/_helpers/async';

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

function askSelection(): Promise<{ text: string }> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'ega:get-selection' },
      { id: chromeMock.runtime.id },
      (r: unknown) => resolve(r as { text: string }),
    );
  });
}

/** True when the page kept the selection for the popup after the live one was gone. */
async function selectionCached(): Promise<boolean> {
  document.dispatchEvent(new Event('selectionchange'));
  // The remember step runs right after the settings read, so it has run once that read is in.
  await ensureSettings();
  await flushAsync();
  window.getSelection()?.removeAllRanges();
  return (await askSelection()).text !== '';
}

beforeEach(async () => {
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  resetSettingsCacheForTest();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
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

describe('the popup asking for the selection', () => {
  it('gets nothing for a live selection inside a marked-private region', async () => {
    selectInside('<article><p id="ok">alpha beta</p></article>', 'ok');
    expect(await selectionCached()).toBe(true);
    // The private selection is the live one now, so it would win over the kept one.
    selectInside('<div data-ega-skip><p id="p">my recovery phrase</p></div>', 'p');

    expect((await askSelection()).text).toBe('');
  });
});
