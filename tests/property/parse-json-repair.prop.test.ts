import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createMemoizedJsonParser, parseJsonResponse } from '@/shared/backends/base';

// Raw control chars and JSON punctuation a model leaves unescaped; no `"` or `\`, which change where the string ends.
const arbSloppyText = fc
  .array(
    fc.constantFrom('a', 'b', ' ', '\n', '\t', '\r', '{', '}', '[', ']', ',', ':', 'ש', '🙂'),
    {
      minLength: 1,
      maxLength: 40,
    },
  )
  .map((cs) => cs.join(''));

describe('a slightly malformed envelope keeps every field', () => {
  it('raw control chars in the value plus a trailing comma still parse whole', () => {
    fc.assert(
      fc.property(arbSloppyText, arbSloppyText, (text, explain) => {
        const body = `{"translation":"${text}","confidence":0.5,"explain":"${explain}",}`;
        expect(parseJsonResponse(body)).toEqual({ translation: text, confidence: 0.5, explain });
      }),
      { numRuns: 300 },
    );
  });

  it('the streaming parse agrees with the full parse at every prefix', () => {
    fc.assert(
      fc.property(arbSloppyText, fc.integer({ min: 1, max: 9 }), (text, step) => {
        const body = `{"translation":"${text}","confidence":0.5,}`;
        const parse = createMemoizedJsonParser();
        for (let i = step; i < body.length + step; i += step) {
          const prefix = body.slice(0, Math.min(i, body.length));
          expect(parse(prefix)).toEqual(parseJsonResponse(prefix));
        }
      }),
      { numRuns: 200 },
    );
  });

  it('valid JSON parses exactly as JSON.parse reads it', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), fc.string({ maxLength: 60 }), (text, explain) => {
        const body = JSON.stringify({ translation: text, explain });
        expect(parseJsonResponse(body)).toEqual({ translation: text, explain });
      }),
      { numRuns: 300 },
    );
  });
});
