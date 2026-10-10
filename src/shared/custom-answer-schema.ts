import * as v from 'valibot';

/** Stored custom fields stay independent of shipped prompt text. */
export const customAnswerFieldSchema = v.looseObject({
  key: v.pipe(
    v.string(),
    v.regex(/^[a-z]\w{0,31}$/),
    v.check((key) => !['constructor', 'prototype', '__proto__'].includes(key)),
  ),
  label: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(40),
    v.check((label) => label.trim().length > 0),
  ),
  kind: v.picklist(['text', 'list', 'score', 'yesno', 'choice', 'language', 'languages']),
  role: v.picklist(['main', 'notes', 'details', 'hidden']),
  required: v.boolean(),
  guide: v.exactOptional(v.pipe(v.string(), v.maxLength(200), v.regex(/^[^\r\n]*$/))),
  choices: v.exactOptional(
    v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(2), v.maxLength(12)),
  ),
  maxChars: v.exactOptional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

const fieldsSchema = v.pipe(
  v.array(customAnswerFieldSchema),
  v.minLength(1),
  v.maxLength(8),
  v.check((fields) => {
    const mains = fields.filter((f) => f.role === 'main');
    return (
      mains.length === 1 &&
      mains[0]?.required === true &&
      ['text', 'list'].includes(mains[0].kind) &&
      new Set(fields.map((f) => f.key)).size === fields.length &&
      new Set(fields.map((f) => f.label.trim().toLowerCase())).size === fields.length &&
      fields.every(
        (f) =>
          f.kind !== 'choice' ||
          (f.choices !== undefined &&
            f.choices.every((c) => c.trim().length > 0) &&
            new Set(f.choices.map((c) => c.toLowerCase())).size === f.choices.length),
      )
    );
  }, 'Each answer needs one main field, unique names and keys, and distinct choices.'),
);

export const storedAnswerV1Schema = v.pipe(
  v.looseObject({
    v: v.literal(1),
    preset: v.exactOptional(v.picklist(['answer-only', 'answer-notes'])),
    fields: v.exactOptional(fieldsSchema),
  }),
  v.check(
    (answer) => (answer.preset !== undefined) !== (answer.fields !== undefined),
    'Choose a preset or your own fields.',
  ),
);

/** A newer version survives this build's edits and runs with its legacy output fallback. */
export const storedAnswerSpecSchema = v.union([
  storedAnswerV1Schema,
  v.looseObject({ v: v.pipe(v.number(), v.integer(), v.minValue(2)) }),
]);
export type StoredAnswerSpec = v.InferOutput<typeof storedAnswerSpecSchema>;
