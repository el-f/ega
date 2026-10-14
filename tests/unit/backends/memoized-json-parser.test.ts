import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import { createMemoizedJsonParser, parseJsonResponse } from '@/shared/backends/base';

/** Every prefix of `body`, cut at `step` characters. */
function prefixes(body: string, step: number): string[] {
  const out: string[] = [];
  for (let i = step; i < body.length; i += step) out.push(body.slice(0, i));
  out.push(body);
  return out;
}

describe('createMemoizedJsonParser matches parseJsonResponse at every prefix', () => {
  const bodies = [
    '{"translation":"hola mundo","confidence":0.9,"detectedLang":"es"}',
    '{"translation":"line1\\nline2 \\"quoted\\" \\\\ backslash","confidence":0.5}',
    '{"translation":"if (x) { y(); } else { z(); }","explain":"code"}',
    '```json\n{"translation":"fenced","confidence":0.4}\n```',
    'just plain text, no envelope at all',
    '{"translation":"","confidence":0}',
    '{"notatranslation":"x"}',
    '{"translation" : "spaced colon"}',
    '{"translation":123}',
    '{"translation":"مرحبا 🙂"}',
    '{"translation":"hello","confidence":0.9,"detectedLang":"arabizi",}',
    '{"translation":"צה"ל הודיע היום","confidence":0.9}',
    '{"translation":"line one\nline two","explain":"a\nb"}',
    '```json\n{"translation": "", "confidence": 0}\n```',
    '```json\n{"translation":\n  "hello","confidence":0.9}\n```',
    '```\nhello\n```\nmore after the fence',
    '`x` means y',
  ];

  for (const body of bodies) {
    it(`prefix parity: ${body.slice(0, 34)}`, () => {
      for (const step of [1, 3, 7]) {
        const parse = createMemoizedJsonParser();
        for (const prefix of prefixes(body, step)) {
          expect(parse(prefix), `${JSON.stringify(prefix)} @step=${step}`).toEqual(
            parseJsonResponse(prefix),
          );
        }
      }
    });
  }

  it('a body that is not an extension of the previous one restarts the scan', () => {
    const parse = createMemoizedJsonParser();
    expect(parse('{"translation":"first answ')).toEqual(
      parseJsonResponse('{"translation":"first answ'),
    );
    expect(parse('{"translation":"second"}')).toEqual(
      parseJsonResponse('{"translation":"second"}'),
    );
    expect(parse('{"translation":"th')).toEqual(parseJsonResponse('{"translation":"th'));
  });

  it('property: any random split of a JSON envelope parses like the unsplit body', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 60 }),
        fc.array(fc.integer({ min: 1, max: 80 }), { minLength: 1, maxLength: 8 }),
        (text, cuts) => {
          const body = JSON.stringify({ translation: text, confidence: 0.7 });
          const parse = createMemoizedJsonParser();
          const bounds = [...new Set(cuts.filter((n) => n < body.length))].sort((a, b) => a - b);
          for (const at of bounds)
            expect(parse(body.slice(0, at))).toEqual(parseJsonResponse(body.slice(0, at)));
          expect(parse(body)).toEqual(parseJsonResponse(body));
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('the streaming parse is linear, not quadratic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not re-JSON.parse the whole accumulator on every delta', () => {
    // The answer is code, so `}` appears mid-string and every delta offers a JSON candidate.
    const piece = 'if (x) { y(); } else { z(); } and some prose after it. ';
    const deltas = Array.from({ length: 200 }, () => piece);
    const parse = createMemoizedJsonParser();
    const spy = vi.spyOn(JSON, 'parse');
    let acc = '{"translation":"';
    for (const d of deltas) {
      acc += d;
      parse(acc);
    }
    expect(spy.mock.calls.length, 'one full parse per delta is the quadratic shape').toBeLessThan(
      20,
    );
    spy.mockRestore();
    acc += '","confidence":0.9}';
    expect(parse(acc).translation).toContain('if (x) { y(); }');
    expect(parse(acc).confidence).toBeCloseTo(0.9, 5);
  });
});
