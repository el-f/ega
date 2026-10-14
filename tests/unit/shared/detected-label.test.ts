import { describe, it, expect } from 'vitest';
import { formatDetectedLabel } from '@/shared/detected-label';

describe('formatDetectedLabel', () => {
  it('combines preset label with detail via em-dash', () => {
    const label = formatDetectedLabel('arabizi', 'Levantine');
    // arabizi preset label ≈ "Arabizi"; assertion uses regex so label
    // casing changes don't rebreak the test.
    expect(label).toMatch(/^Arabizi \u2014 Levantine$/);
  });

  it('does NOT double-paren a detail that already contains parens', () => {
    const label = formatDetectedLabel('arabizi', 'Levantine (Lebanese)');
    // Must not produce "Arabizi (Levantine (Lebanese))".
    expect(label).not.toMatch(/\(\(/);
    expect(label).not.toMatch(/\)\)/);
    // Should still surface the detail verbatim, joined with an em-dash.
    expect(label).toContain('Levantine (Lebanese)');
    expect(label).toContain('\u2014');
  });

  it('returns the base alone when no detail', () => {
    const label = formatDetectedLabel('arabizi', undefined);
    expect(label).toMatch(/Arabizi/);
    expect(label).not.toContain('\u2014');
  });

  it('returns the detail alone when no detectedLang', () => {
    const label = formatDetectedLabel(undefined, 'Lebanese');
    expect(label).toBe('Lebanese');
  });

  it('returns empty string when both are missing', () => {
    expect(formatDetectedLabel(undefined, undefined)).toBe('');
  });

  it("shows the detail alone for 'other', the id the prompt itself instructs", () => {
    expect(formatDetectedLabel('other', 'French')).toBe('French');
  });

  it("renders nothing for a bare 'other' with no detail", () => {
    expect(formatDetectedLabel('other', undefined)).toBe('');
  });

  it('falls back to the raw id when no preset, variety or ISO table knows it', () => {
    const label = formatDetectedLabel('made-up-lang', 'some detail');
    expect(label).toBe('made-up-lang \u2014 some detail');
  });

  it('expands a bare ISO code to its English label', () => {
    expect(formatDetectedLabel('es', undefined)).toBe('Spanish');
    expect(formatDetectedLabel('es', 'Rioplatense')).toBe('Spanish \u2014 Rioplatense');
  });

  it('resolves a custom variety id against the passed varieties', () => {
    const id = '3f2a9c1e-0000-4000-8000-000000000000';
    expect(formatDetectedLabel(id, undefined, [{ id, label: 'Yeshivish' }])).toBe('Yeshivish');
  });

  it('leaves a custom id missing from the passed varieties verbatim', () => {
    const id = '3f2a9c1e-0000-4000-8000-000000000000';
    expect(formatDetectedLabel(id, undefined, [])).toBe(id);
  });
});

// Models often echo the language name into the detail, which read "Arabizi — Arabizi" on the pill.
describe('formatDetectedLabel — a detail that repeats the language', () => {
  it.each([
    ['arabizi', 'Arabizi', 'Arabizi'],
    ['ar', 'Arabic', 'Arabic'],
    ['en', 'en', 'English'],
    ['fr', 'French — Parisian', 'French — Parisian'],
    ['fr', 'French (Parisian)', 'French — Parisian'],
    ['arabizi', 'arabizi: Levantine', 'Arabizi — Levantine'],
  ])('%s + %j → %j', (id, detail, want) => {
    expect(formatDetectedLabel(id, detail)).toBe(want);
  });

  it("reads 'Other' the same as 'other'", () => {
    expect(formatDetectedLabel('Other', 'French')).toBe('French');
  });
});
