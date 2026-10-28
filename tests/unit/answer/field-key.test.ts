import { describe, expect, it } from 'vitest';
import { fieldKey } from '@/shared/answer/field-key';
import { META_KEYS, validateSpec } from '@/shared/answer/spec';

const KEY = /^[a-z]\w{0,31}$/;

describe('a field key built from its name', () => {
  it('is a camelCase ASCII slug of the name', () => {
    expect(fieldKey('Key points', [])).toBe('keyPoints');
    expect(fieldKey('tone', [])).toBe('tone');
    expect(fieldKey('Top URLs', [])).toBe('topUrls');
    expect(fieldKey('keyPoints', [])).toBe('keyPoints');
    expect(fieldKey('  Why — it works!  ', [])).toBe('whyItWorks');
    expect(fieldKey('Café crème', [])).toBe('cafeCreme');
  });

  it('starts with a letter and stays within 32 characters', () => {
    expect(fieldKey('3 tips', [])).toBe('field3Tips');
    const long = fieldKey('A very long field name that goes on and on and on', []);
    expect(long).toMatch(KEY);
    expect(long.length).toBeLessThanOrEqual(32);
  });

  it('falls back to fieldN, the first free number, when the name has no Latin letters', () => {
    expect(fieldKey('טון', [])).toBe('field1');
    expect(fieldKey('النبرة 2', ['field1'])).toBe('field2');
    expect(fieldKey('', ['field1', 'field2'])).toBe('field3');
  });

  it('adds a number on a clash with another field in the task', () => {
    expect(fieldKey('Tone', ['tone'])).toBe('tone2');
    expect(fieldKey('Tone', ['tone', 'tone2'])).toBe('tone3');
    const long = 'A very long field name that goes on and on and on';
    const first = fieldKey(long, []);
    const second = fieldKey(long, [first]);
    expect(second).not.toBe(first);
    expect(second).toMatch(KEY);
  });

  it('never takes a key Ega reads for itself: metadata, a reader alias or explain', () => {
    for (const name of [
      ...META_KEYS,
      'Translation',
      'Answer',
      'Result',
      'Output',
      'Text',
      'Response',
      'Explain',
      'Constructor',
    ]) {
      const key = fieldKey(name, []);
      expect(key, name).toMatch(KEY);
      expect(key, name).toBe(`${name[0]?.toLowerCase()}${name.slice(1)}2`);
    }
  });

  it('every key it builds passes the stored-row check', () => {
    const names = ['Tone', 'Tone', 'Confidence', 'Text', 'טון', '3 tips', 'Explain'];
    const fields = [{ key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true }];
    names.forEach((name, i) => {
      fields.push({
        key: fieldKey(
          name,
          fields.map((f) => f.key),
        ),
        label: `${name} ${i}`,
        kind: 'text',
        role: 'notes',
        required: false,
      });
    });
    expect(
      validateSpec({ id: 'custom:t', version: 1, join: 'after-build', fields } as never),
    ).toEqual([]);
  });
});
