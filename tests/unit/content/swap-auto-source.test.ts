// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';

const openTooltipSpy = vi.fn();
vi.mock('@/content/lazy-tooltip', () => ({
  openTooltip: (...a: unknown[]) => openTooltipSpy(...a),
  closeTooltip: vi.fn(),
  errorTooltip: vi.fn(),
  getTooltipBody: vi.fn(),
}));

const content = await import('@/content/index');

const RECT = {
  left: 0,
  top: 0,
  right: 10,
  bottom: 10,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  toJSON: () => ({}),
} as DOMRect;

afterEach(() => {
  openTooltipSpy.mockReset();
  document.body.innerHTML = '';
});

describe('a selection under the default source "auto"', () => {
  it('reaches the tooltip with a detected source, so its Swap button is not disabled', async () => {
    expect(DEFAULT_SETTINGS.defaultLang).toBe('auto');
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, defaultDisplayMode: 'tooltip' },
    });
    resetSettingsCacheForTest();

    await content.startTranslateText('kif halak ya habibi, shu 3am ta3mel?', RECT);

    await vi.waitFor(() => expect(openTooltipSpy).toHaveBeenCalled());
    const opts = openTooltipSpy.mock.calls[0]?.[0] as { direction?: { source: string } };
    // The tooltip disables Swap only for a raw 'auto' source.
    expect(opts.direction?.source).not.toBe('auto');
    expect(opts.direction?.source).toBe('arabizi');
  });
});
