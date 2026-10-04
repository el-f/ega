export type ClaudeEvent =
  | { kind: 'delta'; text: string }
  | { kind: 'done' }
  | { kind: 'error'; message: string; code?: string }
  | { kind: 'restart'; message: string }
  | { kind: 'alive' };
export function parseClaudeFrame(j: unknown): ClaudeEvent | null;
export function claudeErrorCode(
  category: unknown,
  status: unknown,
  message?: string,
): string | null;
export function claudeFrameHasToolUse(j: unknown): boolean;
