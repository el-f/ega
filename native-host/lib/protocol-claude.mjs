// Adapter: ega's normalized {system, user} ↔ claude `--input-format stream-json`.

// Page text can carry injected instructions, so the child gets no tools: `--tools ""` also strips the MCP tools `--strict-mcp-config` leaves. Needs claude >= 2.x.
export const CLAUDE_SAFETY_ARGS = ['--tools', '', '--strict-mcp-config', '--setting-sources', ''];

export const CLAUDE_SPAWN_ARGS = [
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  ...CLAUDE_SAFETY_ARGS,
];

/**
 * @param {{ system?: string, user: string }} prompt
 * @returns {string} single NDJSON line, no trailing newline
 */
export function encodeClaudePrompt({ system, user }) {
  const content = system ? `${system}\n\n${user}` : user;
  return JSON.stringify({ type: 'user', message: { role: 'user', content } });
}

/**
 * `auth-retry` is not a terminal: the CLI retries the turn, and the caller decides when to give up.
 * @typedef {{ kind: 'delta', text: string } | { kind: 'done' } | { kind: 'error', message: string } | { kind: 'auth-retry', message: string }} ClaudeEvent
 */

/**
 * Convert one parsed JSONL frame into an ega event. Noise and unknown shapes return `null`; the caller drops those.
 * @param {any} j
 * @returns {ClaudeEvent | null}
 */
export function parseClaudeFrame(j) {
  if (!j || typeof j !== 'object') return null;
  if (j.type === 'rate_limit_event') return null;
  if (j.type === 'system') {
    if (j.subtype === 'error') {
      return { kind: 'error', message: String(j.message ?? 'system error') };
    }
    if (j.subtype === 'api_retry' && (j.error_status === 401 || j.error_status === 403)) {
      return {
        kind: 'auth-retry',
        message: `The claude CLI login or API key was rejected (HTTP ${j.error_status}). Run claude in a terminal and log in again.`,
      };
    }
    return null;
  }
  // A failed request comes back as a synthetic assistant turn whose text is the error; the result frame carries it.
  if (j.type === 'assistant' && typeof j.error === 'string') return null;
  if (j.type === 'assistant' && Array.isArray(j.message?.content)) {
    const text = j.message.content
      .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('');
    return text ? { kind: 'delta', text } : null;
  }
  if (j.type === 'result') {
    // claude 2.x reports a failed login or a bad key as a `success` result with `is_error` set.
    if (j.subtype === 'success' && j.is_error !== true) return { kind: 'done' };
    const message =
      (j.error && typeof j.error.message === 'string' && j.error.message) ||
      (typeof j.result === 'string' && j.result) ||
      (typeof j.message === 'string' && j.message) ||
      (typeof j.subtype === 'string' && j.subtype !== 'success' && j.subtype) ||
      'unknown result error';
    return { kind: 'error', message };
  }
  return null;
}

/**
 * @param {any} j
 * @returns {boolean} true when an assistant frame carries a tool_use block
 */
export function claudeFrameHasToolUse(j) {
  return (
    j?.type === 'assistant' &&
    Array.isArray(j.message?.content) &&
    j.message.content.some((c) => c?.type === 'tool_use')
  );
}
