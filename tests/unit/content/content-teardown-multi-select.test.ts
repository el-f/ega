// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { isMultiSelectActive } from '@/content/page-translate-v2/multi-select';
import { setRuntimeId } from '@tests/_helpers/runtime';

import '@/content/index';

// teardownContent runs once per module instance, so this file holds exactly one teardown case.

function clickOn(id: string): MouseEvent {
  const el = document.getElementById(id);
  if (!el) throw new Error(`test setup: #${id}`);
  const e = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

/** The mode arms behind a dynamic import, and vitest compiles that graph on first use. */
async function waitForMultiSelect(): Promise<void> {
  await vi.waitFor(() => expect(isMultiSelectActive()).toBe(true), { timeout: 5000 });
}

beforeEach(async () => {
  setRuntimeId('ega-test');
  resetSettingsCacheForTest();
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  document.body.innerHTML = '<p id="p">alpha beta gamma</p>';
});

describe('a dead context must not leave translate-areas mode armed', () => {
  it('exits the mode, so the page takes clicks again', async () => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'page:translateAll' },
      { id: chromeMock.runtime.id },
      () => {},
    );
    await waitForMultiSelect();
    // Armed: the mode owns every click on the page.
    expect(clickOn('p').defaultPrevented).toBe(true);

    setRuntimeId(undefined);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    await vi.waitFor(() => expect(isMultiSelectActive()).toBe(false));
    expect(clickOn('p').defaultPrevented).toBe(false);
  });
});
