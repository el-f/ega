import { describe, expect, it } from 'vitest';
import { ALL_TASKS } from '@/shared/task-prompts';
import { answerSpecFor, CUSTOM_PRESETS, validateSpec, type AnswerSpec } from '@/shared/answer/spec';
import { renderFormat } from '@/shared/answer/render-format';
import { toJsonSchema } from '@/shared/answer/json-schema';

const main = {
  key: 'answer',
  label: 'Answer',
  kind: 'text',
  role: 'main',
  required: true,
} as const;
const custom: AnswerSpec = {
  id: 'custom:example',
  version: 1,
  join: 'after-build',
  fields: [
    main,
    { key: 'points', label: 'Key points', kind: 'list', role: 'notes', required: false },
    {
      key: 'decision',
      label: 'Decision',
      kind: 'choice',
      role: 'details',
      required: false,
      choices: ['Keep', 'Change'],
    },
  ],
};

describe('versioned answer specs', () => {
  it.each([...ALL_TASKS, 'ocr'])('%s has one usable main field', (task) => {
    expect(validateSpec(answerSpecFor(task))).toEqual([]);
  });
  it.each(Object.keys(CUSTOM_PRESETS))('%s keeps the custom join after the slot pass', (preset) => {
    const spec = CUSTOM_PRESETS[preset as keyof typeof CUSTOM_PRESETS];
    expect(validateSpec(spec)).toEqual([]);
    expect(renderFormat(spec)).toMatchObject({ join: 'after-build', sep: '\n\n' });
  });
  it('Translate and Explain share the detection contract', () => {
    expect(answerSpecFor('explain')).toBe(answerSpecFor('translate'));
    const regular = toJsonSchema(answerSpecFor('translate'));
    const explained = toJsonSchema(answerSpecFor('explain'), { explain: true });
    expect(regular.properties).not.toHaveProperty('explain');
    expect(explained.properties).toHaveProperty('explain');
    expect(explained.required).toContain('explain');
  });
  it('rejects duplicate keys, missing main fields, and unsupported main kinds', () => {
    expect(validateSpec({ ...custom, fields: [...custom.fields, main] })).not.toEqual([]);
    expect(validateSpec({ ...custom, fields: custom.fields.slice(1) })).not.toEqual([]);
    expect(validateSpec({ ...custom, fields: [{ ...main, kind: 'score' }] })).not.toEqual([]);
  });
  it('reserves metadata and conditional fields for built-ins', () => {
    expect(
      validateSpec({
        ...custom,
        fields: [
          ...custom.fields,
          { key: 'score', label: 'Score', kind: 'score', role: 'meta', required: false },
        ],
      }),
    ).not.toEqual([]);
    expect(validateSpec({ ...custom, fields: [{ ...main, when: 'explain' }] })).not.toEqual([]);
  });
  it('limits custom fields and validates keys, labels, guidance, and choices', () => {
    const changed = (field: Partial<AnswerSpec['fields'][number]>) => ({
      ...custom,
      fields: [{ ...main, ...field }],
    });
    for (const field of [
      { key: '1answer' },
      { key: 'a'.repeat(33) },
      { key: '__proto__' },
      { label: '' },
      { label: 'a'.repeat(41) },
      { guide: 'a'.repeat(201) },
      { guide: 'first\nsecond' },
      { kind: 'choice' as const, choices: ['Only'] },
    ])
      expect(validateSpec(changed(field))).not.toEqual([]);
    expect(
      validateSpec({
        ...custom,
        fields: Array.from({ length: 9 }, (_, i) => ({
          key: `field${i}`,
          label: 'Field',
          kind: 'text',
          role: i ? 'details' : 'main',
          required: true,
        })),
      }),
    ).not.toEqual([]);
  });
});

describe('generated formats and provider schemas', () => {
  it('names duplicate custom field labels before attempting to save or preview', () => {
    expect(
      validateSpec({
        ...custom,
        fields: [
          main,
          { key: 'note', label: main.label, kind: 'text', role: 'notes', required: false },
        ],
      }),
    ).toContain('Answer: use a unique field name.');
  });
  it('names every custom field in order, with its guidance and choices', () => {
    const rendered = renderFormat(custom);
    expect(rendered).toMatchObject({ join: 'after-build', sep: '\n\n' });
    expect(rendered.text).toContain('Return JSON ONLY');
    expect(rendered.text.indexOf('"answer"')).toBeLessThan(rendered.text.indexOf('"points"'));
    expect(rendered.text).toContain('Keep');
    expect(rendered.text).toContain('Change');
  });
  it('strict schemas require optional fields as nullable values', () => {
    const schema = toJsonSchema(custom, { dialect: 'openai-strict' });
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['answer', 'points', 'decision']);
    expect(schema.properties['points']).toMatchObject({
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
    });
    expect(schema.properties['decision']).toMatchObject({
      anyOf: [{ type: 'string', enum: ['Keep', 'Change'] }, { type: 'null' }],
    });
  });
  it('Anthropic omits unsupported ranges and length constraints', () => {
    const schema = toJsonSchema(answerSpecFor('translate'), { dialect: 'anthropic' });
    expect(schema.properties['confidence']).not.toHaveProperty('minimum');
    expect(schema.properties['detectedDetail']).not.toHaveProperty('maxLength');
    expect(schema.additionalProperties).toBe(false);
  });
  it.each(['gemini', 'gemini-legacy'] as const)(
    '%s omits unsupported string lengths',
    (dialect) => {
      const schema = toJsonSchema(answerSpecFor('translate'), { dialect });
      expect(schema.properties['detectedDetail']).not.toHaveProperty('maxLength');
    },
  );
  it('schema bytes are stable and do not depend on a request language', () => {
    expect(JSON.stringify(toJsonSchema(custom))).toBe(JSON.stringify(toJsonSchema(custom)));
    expect(toJsonSchema(custom).required).toEqual(['answer']);
  });
});
