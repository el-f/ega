// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { isMultiSelectActive, exitMultiSelect } from '@/content/page-translate-v2/multi-select';

import '@/content/index';

// The block detector is only wired if the id it produces reaches translate:start.

function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

async function waitFor(cond: () => boolean, what: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!cond()) throw new Error(`timed out waiting for ${what}`);
    },
    { timeout: 2000 },
  );
}

function starts(): { sourceLang?: string; text?: string }[] {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as { kind?: string; sourceLang?: string; text?: string })
    .filter((m) => m.kind === 'translate:start');
}

beforeEach(async () => {
  (chrome.runtime as { id?: string }).id = 'ega-test';
  resetSettingsCacheForTest();
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  (chromeMock.runtime.sendMessage as Mock).mockClear();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  document.body.innerHTML = '<p id="p">mar7aba 7abibi, kifak? shu 3am ta3mel?</p>';
});

afterEach(() => {
  exitMultiSelect();
  document.body.innerHTML = '';
});

describe('page translate — per-block detected language', () => {
  it('sends the detected variety as the source language, not "auto"', async () => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'page:translateAll' },
      { id: chromeMock.runtime.id },
      () => {},
    );
    await waitFor(() => isMultiSelectActive(), 'translate-areas mode');
    press('ArrowDown');
    press(' ');
    press('Enter');
    await waitFor(() => starts().length > 0, 'translate:start');

    expect(starts()[0]?.sourceLang).toBe('arabizi');
  });
});
