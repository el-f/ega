// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import '@/content/index';
import { enterPickerMode, startTranslateText } from '@/content/index';
import { getContainer } from '@/content/shadowHost';
import { setSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { setRuntimeId } from '@tests/_helpers/runtime';

// teardownContent runs once per module instance, so this file holds exactly one teardown case.

function rect(): DOMRect {
  return {
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 110,
    bottom: 30,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  setRuntimeId('ega-test');
  document.body.innerHTML = '<p id="p">alpha beta gamma</p>';
  setSettings({ ...DEFAULT_SETTINGS, pickerEnabled: true });
  (chrome.runtime.sendMessage as Mock).mockReset();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  resetSettingsCacheForTest();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('a dead context leaves nothing hooked into the page', () => {
  it('disarms the picker and puts an in-flight inline block back', async () => {
    await enterPickerMode();
    expect(getContainer().querySelector('[data-ega-picker-wrap]')).not.toBeNull();

    const p = document.getElementById('p');
    if (!p?.firstChild) throw new Error('test setup: paragraph text node missing');
    const range = document.createRange();
    range.selectNodeContents(p);
    await startTranslateText('alpha beta gamma', rect(), undefined, range, undefined, true);
    expect(p.querySelector('[data-ega-replaced]')).not.toBeNull();

    const off = vi.spyOn(document, 'removeEventListener');
    setRuntimeId(undefined);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    await new Promise((r) => setTimeout(r, 0));

    expect(off.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['mousemove', 'click', 'keydown', 'mouseover']),
    );
    expect(document.getElementById('ega-shadow-host')).toBeNull();
    expect(p.querySelector('[data-ega-replaced]')).toBeNull();
    expect(p.textContent).toBe('alpha beta gamma');
  });
});
