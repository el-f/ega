import type { AnswerField } from './answer/spec';

/** Presentation only: surfaces never parse a provider's response. */
export function mainAnswerItems(answer: unknown): string[] | undefined {
  if (typeof answer !== 'object' || answer === null || !('spec' in answer)) return undefined;
  const spec = answer.spec;
  if (
    typeof spec !== 'object' ||
    spec === null ||
    !('fields' in spec) ||
    !Array.isArray(spec.fields)
  )
    return undefined;
  const main: unknown = spec.fields.find(
    (field: unknown) =>
      typeof field === 'object' && field !== null && 'role' in field && field.role === 'main',
  );
  if (
    typeof main !== 'object' ||
    main === null ||
    !('kind' in main) ||
    main.kind !== 'list' ||
    !('key' in main) ||
    typeof main.key !== 'string' ||
    !('fields' in answer) ||
    typeof answer.fields !== 'object' ||
    answer.fields === null
  )
    return undefined;
  const value: unknown = (answer.fields as Record<string, unknown>)[main.key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

export function answerDetailText(value: unknown, kind?: AnswerField['kind']): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  if (typeof value === 'number')
    return kind === 'score' ? `${Math.round(value * 100)}%` : String(value);
  if (value === undefined) return '';
  return JSON.stringify(value);
}
