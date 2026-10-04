import { describe, it, expect, vi } from 'vitest';
import { parseStoredSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

describe('retired advanced keys', () => {
  it('are dropped before the parse, so the row never goes into repair', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const out = parseStoredSettings(
      {
        ...structuredClone(DEFAULT_SETTINGS),
        advanced: {
          ...structuredClone(DEFAULT_SETTINGS.advanced),
          userRecipes: [{ id: 'r1' }],
          customSlotDescriptions: { tone: 'a note' },
        },
      },
      { defaults: DEFAULT_SETTINGS },
    );
    expect(out.advanced).not.toHaveProperty('userRecipes');
    expect(out.advanced).not.toHaveProperty('customSlotDescriptions');
    expect(debug).not.toHaveBeenCalled();
    debug.mockRestore();
  });
});
