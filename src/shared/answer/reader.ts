import * as v from 'valibot';
import type { AnswerField, AnswerSpec } from './spec';
import {
  createStringValueScan,
  lastNonBlank,
  parseLenient,
  parseJsonResponse,
} from './legacy-reader';

export interface AnswerNote {
  key: string;
  label: string;
  text?: string;
  items?: string[];
}
export interface AnswerDetail {
  key: string;
  label: string;
  value: unknown;
}
export type ReadAnswerResult =
  | {
      kind: 'ok';
      main: string;
      fields: Record<string, unknown>;
      notes: AnswerNote[];
      details: AnswerDetail[];
      issues: string[];
      via: 'json' | 'repaired' | 'prose' | 'partial';
    }
  | { kind: 'error'; code: 'PARSE' | 'EMPTY'; raw: string };

const ALIASES = ['translation', 'answer', 'result', 'output', 'text', 'response'];
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function envelope(
  raw: string,
  spec: AnswerSpec,
): { value: Record<string, unknown>; repaired: boolean } | undefined {
  const candidates = [raw.trim()];
  const fence = /```(?:json)?([\s\S]*?)```/i.exec(raw);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const last = raw.lastIndexOf('}');
  const keys = [...spec.fields.map((f) => f.key), ...ALIASES];
  // The first brace can belong to a prose preamble. Try later keyed objects too, with a bounded work budget.
  let tried = 0;
  for (
    let at = raw.indexOf('{');
    at >= 0 && at < last && tried < 32;
    at = raw.indexOf('{', at + 1)
  ) {
    candidates.push(raw.slice(at, last + 1));
    tried++;
  }
  let first: { value: Record<string, unknown>; repaired: boolean } | undefined;
  for (const candidate of candidates) {
    try {
      let value = parseLenient(candidate);
      if (Array.isArray(value) && value.length === 1) value = value[0];
      if (!record(value)) continue;
      const result = { value, repaired: false };
      try {
        JSON.parse(candidate);
      } catch {
        result.repaired = true;
      }
      first ??= result;
      if (Object.keys(value).some((key) => keys.some((k) => k.toLowerCase() === key.toLowerCase())))
        return result;
    } catch {
      /* Another candidate may contain the actual envelope. */
    }
  }
  return first;
}

function matchedKey(object: Record<string, unknown>, key: string): string | undefined {
  return Object.hasOwn(object, key)
    ? key
    : Object.keys(object).find((k) => k.toLowerCase() === key.toLowerCase());
}

function normalized(field: AnswerField, raw: unknown): { value?: unknown; issue?: string } {
  if (raw === null || raw === undefined) return {};
  let value = raw;
  switch (field.kind) {
    case 'text':
    case 'language':
      if (Array.isArray(value) && value.every((x) => typeof x === 'string'))
        value = value.join('\n');
      break;
    case 'list':
      if (typeof value === 'string')
        value = value
          .split('\n')
          .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
          .filter(Boolean);
      break;
    case 'score': {
      const text = typeof value === 'string' ? value.trim() : '';
      const number =
        typeof value === 'number'
          ? value
          : text
            ? Number(text.endsWith('%') ? text.slice(0, -1) : text)
            : NaN;
      value = text.endsWith('%') || (number >= 10 && number <= 100) ? number / 100 : number;
      break;
    }
    case 'yesno':
      if (typeof value === 'string') {
        if (/^(?:yes|true)$/i.test(value.trim())) value = true;
        else if (/^(?:no|false)$/i.test(value.trim())) value = false;
      }
      break;
    case 'choice':
      if (typeof value === 'string')
        value =
          field.choices?.find((c) => c.toLowerCase() === String(value).trim().toLowerCase()) ??
          value;
      break;
    case 'languages': {
      if (!Array.isArray(value)) break;
      value = value.flatMap((entry) => {
        if (typeof entry === 'string' && entry) return [{ id: entry }];
        if (!record(entry) || typeof entry['id'] !== 'string' || !entry['id']) return [];
        const detail = entry['detail'];
        return [
          {
            id: entry['id'],
            ...(typeof detail === 'string' && detail.length > 0 && detail.length < 200
              ? { detail }
              : {}),
          },
        ];
      });
      if ((value as unknown[]).length === 0)
        return { issue: `${field.label}: no valid languages.` };
      break;
    }
  }
  const schema =
    field.kind === 'list'
      ? v.array(v.string())
      : field.kind === 'score'
        ? v.pipe(v.number(), v.minValue(0), v.maxValue(1))
        : field.kind === 'yesno'
          ? v.boolean()
          : field.kind === 'choice'
            ? v.picklist(field.choices ?? [])
            : field.kind === 'languages'
              ? v.array(v.looseObject({ id: v.string(), detail: v.exactOptional(v.string()) }))
              : v.pipe(v.string(), v.maxLength(field.maxChars ?? Number.MAX_SAFE_INTEGER));
  if (v.safeParse(schema, value).success) return { value };
  // An unexpected choice/yes-no answer remains available, with an honest issue in About this reply.
  return {
    ...(field.kind === 'choice' || field.kind === 'yesno' ? { value: raw } : {}),
    issue: `${field.label}: unexpected ${field.kind} value.`,
  };
}

