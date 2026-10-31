import type { AnswerField, AnswerSpec } from './answer/spec';

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

/** The fence a Markdown line opens: a run of three or more backticks or tildes at its start. */
export function openingFence(line: string): string | undefined {
  // A backtick in the rest of the line makes it inline code, not a block (CommonMark).
  return /^(?:`{3,}(?!.*`)|~{3,})/.exec(line.trim())?.[0];
}

/** Whether a line closes the block `fence` opened: only a run of the opening mark, at least as long. */
export function closesFence(fence: string, line: string): boolean {
  const t = line.trim();
  return t.length >= fence.length && t === (fence[0] ?? '').repeat(t.length);
}

/**
 * The code in an answer that is exactly one fenced block, closed or still arriving; null for any other answer.
 * A `settled` answer with no code line is text ("~~~ Epilog"); while streaming it may be an opener still arriving.
 */
export function soleFencedCode(answer: string, settled = false): string | null {
  const lines = answer.trim().split('\n');
  const open = lines[0] ?? '';
  const fence = openingFence(open);
  // Only a bare fence or one language tag opens code; "~~~ Part 2 ~~~" or "``` is code" is plain text.
  if (fence === undefined || !/^[\w+#.-]*$/.test(open.slice(fence.length).trim())) return null;
  const close = lines.findIndex((line, i) => i > 0 && closesFence(fence, line));
  if (close !== -1 && close !== lines.length - 1) return null;
  const code = lines.slice(1, close === -1 ? undefined : close).join('\n');
  return settled && code === '' ? null : code;
}

/** A custom task's answer shows as plain text; an answer that is one fenced block still shows as code. */
export function isPlainAnswer(spec: Pick<AnswerSpec, 'join'> | undefined, answer: string): boolean {
  return spec?.join === 'after-build' && soleFencedCode(answer, true) === null;
}

export function answerDetailText(value: unknown, kind?: AnswerField['kind']): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  if (typeof value === 'number')
    return kind === 'score' ? `${Math.round(value * 100)}%` : String(value);
  if (value === undefined) return '';
  if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    return value.join('\n');
  return JSON.stringify(value);
}
