import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { settingsSchema } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

describe('page-translate settings', () => {
  it('defaults pageTranslateMode to inplace', () => {
    expect(DEFAULT_SETTINGS.pageTranslateMode).toBe('inplace');
  });

  it('accepts both render modes', () => {
    for (const mode of ['inplace', 'bilingual'] as const) {
      const s = v.parse(settingsSchema, { pageTranslateMode: mode });
      expect(s.pageTranslateMode).toBe(mode);
    }
  });

  it('rejects an unknown render mode', () => {
    expect(() => v.parse(settingsSchema, { pageTranslateMode: 'side-by-side' })).toThrow();
  });
});
