// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createPickerSpy = vi.fn();
const enterSpy = vi.fn();
const exitSpy = vi.fn();

vi.mock('@/content/picker', () => ({
  PRIVATE_FIELD_REASON: 'private',
  createPicker: (opts: { onPick: unknown; onExit: () => void; onHover?: unknown }) => {
    createPickerSpy(opts);
    return {
      enter: enterSpy,
      exit: exitSpy,
      isActive: () => false,
    };
  },
}));

vi.mock('@/content/PickerOverlay.svelte', () => ({
  default: function Stub() {
    return { destroy: () => {} };
  },
}));

vi.mock('@/content/shadowHost', () => ({
  getContainer: () => document.createElement('div'),
  onShadowHostRemount: () => {},
  ensureShadowSheet: () => {},
}));

import { enterPickerMode } from '@/content/picker-overlay';

beforeEach(() => {
  createPickerSpy.mockClear();
  enterSpy.mockClear();
  exitSpy.mockClear();
});

describe('picker-overlay — concurrent enterPickerMode does not double-create singleton', () => {
  it('two concurrent enterPickerMode calls share one PickerController', async () => {
    const startA = vi.fn();
    const startB = vi.fn();
    await Promise.all([enterPickerMode(startA), enterPickerMode(startB)]);
    // Both callers clear the `if (pickerSingleton)` check before either assigns.
    expect(createPickerSpy).toHaveBeenCalledTimes(1);
  });
});
