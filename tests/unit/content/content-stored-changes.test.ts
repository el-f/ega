// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { setRuntimeId } from '@tests/_helpers/runtime';

function emitFromWorker(msg: unknown): void {
  (
    chrome.runtime.onMessage as unknown as {
      emit: (m: unknown, s: chrome.runtime.MessageSender, r: (x: unknown) => void) => void;
    }
  ).emit(msg, { id: chrome.runtime.id }, () => {});
}

describe('the content script and storage changes', () => {
  it('never listens to storage.local, and re-reads settings when the worker says they changed', async () => {
    setRuntimeId('ega-test');
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
    const local = vi.spyOn(chrome.storage.local.onChanged, 'addListener');
    const global = vi.spyOn(chrome.storage.onChanged, 'addListener');

    await import('@/content/index');
    const { currentSettings } = await import('@/content/settings-cache');
    // Startup is over once its settings read lands; every listener is registered by then.
    await vi.waitFor(() => expect(currentSettings()).not.toBeNull());

    expect(local).not.toHaveBeenCalled();
    expect(global).not.toHaveBeenCalled();

    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, theme: 'light' },
    });
    emitFromWorker({ kind: 'content:storage-changed', keys: [STORAGE_KEYS.settings] });
    await vi.waitFor(() => expect(currentSettings()?.theme).toBe('light'));
    // The first import of the whole content entry transforms it, which is slow on a loaded box.
  }, 30_000);
});
