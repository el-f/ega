// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { capText, capTextFromEnd } from '@/shared/text-cap';
import { isWellFormed } from '@tests/_helpers/well-formed';

const ACUTE = String.fromCodePoint(0x301);

describe('capText', () => {
  it('returns text within the cap unchanged', () => {
    expect(capText('abc', 10)).toBe('abc');
    expect(capText('abc', 3)).toBe('abc');
  });

  it('never ends inside a surrogate pair', () => {
    expect(capText('ab😀cd', 3)).toBe('ab');
    expect(capText('ab😀cd', 4)).toBe('ab😀');
    const cut = capText(`${'a'.repeat(1999)}😀 tail`, 2000);
    expect(cut).toBe('a'.repeat(1999));
    expect(isWellFormed(cut)).toBe(true);
  });

  it('keeps a flag or a family emoji whole', () => {
    // 🇫🇷 is two astral code points; 👨‍👩‍👧 is three joined by ZWJ.
    expect(capText('ab🇫🇷', 4)).toBe('ab');
    expect(capText('x👨‍👩‍👧y', 6)).toBe('x');
    expect(capText('x👨‍👩‍👧y', 9)).toBe('x👨‍👩‍👧');
  });

  it('cuts inside one grapheme longer than the cap, still at a code point', () => {
    const marks = `a${ACUTE.repeat(50)}`;
    expect(capText(marks, 10)).toBe(marks.slice(0, 10));
    expect(capText(`😀${ACUTE.repeat(50)}`, 1)).toBe('');
  });

  it('gives a well-formed prefix within the cap for any well-formed text', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 60 }),
        fc.nat({ max: 80 }),
        (s, max) => {
          const cut = capText(s, max);
          expect(cut.length).toBeLessThanOrEqual(max);
          expect(s.startsWith(cut)).toBe(true);
          expect(isWellFormed(cut)).toBe(true);
        },
      ),
    );
  });
});

describe('capTextFromEnd', () => {
  it('returns text within the cap unchanged', () => {
    expect(capTextFromEnd('abc', 10)).toBe('abc');
    expect(capTextFromEnd('abc', 3)).toBe('abc');
    expect(capTextFromEnd('abc', 0)).toBe('');
  });

  it('keeps the end, never starting inside a surrogate pair', () => {
    expect(capTextFromEnd('abcdef', 4)).toBe('cdef');
    expect(capTextFromEnd('ab😀cd', 3)).toBe('cd');
    expect(capTextFromEnd('ab😀cd', 4)).toBe('😀cd');
    const cut = capTextFromEnd(`head 😀${'z'.repeat(199)}`, 200);
    expect(cut).toBe('z'.repeat(199));
    expect(isWellFormed(cut)).toBe(true);
  });

  it('keeps a flag or a family emoji whole', () => {
    expect(capTextFromEnd('🇫🇷ab', 4)).toBe('ab');
    expect(capTextFromEnd('x👨‍👩‍👧y', 6)).toBe('y');
    expect(capTextFromEnd('x👨‍👩‍👧y', 9)).toBe('👨‍👩‍👧y');
  });

  it('cuts inside one grapheme longer than the cap, still at a code point', () => {
    const marks = `a${ACUTE.repeat(50)}`;
    expect(capTextFromEnd(marks, 10)).toBe(marks.slice(-10));
    expect(capTextFromEnd(`a${ACUTE.repeat(50)}😀`, 1)).toBe('');
  });

  it('gives a well-formed suffix within the cap for any well-formed text', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 60 }),
        fc.nat({ max: 80 }),
        (s, max) => {
          const cut = capTextFromEnd(s, max);
          expect(cut.length).toBeLessThanOrEqual(max);
          expect(s.endsWith(cut)).toBe(true);
          expect(isWellFormed(cut)).toBe(true);
        },
      ),
    );
  });
});
