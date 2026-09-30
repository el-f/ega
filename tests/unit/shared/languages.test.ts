import { describe, it, expect } from 'vitest';
import { ISO_LANGUAGES, labelFor } from '@/shared/languages';

describe('shared/languages', () => {
  it('ISO_LANGUAGES is frozen — callers cannot push into it', () => {
    expect(Object.isFrozen(ISO_LANGUAGES)).toBe(true);
    // Strict mode: mutation attempt throws rather than silently no-ops.
    expect(() => {
      (ISO_LANGUAGES as unknown as IsoLanguageLike[]).push({ code: 'xx', label: 'X' });
    }).toThrow();
  });

  it('contains ~70 entries with unique codes', () => {
    expect(ISO_LANGUAGES.length).toBeGreaterThanOrEqual(60);
    const codes = new Set(ISO_LANGUAGES.map((l) => l.code));
    expect(codes.size).toBe(ISO_LANGUAGES.length);
  });

  it('labelFor resolves known codes to their English name', () => {
    expect(labelFor('en')).toBe('English');
    expect(labelFor('ja')).toBe('Japanese');
    expect(labelFor('fr')).toBe('French');
    expect(labelFor('zh-TW')).toBe('Chinese (Traditional)');
  });

  it('labelFor falls back to UPPER-cased input for unknown codes', () => {
    expect(labelFor('xx')).toBe('XX');
    expect(labelFor('abc')).toBe('ABC');
  });
});

// Minimal shape for the mutation-attempt cast above — avoids importing the
// real IsoLanguage type just to satisfy TS on an intentionally-illegal push.
interface IsoLanguageLike {
  code: string;
  label: string;
}
