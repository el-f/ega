import { describe, expect, it } from 'vitest';
import { fieldErrors } from '@/options/answer-fields';
import type { AnswerField } from '@/shared/answer/spec';

const main: AnswerField = {
  key: 'answer',
  label: 'Answer',
  kind: 'text',
  role: 'main',
  required: true,
};
const note = (key: string, label = key, over: Partial<AnswerField> = {}): AnswerField => ({
  key,
  label,
  kind: 'text',
  role: 'notes',
  required: false,
  ...over,
});

describe('fieldErrors names the field that needs a fix', () => {
  it('has no errors for good fields', () => {
    expect(fieldErrors([main, note('tone', 'Tone')]).size).toBe(0);
  });

  it('an empty name, and both fields that share a name', () => {
    expect(
      Object.fromEntries(
        fieldErrors([main, note('field1', ' '), note('tone', 'Tone'), note('tone2', 'tone')]),
      ),
    ).toEqual({
      field1: { name: 'Add a name' },
      tone: { name: 'Two fields have this name' },
      tone2: { name: 'Two fields have this name' },
    });
  });

  it('a choice field needs 2 to 12 different choices', () => {
    for (const choices of [
      ['A'],
      ['A', 'a'],
      ['A', ''],
      Array.from({ length: 13 }, (_, i) => `c${i}`),
    ])
      expect(
        fieldErrors([main, note('tone', 'Tone', { kind: 'choice', choices })]).get('tone'),
      ).toEqual({
        choices: 'Add 2 to 12 different choices',
      });
  });

  it('a saved key Ega cannot use asks for a new name, in plain words', () => {
    for (const key of ['confidence', 'My Key', '__proto__', 'detectedLang'])
      expect(fieldErrors([main, note(key, 'Extra')]).get(key)).toEqual({
        name: 'Edit the name so Ega can read this field',
      });
    expect(fieldErrors([main, note('explain', 'Notes', { kind: 'list' })]).get('explain')).toEqual({
      name: 'Edit the name so Ega can read this field',
    });
    expect(fieldErrors([main, note('explain', 'Notes')]).size).toBe(0);
  });
});
