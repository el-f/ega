// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { setSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { getShadowHostElement } from '@/content/shadowHost';
import { showToast, dismissToast } from '@/content/toast';

import '@/content/index';

function hostTheme(): string | undefined {
  return getShadowHostElement()?.dataset['theme'];
}

beforeEach(() => {
  delete document.documentElement.dataset['theme'];
  getShadowHostElement()?.remove();
  resetSettingsCacheForTest();
});

afterEach(() => {
  dismissToast();
  delete document.documentElement.dataset['theme'];
});

describe('the first surface on a page paints in the user theme', () => {
  it('uses the cached preference in the same tick the host mounts', () => {
    setSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });

    // No await: this is what the user sees on the first frame.
    showToast('Ega is off for this site.');

    expect(hostTheme()).toBe('dark');
  });

  it('lets a page that forces its own theme win', () => {
    document.documentElement.dataset['theme'] = 'light';
    setSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });

    showToast('Ega is off for this site.');

    expect(hostTheme()).toBe('light');
  });

  it('leaves the media query in charge when the preference is system', () => {
    setSettings({ ...DEFAULT_SETTINGS, theme: 'system' });

    showToast('Ega is off for this site.');

    expect(hostTheme()).toBeUndefined();
  });

  it('follows a settings change after the host mounts', async () => {
    setSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
    showToast('Ega is off for this site.');
    expect(hostTheme()).toBe('dark');

    await chromeMock.storage.local.set({ 'ega.settings': { ...DEFAULT_SETTINGS, theme: 'light' } });
    chromeMock.runtime.onMessage.emit(
      { kind: 'content:storage-changed', keys: ['ega.settings'] },
      { id: chromeMock.runtime.id } as chrome.runtime.MessageSender,
      () => {},
    );
    await vi.waitFor(() => expect(hostTheme()).toBe('light'));
  });
});
