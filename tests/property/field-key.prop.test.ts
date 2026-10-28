// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { fieldKey } from '@/shared/answer/field-key';
import { META_KEYS } from '@/shared/answer/spec';

const RESERVED = [
  ...META_KEYS,
  'translation',
  'answer',
  'result',
  'output',
  'text',
  'response',
  'explain',
];
const arbName = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 50 }),
  fc.constantFrom(...RESERVED, 'Tone', 'Key points', 'טון', '3 tips', ''),
);

describe('fieldKey', () => {
  it('always gives a valid key that no other field and no Ega key uses', () => {
    fc.assert(
      fc.property(
        arbName,
        fc.array(fc.oneof(arbName, fc.constantFrom('tone', 'field1'))),
        (name, names) => {
          const taken = names.map((n) => fieldKey(n, []));
          const key = fieldKey(name, taken);
          expect(key).toMatch(/^[a-z]\w{0,31}$/);
          expect(taken).not.toContain(key);
          expect(RESERVED).not.toContain(key);
        },
      ),
    );
  });
});
