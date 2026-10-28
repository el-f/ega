import * as v from 'valibot';
import { META_KEYS, type AnswerField } from '@/shared/answer/spec';
import { fieldKey } from '@/shared/answer/field-key';
import { storedAnswerV1Schema } from '@/shared/custom-answer-schema';

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
    else if (names.filter((n) => n === name).length > 1) error.name = 'Two fields have this name';
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

const KINDS = ['text', 'list', 'score', 'yesno', 'choice', 'language', 'languages'] as const;
const ROLES = ['main', 'notes', 'details', 'hidden'] as const;
const isOneOf = <T extends string>(list: readonly T[], x: unknown): x is T =>
  (list as readonly unknown[]).includes(x);

/** Saved fields the stored-row check refused, with each bad key rebuilt from its name; null when none can be the answer. */
export function repairStoredFields(raw: unknown): AnswerField[] | null {
  if (!Array.isArray(raw)) return null;
  const fields: AnswerField[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const f = item as Record<string, unknown>;
    const label = typeof f['label'] === 'string' ? f['label'].trim() : '';
    const { kind, role } = f;
    if (!label || label.length > 40 || !isOneOf(KINDS, kind) || !isOneOf(ROLES, role)) continue;
    const choices = Array.isArray(f['choices'])
      ? f['choices'].filter((c): c is string => typeof c === 'string' && c.trim() !== '')
      : [];
    if (kind === 'choice' && choices.length < 2) continue;
    const guide = f['guide'];
    const field: AnswerField = {
      key: typeof f['key'] === 'string' ? f['key'] : '',
      label,
      kind,
      role,
      required: role === 'main' || f['required'] === true,
      ...(typeof guide === 'string' && guide.length <= 200 && !/[\r\n]/.test(guide)
        ? { guide }
        : {}),
      ...(kind === 'choice' ? { choices: choices.slice(0, 12) } : {}),
    };
    if (fields.some((x) => x.label.toLowerCase() === label.toLowerCase())) continue;
    const keys = [...fields.map((x) => x.key), field.key];
    fields.push(
      readable(field, keys)
        ? field
        : {
            ...field,
            key: fieldKey(
              label,
              fields.map((x) => x.key),
            ),
          },
    );
  }
  const mains = fields.filter((f) => f.role === 'main');
  if (mains.length !== 1) return null;
  const ordered = [...mains, ...fields.filter((f) => f.role !== 'main')].slice(0, 8);
  return v.is(storedAnswerV1Schema, { v: 1, fields: ordered }) ? ordered : null;
}
