// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { ensureSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { pending } from '@/content/request-state';
import { retranslateWithTask, retryTranslate } from '@/content/translate-handlers';
import { peekContainer } from '@/content/shadowHost';
// Static so the lazy tooltip import resolves off the warm module graph, not mid-teardown.
import { closeTooltip } from '@/content/tipState.svelte';

await import('@/content/index');

// GitHub's code view: a click on the code lands on the textarea and collapses its selection, and the card stays open.

const TEXT = 'mar7aba habibi, kifak? shu 3am ta3mel?';

function tooltipTop(): string | undefined {
  return peekContainer()?.querySelector<HTMLElement>('.tooltip')?.style.top;
}

function openWrapId(): string | null | undefined {
  return peekContainer()
    ?.querySelector('[data-ega-tooltip-wrap]')
    ?.getAttribute('data-ega-tooltip-wrap');
}

beforeEach(async () => {
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  resetSettingsCacheForTest();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
});

afterEach(() => {
  vi.restoreAllMocks();
  closeTooltip();
  pending.clear();
  document.body.innerHTML = '';
});

describe('a card opened on a textarea selection, reopened after the selection collapsed', () => {
  it.each([
    ['Retry', (id: string) => retryTranslate({ ensureSettings }, id)],
    [
      'a task switch',
      (id: string) => retranslateWithTask({ ensureSettings }, id, 'summarize', 'neutral'),
    ],
  ])('%s keeps the card on the text it opened on', async (_, reopen) => {
    const ta = document.createElement('textarea');
    ta.value = `intro line\n${TEXT}\nlast line`;
    ta.getBoundingClientRect = () => new DOMRect(0, 100, 800, 700);
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(11, 11 + TEXT.length);
    // In Chromium the range that wraps the field reports the field's box; the mirror's span is the selected text.
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 100, 800, 700),
    );
    vi.spyOn(HTMLSpanElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(30, 500, 200, 20),
    );
    chromeMock.runtime.onMessage.emit(
      { kind: 'hotkey:translate' },
      { id: chromeMock.runtime.id },
      () => {},
    );
    // 8px under the text's 500..520 box; under the field it would be 808.
    await vi.waitFor(() => {
      expect(pending.size).toBe(1);
      expect(tooltipTop()).toBe('528px');
    });
    const first = [...pending.keys()][0];
    if (first === undefined) throw new Error('no request row');

    ta.setSelectionRange(3, 3);
    await reopen(first);

    await vi.waitFor(() => {
      expect(openWrapId()).not.toBe(first);
      expect(tooltipTop()).toBe('528px');
    });
  });
});
