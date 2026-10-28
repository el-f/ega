import type { PromptTemplate } from '@/shared/types';
import { META_KEYS, type AnswerField } from '@/shared/answer/spec';
import { FORMAT_MARKER, type AnswerFormat } from '@/shared/answer/formats-v1';
import { stripStandardFormat } from '@/shared/prompts';
import { fieldKey } from '@/shared/answer/field-key';

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
  const guide = words.length <= 200 ? words : words.slice(0, cut > 0 ? cut : 200);
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
    const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return (words[0] ?? '').toUpperCase() + words.slice(1).toLowerCase();
  };
  // Ega's own main keys stay the answer; otherwise the prompt's first key is, unless Ega keeps it for notes.
  const at = own.keys.findIndex((key) => key === 'answer' || key === 'translation');
  const mainAt = at < 0 ? 0 : at;
  const taken: string[] = [];
  const fields = own.keys.map((key, i): AnswerField => {
    const main = i === mainAt;
    const name = main && at >= 0 ? 'Answer' : label(key);
    const field: AnswerField = {
      key: main ? (at >= 0 || key === 'explain' ? 'answer' : key) : fieldKey(key, taken),
      label: name,
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
  const standard = stripStandardFormat(prompt.system, format);
  if (standard !== null) return { ...prompt, system: standard };
  const own = embedsOwnFormat(prompt);
  if (own !== null) return convertOwnFormat(prompt, own)?.prompt ?? 'empty';
  return prompt.system.includes(FORMAT_MARKER) ? 'empty' : null;
}
