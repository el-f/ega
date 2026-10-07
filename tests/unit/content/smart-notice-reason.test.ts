// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { getShadowRoot } from '@/content/shadowHost';
import { drainAsync } from '@tests/_helpers/async';

await import('@/content/index');

// The once-per-install notice names one reason, English text; the module keeps a once-per-session flag, so one file, one story.

function decide(text: string): Promise<void> {
  document.body.innerHTML = `<p id="p">${text}</p>`;
  const node = document.getElementById('p')?.firstChild;
  if (!node) throw new Error('test setup: text node missing');
  const r = document.createRange();
  r.selectNodeContents(node);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(r);
  document.dispatchEvent(new Event('selectionchange'));
  return drainAsync();
}

function toastText(): string {
  return getShadowRoot().querySelector('.ega-toast')?.textContent ?? '';
}

describe('the first smart hold-back notice', () => {
  it('stays quiet for a short word and shows for English text, the reason it names', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: {
        ...DEFAULT_SETTINGS,
        bubbleMode: 'smart',
        smartBubbleMinLength: 6,
        smartBubbleBannerShown: false,
      },
    });
    resetSettingsCacheForTest();
    const send = chromeMock.runtime.sendMessage as Mock;
    send.mockImplementation(workerReply);

    await decide('ciao');
    expect(toastText()).toBe('');
    // The once-per-install flag is still free for the notice that is true.
    expect(send).not.toHaveBeenCalledWith({
      kind: 'settings:update',
      patch: { smartBubbleBannerShown: true },
    });

    await decide('the quick brown fox jumps over the lazy dog every morning');
    await vi.waitFor(
      () => expect(toastText()).toContain("The bubble only shows on text that isn't English."),
      { timeout: 5000 },
    );
  });
});
