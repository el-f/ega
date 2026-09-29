// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
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
  for (let i = 0; i < 100; i++) {
    if (isMultiSelectActive()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('translate-areas mode never armed');
}

beforeEach(async () => {
  setRuntimeId('ega-test');
  resetSettingsCacheForTest();
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  (chromeMock.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
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
    await new Promise((r) => setTimeout(r, 50));

    expect(isMultiSelectActive()).toBe(false);
    expect(clickOn('p').defaultPrevented).toBe(false);
  });
});
