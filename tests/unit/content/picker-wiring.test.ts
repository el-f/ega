// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { matchShortcut } from '@/content/hotkey';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

// Reads the real default pickerShortcut, so a typo in it fails here.
describe('picker shortcut default', () => {
  it('the default shortcut matches a Ctrl+Shift+E event', () => {
    const e = new KeyboardEvent('keydown', {
      key: 'E',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(matchShortcut(e, DEFAULT_SETTINGS.pickerShortcut)).toBe(true);
  });

  it('the default shortcut rejects a Ctrl+Shift+L event', () => {
    const e = new KeyboardEvent('keydown', {
      key: 'L',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(matchShortcut(e, DEFAULT_SETTINGS.pickerShortcut)).toBe(false);
  });
});