/** Runs on think-scrubbed text in the worker. Invalid non-main fields never hide a usable answer. */
export function readAnswer(
  spec: AnswerSpec,
  raw: string,
  options: { explain?: boolean } = {},
): ReadAnswerResult {
  if (!raw.trim()) return { kind: 'error', code: 'EMPTY', raw };
  const mainField = spec.fields.find((f) => f.role === 'main');
  if (!mainField) return { kind: 'error', code: 'PARSE', raw };
  const found = envelope(raw, spec);
  let object = found?.value;
  let via: Extract<ReadAnswerResult, { kind: 'ok' }>['via'] = found?.repaired ? 'repaired' : 'json';
  if (!object) {
    const scanner = createStringValueScan(mainField.key);
    const partial = scanner.feed(raw);
    if (partial !== null) {
      object = { [mainField.key]: partial };
      via = 'partial';
    } else if (/^\s*[[{]/.test(raw) || /^\s*```json\b/i.test(raw))
      return { kind: 'error', code: 'PARSE', raw };
    else {
      object = { [mainField.key]: raw.trim() };
      via = 'prose';
    }
  }
  let mainKey = matchedKey(object, mainField.key);
  if (mainKey === undefined)
    for (const alias of ALIASES) {
      mainKey = matchedKey(object, alias);
      if (mainKey !== undefined) break;
    }
  const issues: string[] = [];
  if (mainKey === undefined && spec.join === 'after-build') {
    const current = object;
    const claimed = new Set(spec.fields.map((f) => matchedKey(current, f.key)));
    const unclaimed = Object.keys(current).filter(
      (key) => !claimed.has(key) && !UNSAFE_KEYS.has(key) && typeof current[key] === 'string',
    );
    if (unclaimed.length === 1) {
      mainKey = unclaimed[0];
      issues.push('Used the only unclaimed text field as the answer.');
    }
  }
  // Models sometimes double-encode their JSON in the main string. Unwrap once, never recursively.
  const encoded = mainKey === undefined ? undefined : object[mainKey];
  if (typeof encoded === 'string') {
    const nested = envelope(encoded, spec)?.value;
    if (
      nested &&
      (matchedKey(nested, mainField.key) !== undefined ||
        ALIASES.some((key) => matchedKey(nested, key) !== undefined))
    ) {
      object = { ...object, ...nested };
      mainKey =
        matchedKey(nested, mainField.key) ??
        ALIASES.map((key) => matchedKey(nested, key)).find((key) => key !== undefined);
      issues.push('Unwrapped an answer encoded inside the main field.');
    }
  }
  // The v1 Explain reader accepted a notes-only answer. Keep that documented compatibility case.
  if (
    spec.id === 'translate' &&
    (mainKey === undefined || object[mainKey] === null) &&
    typeof object['explain'] === 'string'
  ) {
    object = { ...object, [mainField.key]: '' };
    mainKey = mainField.key;
  }
  const mainValue = mainKey === undefined ? undefined : normalized(mainField, object[mainKey]);
  if (mainValue?.value === undefined) return { kind: 'error', code: 'PARSE', raw };
  const main = Array.isArray(mainValue.value)
    ? mainValue.value.join('\n')
    : String(mainValue.value);
  const fields: Record<string, unknown> = { [mainField.key]: mainValue.value };
  const notes: AnswerNote[] = [];
  const details: AnswerDetail[] = [];
  const used = new Set<string>(mainKey === undefined ? [] : [mainKey]);
  for (const field of spec.fields) {
    if (field.role === 'main') continue;
    const key = matchedKey(object, field.key);
    if (key !== undefined) used.add(key);
    const parsed = normalized(field, key === undefined ? undefined : object[key]);
    if (parsed.issue) issues.push(parsed.issue);
    if (parsed.value === undefined) {
      if (!parsed.issue && field.required && (field.when !== 'explain' || options.explain))
        issues.push(`${field.label}: field missing.`);
      continue;
    }
    fields[field.key] = parsed.value;
    if (field.role === 'notes')
      notes.push({
        key: field.key,
        label: field.label,
        ...(Array.isArray(parsed.value)
          ? { items: parsed.value as string[] }
          : { text: String(parsed.value) }),
      });
    if (field.role === 'details')
      details.push({ key: field.key, label: field.label, value: parsed.value });
  }
  if (spec.join === 'after-build')
    for (const [key, value] of Object.entries(object)) {
      if (!used.has(key) && !UNSAFE_KEYS.has(key))
        details.push({ key, label: `Other fields: ${key}`, value });
    }
  // The loose record keeps future fields available; field-specific validation above owns coercion.
  const checked = v.parse(v.looseObject({}), fields);
  return { kind: 'ok', main, fields: checked, notes, details, issues, via };
}

export function createAnswerProjector(
  spec: AnswerSpec,
  options: { explain?: boolean } = {},
): {
  push: (delta: string) => { text: string; replace?: true } | undefined;
  finish: () => ReadAnswerResult;
} {
  let raw = '';
  let visible = '';
  const mainKey = spec.fields.find((f) => f.role === 'main')?.key ?? 'translation';
  const scanner = createStringValueScan(mainKey);
  return {
    push(delta) {
      raw += delta;
      const partial = scanner.feed(raw);
      let next = partial ?? (/^\s*[[{`]/.test(raw) ? '' : raw);
      const tail = lastNonBlank(raw);
      if (tail === '}' || tail === ']' || tail === '`') {
        const answer = readAnswer(spec, raw, options);
        if (answer.kind === 'ok') next = answer.main;
      }
      // The canonical v1 scanner tolerates half-arrived Unicode and quotes exactly as before.
      if (mainKey === 'translation' && partial === null && next === '' && tail === '}')
        next = parseJsonResponse(raw).translation;
      if (next === visible) return undefined;
      const result = next.startsWith(visible)
        ? { text: next.slice(visible.length) }
        : { text: next, replace: true as const };
      visible = next;
      return result;
    },
    finish: () => readAnswer(spec, raw, options),
  };
}
