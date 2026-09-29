// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const DEFAULT_SETTINGS = { theme: 'system' as const };
const mockGetSettings = vi.fn(
  async () => DEFAULT_SETTINGS as { theme: 'system' | 'light' | 'dark' },
);

type StoredTheme = { theme: 'system' | 'light' | 'dark' };
const settingsListeners = new Set<(s: StoredTheme) => void>();

vi.mock('@/shared/storage', () => ({
  getSettings: () => mockGetSettings(),
  onSettingsChanged: (cb: (s: StoredTheme) => void) => {
    settingsListeners.add(cb);
    return () => settingsListeners.delete(cb);
  },
}));

import { applyTheme, initTheme } from '@/shared/theme';

describe('applyTheme', () => {
  it('removes data-theme on system', () => {
    const el = document.createElement('div');
    el.dataset['theme'] = 'dark';
    applyTheme('system', el);
    expect(el.getAttribute('data-theme')).toBeNull();
  });

  it('sets data-theme for light/dark', () => {
    const el = document.createElement('div');
    applyTheme('dark', el);
    expect(el.getAttribute('data-theme')).toBe('dark');
    applyTheme('light', el);
    expect(el.getAttribute('data-theme')).toBe('light');
  });
});

// The path every extension page takes: options/popup/sidepanel call initTheme() with no target.
describe('initTheme on documentElement', () => {
  beforeEach(() => {
    delete document.documentElement.dataset['theme'];
    settingsListeners.clear();
    mockGetSettings.mockResolvedValue({ theme: 'system' });
  });
  afterEach(() => {
    delete document.documentElement.dataset['theme'];
    settingsListeners.clear();
  });

  it('applies the stored theme once settings resolve', async () => {
    mockGetSettings.mockResolvedValue({ theme: 'dark' });
    const off = initTheme();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    off();
  });

  it('re-applies on a settings change and stops after the disposer runs', async () => {
    const off = initTheme();
    await new Promise((r) => setTimeout(r, 0));
    expect(settingsListeners.size).toBe(1);
    for (const cb of settingsListeners) cb({ theme: 'light' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    off();
    expect(settingsListeners.size).toBe(0);
  });

  it('leaves the attribute alone when the settings read rejects', async () => {
    mockGetSettings.mockRejectedValueOnce(new Error('storage down'));
    const off = initTheme();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    off();
  });
});

describe('initTheme host-mirror', () => {
  beforeEach(() => {
    delete document.documentElement.dataset['theme'];
    settingsListeners.clear();
    mockGetSettings.mockResolvedValue({ theme: 'system' });
  });
  afterEach(() => {
    delete document.documentElement.dataset['theme'];
    settingsListeners.clear();
  });

  it('repaints the host when the stored theme changes and the page forces nothing', async () => {
    const host = document.createElement('div');
    const off = initTheme(host);
    await new Promise((r) => setTimeout(r, 0));
    for (const cb of settingsListeners) cb({ theme: 'dark' });
    expect(host.getAttribute('data-theme')).toBe('dark');
    off();
  });

  it('mirrors documentElement data-theme onto the host element', async () => {
    document.documentElement.dataset['theme'] = 'dark';
    const host = document.createElement('div');
    const off = initTheme(host);
    // initial sync mirror
    expect(host.getAttribute('data-theme')).toBe('dark');
    off();
  });

  it('clears host data-theme when page removes documentElement and settings=system', async () => {
    document.documentElement.dataset['theme'] = 'dark';
    const host = document.createElement('div');
    const off = initTheme(host);
    // Let getSettings resolve so settingsTheme caches 'system'.
    await new Promise((r) => setTimeout(r, 0));
    expect(host.getAttribute('data-theme')).toBe('dark');
    // Page transitions back to system: remove documentElement attribute.
    delete document.documentElement.dataset['theme'];
    await new Promise((r) => setTimeout(r, 0));
    expect(host.getAttribute('data-theme')).toBeNull();
    off();
  });

  it('falls back to settings.theme when page clears its own data-theme', async () => {
    mockGetSettings.mockResolvedValue({ theme: 'light' });
    document.documentElement.dataset['theme'] = 'dark';
    const host = document.createElement('div');
    const off = initTheme(host);
    // Wait for getSettings to resolve so settingsTheme primes to 'light'.
    await new Promise((r) => setTimeout(r, 0));
    expect(host.getAttribute('data-theme')).toBe('dark');
    // Page clears its forced theme.
    delete document.documentElement.dataset['theme'];
    await new Promise((r) => setTimeout(r, 0));
    // Mirror falls back to settings.theme='light' instead of stripping.
    expect(host.getAttribute('data-theme')).toBe('light');
    off();
  });

  it('falls back to settings.theme when documentElement gets an unknown value', async () => {
    mockGetSettings.mockResolvedValue({ theme: 'light' });
    document.documentElement.dataset['theme'] = 'dark';
    const host = document.createElement('div');
    const off = initTheme(host);
    await new Promise((r) => setTimeout(r, 0));
    expect(host.getAttribute('data-theme')).toBe('dark');
    document.documentElement.dataset['theme'] = 'wat';
    await new Promise((r) => setTimeout(r, 0));
    expect(host.getAttribute('data-theme')).toBe('light');
    off();
  });
});
