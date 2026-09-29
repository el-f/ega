export type ClaudeEvent =
  { kind: 'delta'; text: string } | { kind: 'done' } | { kind: 'error'; message: string };
export function parseClaudeFrame(j: unknown): ClaudeEvent | null;
export function claudeFrameHasToolUse(j: unknown): boolean;
