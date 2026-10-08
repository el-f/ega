// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
// Static so the lazy tooltip import resolves off the warm module graph, not mid-teardown.
import '@/content/tipState.svelte';

vi.mock('@/content/picker-overlay', () => ({
  enterPickerMode: vi.fn().mockResolvedValue(undefined),
}));

const calls: string[] = [];
vi.mock('@/content/toast', () => ({
  showToast: () => calls.push('show'),
  dismissToast: vi.fn(),
  closeStickyToast: () => calls.push('close'),
}));

// jsdom has no Navigation API; the content script listens on whatever the page exposes at load.
const navigation = new EventTarget();
Object.defineProperty(window, 'navigation', { value: navigation, configurable: true });

const content = await import('@/content/index');
const { enterPickerMode: enterPickerModeImpl } = await import('@/content/picker-overlay');

function emit(msg: Record<string, unknown>): void {
  chromeMock.runtime.onMessage.emit(msg, { id: chromeMock.runtime.id }, () => {});
}

const RECT = { left: 0, top: 0, right: 1, bottom: 1, x: 0, y: 0, width: 1, height: 1 } as DOMRect;

describe('a new Ega action closes a notice that waits for the user (X14)', () => {
  beforeEach(async () => {
    // The site is off, so every entry point refuses with a toast right after the close.
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: {
        ...DEFAULT_SETTINGS,
        sitePrefs: { 'http://localhost:3000': { disabled: true } },
      },
    });
    resetSettingsCacheForTest();
    (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
    calls.length = 0;
  });

  it('the picker', async () => {
    await content.enterPickerMode();
    // The site-off notice loads with the bubble menu's chunk, so it lands a moment later.
    await vi.waitFor(() => expect(calls).toEqual(['close', 'show']));
  });

  it('a text translate leaves the close to its caller, which may have just shown a notice', async () => {
    await content.startTranslateText('hola', RECT);
    await vi.waitFor(() => expect(calls).toEqual(['show']));
  });

  it('a pick in the picker', async () => {
    await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS } });
    resetSettingsCacheForTest();
    await content.enterPickerMode();
    const pick = vi.mocked(enterPickerModeImpl).mock.calls.at(-1)?.[0];
    calls.length = 0;
    pick?.('hola', RECT);
    expect(calls).toEqual(['close']);
    await vi.waitFor(() =>
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'translate:start', text: 'hola' }),
      ),
    );
  });

  it('a page translate', async () => {
    emit({ kind: 'page:translateAll' });
    await vi.waitFor(() => expect(calls).toEqual(['close', 'show']));
  });

  it('a selection translate', async () => {
    emit({ kind: 'hotkey:translate' });
    await vi.waitFor(() => expect(calls[0]).toBe('close'));
  });

  it('a page navigation', () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(calls).toEqual(['close', 'close']);
  });

  it("the page router's own route change, but not a replace of the same entry", () => {
    for (const navigationType of ['push', 'replace', 'traverse'])
      navigation.dispatchEvent(Object.assign(new Event('currententrychange'), { navigationType }));
    expect(calls).toEqual(['close', 'close']);
  });
});
