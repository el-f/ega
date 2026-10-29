import { META_KEYS, type AnswerField } from '@/shared/answer/spec';

export interface FieldError {
  name?: string;
  choices?: string;
}

const UNSAFE = ['__proto__', 'constructor', 'prototype'];

/** A key the reader and the stored-row check accept for this field. */
export function readable(field: AnswerField, keys: readonly string[]): boolean {
  return (
    /^[a-z]\w{0,31}$/.test(field.key) &&
    !UNSAFE.includes(field.key) &&
    !META_KEYS.includes(field.key) &&
    keys.filter((k) => k === field.key).length === 1 &&
    (field.key !== 'explain' || (field.kind === 'text' && field.role === 'notes'))
  );
}

/** What each field needs before the reply can be saved, by field key, in the words shown under its input. */
export function fieldErrors(fields: readonly AnswerField[]): Map<string, FieldError> {
  const names = fields.map((f) => f.label.trim().toLowerCase());
  const keys = fields.map((f) => f.key);
  const out = new Map<string, FieldError>();
  fields.forEach((field, i) => {
    const error: FieldError = {};
    const name = names[i] ?? '';
    if (name === '') error.name = 'Add a name';
    else if (names.filter((n) => n === name).length > 1)
      error.name = 'Two fields have this name. Rename one.';
    else if (!readable(field, keys)) error.name = 'Edit the name so Ega can read this field';
    const choices = field.choices ?? [];
    if (
      field.kind === 'choice' &&
      (choices.length < 2 ||
        choices.length > 12 ||
        choices.some((c) => !c.trim()) ||
        new Set(choices.map((c) => c.toLowerCase())).size !== choices.length)
    )
      error.choices = 'Add 2 to 12 different choices';
    if (error.name !== undefined || error.choices !== undefined) out.set(field.key, error);
  });
  return out;
}
