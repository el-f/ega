import type { PromptTemplate } from '@/shared/types';
import { META_KEYS, type AnswerField } from '@/shared/answer/spec';
import { FORMAT_MARKER, type AnswerFormat } from '@/shared/answer/formats-v1';
import { stripStandardFormat } from '@/shared/prompts';

export interface OwnAnswerFormat {
  half: 'system' | 'user';
  start: number;
  end: number;
  keys: string[];
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
    const keys = [...(match[1] ?? '').matchAll(/"([^"\\]+)"\s*:/g)].flatMap((m) =>
      m[1] ? [m[1]] : [],
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
    // One main plus up to seven notes; answer/translation is already the main field.
    if (keys.filter((key) => key !== 'answer' && key !== 'translation').length > 7) continue;
    return { half, start: match.index, end: match.index + match[0].length, keys };
  }
  return null;
}

export function convertOwnFormat(
  prompt: PromptTemplate,
  own: OwnAnswerFormat,
): { prompt: PromptTemplate; fields: AnswerField[] } {
  const label = (key: string): string => {
    const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return (words[0] ?? '').toUpperCase() + words.slice(1).toLowerCase();
  };
  const fields: AnswerField[] = [
    { key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true },
    ...own.keys
      .filter((key) => key !== 'answer' && key !== 'translation')
      .map((key): AnswerField => ({
        key,
        label: label(key),
        kind: 'text',
        role: 'notes',
        required: false,
      })),
  ];
  return { prompt: withoutOwnFormat(prompt, own), fields };
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
  if (own !== null) {
    const rest = withoutOwnFormat(prompt, own);
    return rest[own.half].trim() === '' ? 'empty' : rest;
  }
  return prompt.system.includes(FORMAT_MARKER) ? 'empty' : null;
}
