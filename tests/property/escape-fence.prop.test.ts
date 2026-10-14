import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { escapeFence, escapeInline } from '@/shared/prompts';

const cp = (code: number): string => String.fromCodePoint(code);

// Every bridge class escapeFence must see through: invisible format chars (Cf) and combining marks (M).
const BRIDGE = [
  cp(0x200b), // ZWSP (Cf)
  cp(0xfeff), // BOM (Cf)
  cp(0x2060), // word joiner (Cf)
  cp(0x200d), // ZWJ (Cf)
  cp(0x0301), // combining acute (Mn)
  cp(0x0334), // combining tilde overlay (Mn)
  cp(0x0903), // Devanagari visarga (Mc)
  cp(0x20dd), // combining enclosing circle (Me)
];

// LF, CR, VT, FF, NEL, LS, PS — every char that can open a fresh instruction line.
const LINE_BREAKS = [0x000a, 0x000d, 0x000b, 0x000c, 0x0085, 0x2028, 0x2029].map(cp);

const arbBridge = fc.constantFrom(...BRIDGE);
const arbQuoteRun = fc.array(fc.oneof(fc.constant('"'), arbBridge), {
  minLength: 1,
  maxLength: 12,
});

/** The model sees the fence only after the bridges collapse, so drop them before looking. */
const stripBridges = (s: string): string => s.replace(/[\p{Cf}\p{M}]/gu, '');

describe('escapeFence leaves no re-formable """ fence', () => {
  it('holds for any run of quotes interleaved with format chars and combining marks', () => {
    fc.assert(
      fc.property(arbQuoteRun, fc.string({ maxLength: 10 }), (parts, tail) => {
        const out = escapeFence(parts.join('') + tail);
        expect(stripBridges(out.replaceAll('\\"', ''))).not.toContain('"""');
      }),
      { numRuns: 500 },
    );
  });

  it('holds for arbitrary text too', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const out = escapeFence(s);
        expect(stripBridges(out.replaceAll('\\"', ''))).not.toContain('"""');
      }),
      { numRuns: 500 },
    );
  });

  it('escapeInline also leaves no line break for any input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const out = escapeInline(s);
        for (const br of LINE_BREAKS) expect(out).not.toContain(br);
      }),
      { numRuns: 500 },
    );
  });
});
