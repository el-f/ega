import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ensureSettings,
  currentSettings,
  setSettings,
  preloadSettings,
  resetSettingsCacheForTest,
} from '@/content/settings-cache';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn(),
}));

import { getSettings } from '@/shared/storage';
const mockGetSettings = vi.mocked(getSettings);

describe('settings-cache', () => {
  beforeEach(() => {
    resetSettingsCacheForTest();
    mockGetSettings.mockReset();
  });

  it('resolves and caches; 2nd call skips getSettings', async () => {
    mockGetSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    const a = await ensureSettings();
    const b = await ensureSettings();
    expect(a).toBe(b);
    expect(mockGetSettings).toHaveBeenCalledTimes(1);
  });

  it('concurrent calls dedupe to one getSettings call', async () => {
    mockGetSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    const [a, b] = await Promise.all([ensureSettings(), ensureSettings()]);
    expect(a).toBe(b);
    expect(mockGetSettings).toHaveBeenCalledTimes(1);
  });

  it('a rejected first call does not stay in the cache', async () => {
    mockGetSettings
      .mockRejectedValueOnce(new Error('storage IPC error'))
      .mockResolvedValueOnce({ ...DEFAULT_SETTINGS, shortcut: 'Alt+T' });

    await expect(ensureSettings()).rejects.toThrow('storage IPC error');

    const result = await ensureSettings();
    expect(result.shortcut).toBe('Alt+T');
    expect(mockGetSettings).toHaveBeenCalledTimes(2);
  });

  it('currentSettings returns null before any load', () => {
    expect(currentSettings()).toBeNull();
  });

  it('setSettings + currentSettings round-trip', () => {
    const s = { ...DEFAULT_SETTINGS };
    setSettings(s);
    expect(currentSettings()).toEqual(s);
  });

  it('ensureSettings gets the settings from the worker with no API keys', async () => {
    mockGetSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS, anthropicApiKey: 'sk-secret' });
    const s = (await ensureSettings()) as Record<string, unknown>;
    expect(s['anthropicApiKey']).toBeUndefined();
    expect(s['shortcut']).toBe(DEFAULT_SETTINGS.shortcut);
  });

  it('resetSettingsCacheForTest clears cache and in-flight', async () => {
    mockGetSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    await ensureSettings();
    resetSettingsCacheForTest();
    expect(currentSettings()).toBeNull();
    mockGetSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    await ensureSettings();
    expect(mockGetSettings).toHaveBeenCalledTimes(2);
  });

  it('preloadSettings warms the cache', async () => {
    mockGetSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    preloadSettings();
    await new Promise((r) => setTimeout(r, 0));
    expect(currentSettings()).not.toBeNull();
    expect(mockGetSettings).toHaveBeenCalledTimes(1);
  });
});
