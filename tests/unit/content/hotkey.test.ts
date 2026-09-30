// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { matchShortcut } from '@/content/hotkey';

describe('matchShortcut', () => {
  it('matches Ctrl+Shift+L', () => {
    const e = new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, shiftKey: true });
    expect(matchShortcut(e, 'Ctrl+Shift+L')).toBe(true);
  });
  it('rejects missing shift', () => {
    const e = new KeyboardEvent('keydown', { key: 'l', ctrlKey: true });
    expect(matchShortcut(e, 'Ctrl+Shift+L')).toBe(false);
  });
});
