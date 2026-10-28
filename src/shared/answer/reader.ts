import * as v from 'valibot';
import { answerDetailText } from '../answer-presentation';
import { sameName, type AnswerField, type AnswerSpec } from './spec';
import { createStringValueScan, parseLenientSpan, parseJsonResponse } from './legacy-reader';

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
      via: 'json' | 'repaired' | 'prose';
    }
  | { kind: 'error'; code: 'PARSE' | 'EMPTY'; raw: string };

const ALIASES = ['translation', 'answer', 'result', 'output', 'text', 'response'];
// Hebrew vowel points and cantillation marks; letters, maqaf, paseq, sof pasuq and geresh/gershayim stay.
const HEBREW_POINTS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
export const hasHebrewPoints = (text: string): boolean => text.search(HEBREW_POINTS) !== -1;
const dropPoints = (text: string): string => text.replace(HEBREW_POINTS, '');

/** `dropHebrewPoints` strips the points from the main answer, for a model that adds them unasked. */
export interface ReadAnswerOptions {
  explain?: boolean;
  dropHebrewPoints?: boolean;
}
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** A detected language is a short label; the popup handoff drops longer ids too. */
const DETECTED_ID_MAX = 128;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type Envelope = { value: Record<string, unknown>; repaired: boolean };

/** An object with the main key counts when it opens or ends the text, any other only as the whole text; 'prose': text follows it. */
function envelope(raw: string, spec: AnswerSpec): Envelope | 'prose' | undefined {
  const lead = raw.length - raw.trimStart().length;
  // The repair skips text before the first brace, so only a candidate that opens with a bracket can be the whole text.
  const candidates = [{ text: raw.trim(), at: lead, leading: /^\s*[[{]/.test(raw) }];
  const fence = /```(?:json)?([\s\S]*?)```/i.exec(raw);
  if (fence?.[1]) {
    const body = fence[1];
    const at = fence.index + fence[0].length - 3 - body.trimStart().length;
    candidates.unshift({
      text: body.trim(),
      at,
      leading: fence.index === lead && /^\s*[[{]/.test(body),
    });
  }
  const last = raw.lastIndexOf('}');
  const mainKey = spec.fields.find((f) => f.role === 'main')?.key ?? 'translation';
  const keys = [...spec.fields.map((f) => f.key), ...ALIASES];
  // The first brace can belong to a prose preamble. Try later keyed objects too, with a bounded work budget.
  let tried = 0;
  for (
    let at = raw.indexOf('{');
    at >= 0 && at < last && tried < 32;
    at = raw.indexOf('{', at + 1)
  ) {
    candidates.push({ text: raw.slice(at, last + 1), at, leading: at === lead });
    tried++;
  }
  let first: Envelope | undefined;
  let openedProse = false;
  for (const candidate of candidates) {
    try {
      const span = parseLenientSpan(candidate.text);
      let value = span.value;
      if (Array.isArray(value) && value.length === 1) value = value[0];
      if (!record(value)) continue;
      const result = { value, repaired: span.repaired };
      const has = (k: string) =>
        Object.keys(value).some((key) => key.toLowerCase() === k.toLowerCase());
      // Only a closing bracket or fence may follow the whole-text envelope.
      const ends = /^\s*(?:\]\s*)?(?:```\s*)?$/.test(raw.slice(candidate.at + span.end));
      if (has(mainKey)) {
        if (candidate.leading || ends) return result;
        // A keyed object inside running prose is a quote, not the answer.
        openedProse = true;
      }
      if (!candidate.leading) continue;
      if (!ends) {
        openedProse = true;
        continue;
      }
      if (keys.some(has)) return result;
      first ??= result;
    } catch {
      /* Another candidate may contain the actual envelope. */
    }
  }
  return first ?? (openedProse ? 'prose' : undefined);
}

/** A main string that is itself exactly one JSON object; never repaired, since the outer parse already succeeded. */
function encodedObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text.trim());
    return record(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function matchedKey(object: Record<string, unknown>, key: string): string | undefined {
  return Object.hasOwn(object, key)
    ? key
    : Object.keys(object).find((k) => k.toLowerCase() === key.toLowerCase());
}

/** Each non-main field's key in the object: its own key in any case, else one free key named like its label. */
function fieldKeys(
  spec: AnswerSpec,
  object: Record<string, unknown>,
  mainKey: string | undefined,
): { keys: Map<string, string>; issues: string[] } {
  const others = spec.fields.filter((f) => f.role !== 'main');
  const keys = new Map<string, string>();
  for (const field of others) {
    const key = matchedKey(object, field.key);
    if (key !== undefined) keys.set(field.key, key);
  }
  const taken = new Set([...keys.values(), ...(mainKey === undefined ? [] : [mainKey])]);
  const issues: string[] = [];
  for (const field of others) {
    if (keys.has(field.key)) continue;
    const key = Object.keys(object).find(
      (k) => !taken.has(k) && !UNSAFE_KEYS.has(k) && sameName(k, field.label),
    );
    if (key === undefined) continue;
    keys.set(field.key, key);
    taken.add(key);
    issues.push(`Read ${field.label} from "${key}".`);
  }
  return { keys, issues };
}

function normalized(field: AnswerField, raw: unknown): { value?: unknown; issue?: string } {
  if (raw === null || raw === undefined) return {};
  // A blank note or language is a field the model left empty, not a value to show.
  if (
    typeof raw === 'string' &&
    !raw.trim() &&
    field.role !== 'main' &&
    (field.kind === 'text' || field.kind === 'language')
  )
    return {};
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
      // Strict schemas make the model send every key, so an empty list means none.
      if (value.length === 0) return {};
      value = value.flatMap((entry) => {
        if (typeof entry === 'string' && entry)
          return entry.length <= DETECTED_ID_MAX ? [{ id: entry }] : [];
        if (
          !record(entry) ||
          typeof entry['id'] !== 'string' ||
          !entry['id'] ||
          entry['id'].length > DETECTED_ID_MAX
        )
          return [];
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
              : v.pipe(
                  v.string(),
                  v.maxLength(
                    field.maxChars ??
                      (field.kind === 'language' ? DETECTED_ID_MAX : Number.MAX_SAFE_INTEGER),
                  ),
                );
  if (v.safeParse(schema, value).success) return { value };
  // The main answer is never dropped for its length.
  if (
    field.role === 'main' &&
    typeof value === 'string' &&
    field.maxChars !== undefined &&
    value.length > field.maxChars
  )
    return { value, issue: `${field.label}: longer than ${field.maxChars} characters.` };
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
  options: ReadAnswerOptions = {},
): ReadAnswerResult {
  if (!raw.trim()) return { kind: 'error', code: 'EMPTY', raw };
  const mainField = spec.fields.find((f) => f.role === 'main');
  if (!mainField) return { kind: 'error', code: 'PARSE', raw };
  const found = envelope(raw, spec);
  let object = typeof found === 'object' ? found.value : undefined;
  let via: Extract<ReadAnswerResult, { kind: 'ok' }>['via'] =
    typeof found === 'object' && found.repaired ? 'repaired' : 'json';
  if (!object) {
    // A main key with no envelope that parses is a cut or broken answer, never a finished one.
    if (
      found !== 'prose' &&
      (createStringValueScan(mainField.key).feed(raw) !== null ||
        /^\s*[[{]/.test(raw) ||
        /^\s*```json\b/i.test(raw))
    )
      return { kind: 'error', code: 'PARSE', raw };
    object = { [mainField.key]: raw.trim() };
    via = 'prose';
  }
  const current = object;
  let mainKey = matchedKey(current, mainField.key);
  const taken = new Set(fieldKeys(spec, current, mainKey).keys.values());
  const issues: string[] = [];
  if (mainKey === undefined) {
    mainKey = ALIASES.map((alias) => matchedKey(current, alias)).find(
      (key) => key !== undefined && !taken.has(key),
    );
    if (mainKey !== undefined)
      issues.push(`Read the answer from "${mainKey}" instead of "${mainField.key}".`);
  }
  if (mainKey === undefined) {
    const unclaimed = Object.keys(current).filter(
      (key) => !taken.has(key) && !UNSAFE_KEYS.has(key) && typeof current[key] === 'string',
    );
    if (unclaimed.length === 1) {
      mainKey = unclaimed[0];
      issues.push('Used the only unclaimed text field as the answer.');
    }
  }
  // Models sometimes double-encode their whole envelope in the main string. A main next to its own fields is the answer itself (JSON text).
  const outer = object;
  const mainRaw = mainKey === undefined ? undefined : outer[mainKey];
  const encoded = typeof mainRaw === 'string' ? encodedObject(mainRaw) : undefined;
  if (
    mainKey !== undefined &&
    encoded !== undefined &&
    Object.hasOwn(encoded, mainField.key) &&
    !spec.fields.some((f) => f.role !== 'main' && matchedKey(outer, f.key) !== undefined)
  ) {
    const { [mainKey]: _encoded, ...rest } = outer;
    object = { ...encoded, ...rest };
    mainKey = mainField.key;
    issues.push('Unwrapped an answer encoded inside the main field.');
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
  if (mainValue.issue) issues.push(mainValue.issue);
  const resolved = fieldKeys(spec, object, mainKey);
  issues.push(...resolved.issues);
  const mainOut: unknown =
    options.dropHebrewPoints && typeof mainValue.value === 'string'
      ? dropPoints(mainValue.value)
      : mainValue.value;
  const main = Array.isArray(mainOut) ? mainOut.join('\n') : String(mainOut);
  const fields: Record<string, unknown> = { [mainField.key]: mainOut };
  const notes: AnswerNote[] = [];
  const details: AnswerDetail[] = [];
  const used = new Set<string>(mainKey === undefined ? [] : [mainKey]);
  for (const field of spec.fields) {
    if (field.role === 'main') continue;
    const key = resolved.keys.get(field.key);
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
          : { text: answerDetailText(parsed.value, field.kind) }),
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
  options: ReadAnswerOptions = {},
): {
  push: (delta: string) => { text: string; replace?: true } | undefined;
  finish: () => ReadAnswerResult;
} {
  let raw = '';
  let visible = '';
  // A keyed object the full read called a quote in prose: the live text stops following its value.
  let quoted = false;
  // A keyed object after prose was read as the answer; text after it can still make it a quote.
  let mayQuote = false;
  const mainKey = spec.fields.find((f) => f.role === 'main')?.key ?? 'translation';
  const scanner = createStringValueScan(mainKey);
  // Bracket depth outside JSON strings, read once per character.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let openedAt = -1;
  let read = 0;
  const objectStart = /[[{]\s*(?:["[{]|$)/y;
  /** True when a top-level object or list closed in the new text. */
  function track(): boolean {
    let closed = false;
    for (; read < raw.length; read++) {
      const ch = raw[read];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = depth > 0;
      else if (ch === '{' || ch === '[') {
        if (depth++ === 0) openedAt = read;
      } else if ((ch === '}' || ch === ']') && depth > 0 && --depth === 0) closed = true;
    }
    return closed;
  }
  return {
    push(delta) {
      raw += delta;
      const partial = scanner.feed(raw);
      const closed = track();
      // Hold an object opened after prose until its main key arrives or it closes, so no envelope flashes.
      objectStart.lastIndex = openedAt;
      const pendingEnvelope = depth > 0 && objectStart.test(raw);
      const framed = /^\s*[[{]/.test(raw);
      const openingFence = /^\s*```/.test(raw) || /^\s*`{1,2}\s*$/.test(raw);
      let next =
        (quoted ? null : partial) ??
        (framed || openingFence ? '' : pendingEnvelope ? visible : raw);
      // A full read re-parses the whole answer, so it runs only when the envelope or a leading fence closes.
      const fenceClosed =
        openingFence && raw.slice(-16).trimEnd().endsWith('```') && !/^\s*`{1,3}\s*$/.test(raw);
      const textAfter = mayQuote && depth === 0 && /\S/.test(delta);
      if ((closed && (framed || partial !== null)) || fenceClosed || textAfter) {
        const answer = readAnswer(spec, raw, options);
        if (answer.kind === 'ok') {
          next = answer.main;
          quoted = answer.via === 'prose';
          mayQuote = !framed && !openingFence && !quoted;
        }
      }
      // The canonical v1 scanner tolerates half-arrived Unicode and quotes exactly as before.
      if (mainKey === 'translation' && partial === null && next === '' && closed)
        next = parseJsonResponse(raw).translation;
      if (options.dropHebrewPoints) next = dropPoints(next);
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
