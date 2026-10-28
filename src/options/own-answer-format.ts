import type { PromptTemplate } from '@/shared/types';
import { META_KEYS, type AnswerField } from '@/shared/answer/spec';
import { FORMAT_MARKER, type AnswerFormat } from '@/shared/answer/formats-v1';
import { stripStandardFormat } from '@/shared/prompts';
import { fieldKey } from '@/shared/answer/field-key';
import { capText } from '@/shared/text-cap';

export interface OwnAnswerFormat {
  half: 'system' | 'user';
  start: number;
  end: number;
  keys: string[];
  /** The text after each key, as the prompt wrote it: `<two sentences>`, `string`, `["..."]`. */
  values: string[];
}

/** Conservative, sentence-local detection. Conversion never removes neighboring instructions. */
export function embedsOwnFormat(prompt: PromptTemplate): OwnAnswerFormat | null {
  for (const half of ['system', 'user'] as const) {
    const text = prompt[half];
    const match =
      /\b(?:return|respond(?: with)?|output|use|write)\s+(?:only\s+)?(?:a\s+)?JSON\b[^\n{}]{0,80}\{([^{}\n]+)\}\.?/i.exec(
        text,
      );
    if (!match) continue;
    const body = match[1] ?? '';
    const found = [...body.matchAll(/"([^"\\]+)"\s*:/g)];
    const keys = found.flatMap((m) => (m[1] ? [m[1]] : []));
    const values = found.map((m, i) =>
      body
        .slice(m.index + m[0].length, found[i + 1]?.index ?? body.length)
        .trim()
        .replace(/,$/, '')
        .trim(),
    );
    if (keys.length === 0 || keys.length > 8 || new Set(keys).size !== keys.length) continue;
    if (
      keys.some(
        (key) =>
          !/^[a-z]\w{0,31}$/.test(key) ||
          ['__proto__', 'constructor', 'prototype'].includes(key) ||
          META_KEYS.includes(key),
      )
    )
      continue;
    return { half, start: match.index, end: match.index + match[0].length, keys, values };
  }
  return null;
}

const TYPE_WORD = /^(?:string|str|text|number|boolean|bool|\.{3}|…)?$/i;

/** A value's kind, and the words that say what goes there; a bare type or "..." says nothing. */
function shapeOf(value: string): Pick<AnswerField, 'kind' | 'guide'> {
  const list = value.startsWith('[') || /\b(?:array|list)\b/i.test(value);
  const words = value
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/^"(.*)"$/, '$1')
    .replace(/^<(.*)>$/, '$1')
    .replace(/^(?:an?\s+)?(?:array|list)\s+of\s+/i, '')
    .replace(/\s+as\s+an?\s+(?:string|array|list)$/i, '')
    .trim();
  const cut = words.lastIndexOf(' ', 200);
  const guide = words.length <= 200 ? words : cut > 0 ? words.slice(0, cut) : capText(words, 200);
  return { kind: list ? 'list' : 'text', ...(TYPE_WORD.test(guide) ? {} : { guide }) };
}

/** Fields from the prompt's own keys; null when taking the format out would leave its half empty. */
export function convertOwnFormat(
  prompt: PromptTemplate,
  own: OwnAnswerFormat,
): { prompt: PromptTemplate; fields: AnswerField[] } | null {
  const rest = withoutOwnFormat(prompt, own);
  if (rest[own.half].trim() === '') return null;
  const label = (key: string): string => {
    const words = key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_+/g, ' ')
      .trim();
    return (words[0] ?? '').toUpperCase() + words.slice(1).toLowerCase();
  };
  // Names are unique and at most 40 characters, like the editor's, so the fields always save as built.
  const names: string[] = [];
  const unique = (name: string): string => {
    const free = (n: string): boolean => !names.includes(n.toLowerCase());
    let out = name.slice(0, 40).trim();
    for (let n = 2; !free(out); n++) out = `${name.slice(0, 39 - String(n).length).trim()} ${n}`;
    names.push(out.toLowerCase());
    return out;
  };
  // Ega's own main keys stay the answer; otherwise the prompt's first key is, unless Ega keeps it for notes.
  const at = own.keys.findIndex((key) => key === 'answer' || key === 'translation');
  const mainAt = at < 0 ? 0 : at;
  const taken: string[] = [];
  const fields = own.keys.map((key, i): AnswerField => {
    const main = i === mainAt;
    const field: AnswerField = {
      key: main ? (at >= 0 || key === 'explain' ? 'answer' : key) : fieldKey(key, taken),
      label: unique(main && at >= 0 ? 'Answer' : label(key)),
      ...shapeOf(own.values[i] ?? ''),
      role: main ? 'main' : 'notes',
      required: true,
    };
    taken.push(field.key);
    return field;
  });
  const main = fields[mainAt];
  return { prompt: rest, fields: main ? [main, ...fields.filter((f) => f !== main)] : fields };
}

function withoutOwnFormat(prompt: PromptTemplate, own: OwnAnswerFormat): PromptTemplate {
  const text = prompt[own.half];
  const cleaned = (text.slice(0, own.start) + text.slice(own.end))
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return { ...prompt, [own.half]: cleaned };
}

/** "Use Ega's format": the prompt without its own format; 'empty' when only the format would be left, null when Ega cannot find it. */
export function takeOutOwnFormat(
  prompt: PromptTemplate,
  format: AnswerFormat,
): PromptTemplate | 'empty' | null {
  // The sentence cut goes before the standard strip, whose fallback drops every line holding the marker.
  const exact = [format.sep + format.text, format.text].some((t) => prompt.system.includes(t));
  const own = exact ? null : embedsOwnFormat(prompt);
  if (own !== null) {
    // An edited copy of Ega's format may run on past its first sentence (Suggest replies has two).
    const text = prompt[own.half];
    const ega = text.slice(own.start).toLowerCase().startsWith(FORMAT_MARKER.toLowerCase());
    const lineEnd = text.indexOf('\n', own.end);
    const cut = ega ? { ...own, end: lineEnd < 0 ? text.length : lineEnd } : own;
    return convertOwnFormat(prompt, cut)?.prompt ?? 'empty';
  }
  const standard = stripStandardFormat(prompt.system, format);
  if (standard !== null) return { ...prompt, system: standard };
  return prompt.system.includes(FORMAT_MARKER) ? 'empty' : null;
}
