import type { AnswerSnapshot } from './types';

/** Presentation only: surfaces never parse a provider's response. */
export function mainAnswerItems(answer: AnswerSnapshot | undefined): string[] | undefined {
  const main = answer?.spec.fields.find((f) => f.role === 'main');
  if (main?.kind !== 'list') return undefined;
  const value = answer?.fields[main.key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

export function answerDetailText(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
