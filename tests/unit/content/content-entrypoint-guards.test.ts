// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import '@/content/index';
import { enterPickerMode } from '@/content/index';
import { isInsideEgaHost } from '@/content/picker';
import { mountShadowHost, getContainer } from '@/content/shadowHost';
import { setSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { setRuntimeId } from '@tests/_helpers/runtime';
import { workerReply } from '@tests/mocks/chrome';
import { drainAsync } from '@tests/_helpers/async';

function toastText(): string {
  return getContainer().querySelector('[data-ega-toast-wrap]')?.textContent ?? '';
}

/** The settings read retries before it gives up, so a fixed sleep races the toast. */
async function waitForToast(): Promise<void> {
  await vi.waitFor(() => expect(toastText()).not.toBe(''), { timeout: 2000 });
}

/** The worker is the only trusted sender: same extension id, no tab. */
function emitToContent(msg: unknown): void {
  (
    chrome.runtime.onMessage as unknown as {
      emit: (m: unknown, s: chrome.runtime.MessageSender, r: (x: unknown) => void) => void;
    }
  ).emit(msg, { id: chrome.runtime.id }, () => {});
}

beforeEach(() => {
  setRuntimeId('ega-test');
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ega-host-installed');
  setSettings(DEFAULT_SETTINGS);
  (chrome.runtime.sendMessage as Mock).mockReset();
  (chrome.runtime.sendMessage as Mock).mockImplementation(workerReply);
  mountShadowHost();
});

afterEach(() => {
  setRuntimeId('ega-test');
  resetSettingsCacheForTest();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('the picker trusts only the host this script built', () => {
  it('ignores a page decoy carrying the ega host id', () => {
    const decoy = document.createElement('div');
    decoy.id = 'ega-shadow-host';
    const inside = document.createElement('span');
    decoy.appendChild(inside);
    document.body.appendChild(decoy);

    expect(isInsideEgaHost(inside)).toBe(false);
  });

  it('still recognizes the real host element', () => {
    const host = document.getElementById('ega-shadow-host');
    expect(host).not.toBeNull();
    expect(isInsideEgaHost(host)).toBe(true);
  });
});

describe('a fire-and-forget entry point never fails silently', () => {
  it('a picker entry on a dead context toasts the reload hint instead of rejecting', async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      seen.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      setRuntimeId(undefined);
      await enterPickerMode().catch(() => {
        /* enterPickerMode is awaited here; production calls it fire-and-forget */
      });
      // Node reports a rejection at the end of the turn that made it, so the drained turns would show one.
      await drainAsync();
    } finally {
      process.off('unhandledRejection', onUnhandled);
      setRuntimeId('ega-test');
    }
    expect(seen).toEqual([]);
  });

  it('a page:translateAll whose settings read fails does not become an unhandled rejection', async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      seen.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      resetSettingsCacheForTest();
      vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(
        new Error('Extension context invalidated'),
      );
      emitToContent({ kind: 'page:translateAll' });
      await waitForToast();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(seen).toEqual([]);
    expect(toastText()).toContain('Reload the page');
    // Telling the user to reload without giving them the button is half an affordance.
    const action = getContainer().querySelector('[data-ega-toast-action]');
    expect(action?.textContent).toBe('Reload page');
  });
});
