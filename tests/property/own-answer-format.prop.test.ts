// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { embedsOwnFormat, convertOwnFormat } from '@/options/own-answer-format';
import { fieldErrors } from '@/options/answer-fields';
import { validateSpec } from '@/shared/answer/spec';

const arbKey = fc.oneof(
  fc.stringMatching(/^[a-z]\w{0,31}$/),
  fc.constantFrom(
    'answer',
    'translation',
    'explain',
    'text',
    'keyPoints',
    'key_points',
    'key__points',
  ),
);

describe('Turn into fields', () => {
  it('never builds fields that need fixing before they save', () => {
    fc.assert(
      fc.property(fc.uniqueArray(arbKey, { minLength: 1, maxLength: 8 }), (keys) => {
        const body = keys.map((k) => `"${k}": string`).join(', ');
        const prompt = { system: `Do it. Return JSON {${body}}.`, user: '{{text}}' };
        const own = embedsOwnFormat(prompt);
        fc.pre(own !== null);
        const fields = convertOwnFormat(prompt, own)?.fields ?? [];
        expect(fieldErrors(fields).size).toBe(0);
        expect(validateSpec({ id: 'custom:t', version: 1, join: 'after-build', fields })).toEqual(
          [],
        );
      }),
    );
  });
});
