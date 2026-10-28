import { describe, expect, it } from 'vitest';
import { ALL_TASKS } from '@/shared/task-prompts';
import {
  answerSpecFor,
  CUSTOM_PRESETS,
  validateSpec,
  type AnswerField,
  type AnswerSpec,
} from '@/shared/answer/spec';
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
  it.each(['summarize', 'reword', 'grammar', 'suggest-replies', 'ask'])(
    '%s reads its main answer from "answer" under spec version 2',
    (task) => {
      const spec = answerSpecFor(task);
      expect(spec.version).toBe(2);
      expect(spec.fields.find((f) => f.role === 'main')?.key).toBe('answer');
      expect(spec.pinned?.sep).toBe('\n');
    },
  );
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
  it('keeps the built-in metadata keys out of custom fields', () => {
    const extra = (field: Partial<AnswerSpec['fields'][number]>) => ({
      ...custom,
      fields: [
        main,
        { key: 'note', label: 'Note', kind: 'text', role: 'notes', required: false, ...field },
      ] as AnswerSpec['fields'],
    });
    for (const key of ['confidence', 'detectedLang', 'detectedDetail', 'detectedLangs'])
      expect(validateSpec(extra({ key }))).toContain(
        'Note: Ega uses this name itself; rename this field.',
      );
    // The card preset's notes field: tasks seeded from it keep working.
    expect(validateSpec(extra({ key: 'explain' }))).toEqual([]);
    for (const field of [{ role: 'hidden' }, { role: 'details' }, { kind: 'list' }] as const)
      expect(validateSpec(extra({ key: 'explain', ...field }))).toContain(
        'Note: this field must stay Text, shown in Notes.',
      );
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

describe('problems shown under a field', () => {
  it('use the words the editor shows, never JSON, key or spec jargon', () => {
    const bad: AnswerField[] = [
      { ...main, key: '1answer', label: 'a'.repeat(41), guide: 'a\nb', maxChars: 0 },
      { key: 'confidence', label: 'Score', kind: 'score', role: 'meta', required: false },
      { key: 'explain', label: 'Why', kind: 'list', role: 'notes', required: false },
      {
        key: 'pick',
        label: 'Pick',
        kind: 'choice',
        role: 'notes',
        required: false,
        when: 'explain',
      },
      { key: 'pick', label: 'pick', kind: 'text', role: 'main', required: false },
    ];
    const issues = [
      ...validateSpec({ ...custom, version: 0, fields: bad }),
      ...validateSpec({ ...custom, fields: Array.from({ length: 9 }, () => main) }),
    ];
    expect(issues.length).toBeGreaterThanOrEqual(12);
    for (const issue of issues)
      expect(issue).not.toMatch(
        /JSON|\bkey\b|\bspec\b|metadata|conditional|label|guidance|distinct/i,
      );
  });
});

// The pinned text is what the model reads and the fields are what the reader and schema use, so they must agree.
describe('pinned formats agree with their fields', () => {
  const named = (text: string) =>
    [...text.matchAll(/"(\w+)"(\??):/g)].map((m) => ({ key: m[1], optional: m[2] === '?' }));
  it.each([...ALL_TASKS, 'ocr'])('%s names its keys, its optional ones and every guide', (task) => {
    const spec = answerSpecFor(task);
    const text = spec.pinned?.text ?? '';
    const asked = spec.fields.filter((f) => f.when !== 'explain');
    expect(named(text)).toEqual(asked.map((f) => ({ key: f.key, optional: !f.required })));
    for (const f of spec.fields) if (f.guide) expect(text, f.key).toContain(f.guide);
    if (spec.fields.some((f) => f.when === 'explain')) expect(text).toContain('{{explainField}}');
  });
  it.each(Object.keys(CUSTOM_PRESETS))('%s names its keys and every guide', (preset) => {
    const spec = CUSTOM_PRESETS[preset as keyof typeof CUSTOM_PRESETS];
    const text = spec.pinned?.text ?? '';
    expect(named(text).map((n) => n.key)).toEqual(spec.fields.map((f) => f.key));
    for (const f of spec.fields) expect(text, f.key).toContain(f.guide);
  });
});

describe('generated formats and provider schemas', () => {
  it('describes each schema field with its guide, else its name', () => {
    const schema = toJsonSchema(
      { ...custom, fields: [{ ...main, guide: 'The reply to send' }, ...custom.fields.slice(1)] },
      { dialect: 'openai-strict' },
    );
    expect(schema.properties['answer']?.description).toBe('The reply to send');
    expect(schema.properties['points']).toMatchObject({
      anyOf: [{ description: 'Key points' }, { type: 'null' }],
    });
    for (const task of [...ALL_TASKS, 'ocr'])
      for (const [key, property] of Object.entries(toJsonSchema(answerSpecFor(task)).properties))
        expect(property.description, `${task}.${key}`).toBeTruthy();
  });
  it('names duplicate custom field labels before attempting to save or preview', () => {
    expect(
      validateSpec({
        ...custom,
        fields: [
          main,
          { key: 'note', label: main.label, kind: 'text', role: 'notes', required: false },
        ],
      }),
    ).toContain('Answer: two fields have this name.');
  });
  it('names every custom field in order, with its guidance and choices', () => {
    const rendered = renderFormat(custom);
    expect(rendered).toMatchObject({ join: 'after-build', sep: '\n\n' });
    expect(rendered.text).toContain('Return JSON ONLY');
    expect(rendered.text.indexOf('"answer"')).toBeLessThan(rendered.text.indexOf('"points"'));
    expect(rendered.text).toContain('Keep');
    expect(rendered.text).toContain('Change');
  });
  it('adds a field line only when it says more than the key, and never a doubled period', () => {
    const rendered = renderFormat({
      ...custom,
      fields: [
        { ...main, guide: 'The reply to send.' },
        { key: 'points', label: 'Points', kind: 'list', role: 'notes', required: false },
        {
          key: 'field3',
          label: 'Sarcastic',
          kind: 'yesno',
          role: 'details',
          required: false,
          guide: ' ',
        },
        {
          key: 'decision',
          label: 'Decision',
          kind: 'choice',
          role: 'details',
          required: true,
          choices: ['Keep', 'Change'],
        },
        { key: 'title', label: 'Title', kind: 'text', role: 'notes', required: true, maxChars: 60 },
      ],
    });
    expect(rendered.text.split('\n')).toEqual([
      'Return JSON ONLY: {"answer": <string>, "points"?: <array of strings>, "field3"?: <boolean>, "decision": <"Keep" or "Change">, "title": <string>}.',
      '"answer" (Answer): The reply to send.',
      '"field3" (Sarcastic): boolean.',
      '"decision" (Decision): "Keep" or "Change".',
      '"title" (Title): at most 60 characters.',
      'A "?" after a key marks an optional field: leave it out when it does not apply.',
    ]);
  });
  it('a preset switched to own fields keeps its rules', () => {
    const { pinned: _pinned, ...fields } = CUSTOM_PRESETS['answer-notes'];
    const text = renderFormat(fields).text;
    expect(text).toContain('"answer" (Answer): your answer.');
    expect(text).toContain('"explain" (Notes): short notes.');
    expect(text).toContain('leave it out when it does not apply');
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
  it('strict schemas leave out length limits that some strict providers reject', () => {
    const schema = toJsonSchema(answerSpecFor('translate'), { dialect: 'openai-strict' });
    expect(JSON.stringify(schema.properties['detectedDetail'])).not.toContain('maxLength');
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
