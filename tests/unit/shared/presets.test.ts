import { describe, it, expect } from 'vitest';
import { BUILT_IN_PRESETS, getPreset } from '@/shared/presets';

describe('presets', () => {
  it('includes the core varieties', () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    expect(ids).toContain('arabizi');
    expect(ids).toContain('elvish-quenya');
    expect(ids).toContain('elvish-sindarin');
    expect(ids).toContain('leetspeak');
    expect(ids).toContain('genz-slang');
    expect(ids).toContain('gaming-jargon');
    expect(ids).toContain('fandom-jargon');
    expect(ids).toContain('crypto-twitter');
    expect(ids).toContain('medical-jargon');
    expect(ids).toContain('legal-jargon');
  });

  it('every preset has hint + examples', () => {
    for (const p of BUILT_IN_PRESETS) {
      expect(p.hint.length).toBeGreaterThan(20);
      expect(p.examples.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('getPreset returns preset by id or undefined', () => {
    expect(getPreset('arabizi')?.label).toBe('Arabizi');
    expect(getPreset('not-a-lang')).toBeUndefined();
  });

  it('arabizi autoDetect triggers on digit-mixed latin', () => {
    const p = getPreset('arabizi');
    if (!p) throw new Error('expected arabizi preset');
    const { autoDetect } = p;
    expect(autoDetect).toBeDefined();
    if (!autoDetect) throw new Error('expected autoDetect');
    const re = new RegExp(autoDetect.regex, autoDetect.flags);
    expect(re.test('mar7aba habibi')).toBe(true);
    expect(re.test('hello world')).toBe(false);
  });
});

// "Translate into plain English" fought every non-English target the user picked.
describe('built-in hints never name the output language', () => {
  it.each(BUILT_IN_PRESETS.map((p) => [p.id, p.hint]))('%s', (_id, hint) => {
    expect(hint).not.toMatch(/into (plain )?English/i);
  });
});
