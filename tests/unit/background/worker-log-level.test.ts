import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { createLogger, type LogLevel } from '@/shared/logger';
import type { Settings } from '@/shared/types';

vi.mock('@/background/contextMenu', () => ({
  handleSiteToggleClick: vi.fn().mockResolvedValue(undefined),
  refreshSiteToggleLabel: vi.fn().mockResolvedValue(undefined),
  installContextMenus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/background/router', () => ({
  createRouter: vi.fn(() => ({ cancel: vi.fn(), cancelAll: vi.fn(), clearProbes: vi.fn() })),
}));
vi.mock('@/background/pre-warm', () => ({ resolvePreWarmProvider: vi.fn().mockReturnValue(null) }));
vi.mock('@/shared/cli-session/port-manager', () => ({
  getStatus: vi.fn().mockReturnValue('cold'),
  warm: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/background/native-test', () => ({ handleNativeTest: vi.fn() }));
vi.mock('@/shared/backends/registry', () => ({
  instantiateAll: vi.fn(() => ({})),
  resolveBackend: vi.fn(),
}));
vi.mock('@/background/cache', () => ({
  TranslationCache: vi.fn(function () {
    return { get: vi.fn(), set: vi.fn(), clear: vi.fn() };
  }),
}));

const stored = (level: LogLevel): Partial<Settings> =>
  ({ advanced: { debugLogLevel: level } }) as unknown as Partial<Settings>;
const getSettingsMock = vi.fn().mockResolvedValue(stored('debug'));
vi.mock('@/shared/storage', () => ({
  getSettings: (...a: unknown[]) => getSettingsMock(...a),
  getCustomLanguages: vi.fn().mockResolvedValue([]),
  getCustomTasks: vi.fn().mockResolvedValue([]),
  updateSettings: vi.fn().mockResolvedValue(undefined),
  replaceSitePrefs: vi.fn().mockResolvedValue(undefined),
  onSettingsChanged: vi.fn(() => () => {}),
}));

// The logger reads its level from the stored row itself, the first time the worker creates a logger.
chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, stored('debug'));
await import('@/background/index');

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

function settingsWrite(oldLevel: LogLevel, newLevel: LogLevel): void {
  chromeMock.storage.local._fire({
    [STORAGE_KEYS.settings]: { oldValue: stored(oldLevel), newValue: stored(newLevel) },
  });
}

let info: MockInstance;
let warn: MockInstance;
beforeEach(() => {
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  info.mockRestore();
  warn.mockRestore();
});

describe('worker log level', () => {
  it('boot applies the stored Debug log level', async () => {
    await settle();

    createLogger('bg').info('backend anthropic transient error (AUTH); falling back');

    expect(info).toHaveBeenCalledWith(
      '[ega:bg]',
      'backend anthropic transient error (AUTH); falling back',
    );
  });

  it('a settings write that changes the level applies it without a restart', async () => {
    settingsWrite('debug', 'silent');
    await settle();

    createLogger('bg').warn('hidden');

    expect(warn).not.toHaveBeenCalled();
  });
});
