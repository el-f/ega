import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import { resetCardWithUndo } from '@/options/card-reset';
import { toastStore } from '@/shared/components/toastStore';
import { getSettings, updateSettings } from '@/shared/storage';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

beforeEach(() => {
  resetChromeMock();
  vi.restoreAllMocks();
});

describe('resetCardWithUndo', () => {
  it('writes the defaults, says "<Card> is back to defaults", and Undo puts back exactly what was there', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const cur = await updateSettings({
      tooltipDraggable: true,
      advanced: { temperature: 1.3, effort: 'high' } as Settings['advanced'],
    });
    const onSaved = vi.fn();
    await resetCardWithUndo(
      'Generation',
      {
        tooltipDraggable: DEFAULT_SETTINGS.tooltipDraggable,
        advanced: { temperature: DEFAULT_SETTINGS.advanced.temperature },
      },
      cur,
      onSaved,
    );
    let s = await getSettings();
    expect(s.tooltipDraggable).toBe(DEFAULT_SETTINGS.tooltipDraggable);
    expect(s.advanced.temperature).toBe(DEFAULT_SETTINGS.advanced.temperature);
    // A field outside the card is not touched.
    expect(s.advanced.effort).toBe('high');
    expect(onSaved).toHaveBeenCalledTimes(1);

    const toast = push.mock.calls[0]?.[0];
    expect(toast?.message).toBe('Generation is back to defaults');
    expect(toast?.action?.label).toBe('Undo');
    toast?.action?.onClick();
    await vi.waitFor(async () => {
      s = await getSettings();
      expect(s.advanced.temperature).toBe(1.3);
    });
    expect(s.tooltipDraggable).toBe(true);
  });
});
