import type { PromptTemplate } from '@/shared/types';
import type { AnswerField } from '@/shared/answer/spec';

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
          !/^[a-z]\w{0,31}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key),
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
  const text = prompt[own.half];
  const cleaned = (text.slice(0, own.start) + text.slice(own.end))
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return { prompt: { ...prompt, [own.half]: cleaned }, fields };
}
