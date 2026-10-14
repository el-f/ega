import { classifyCliError } from './classify-cli-error.mjs';

// Adapter: ega's normalized {system, user} ↔ claude `--input-format stream-json`.

// Page text can carry injected instructions: `--tools ""` drops the built-in tools and `--strict-mcp-config` with no `--mcp-config` loads no MCP server.
// --no-session-persistence keeps page text out of the CLI's on-disk transcripts.
export const CLAUDE_SAFETY_ARGS = [
  '--tools',
  '',
  '--strict-mcp-config',
  '--setting-sources',
  '',
  '--no-session-persistence',
];

// Without the first two the CLI adds the user's own memory and CLAUDE.md files to every prompt.
// Low effort: ega's tasks are short, and the CLI default (medium or higher) mostly buys thinking tokens.
export const CLAUDE_CHILD_ENV = {
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
  CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
  CLAUDE_CODE_EFFORT_LEVEL: 'low',
};

// Replaces the CLI's coding-agent prompt: a one-line haiku translation took 3378 input tokens with it, 403 without. ega's task prompt rides in each user turn.
export const CLAUDE_PROMPT_ARGS = [
  '--system-prompt',
  'You process text for a browser extension. Follow the instructions in each message exactly. Reply with the requested output only.',
];

export const CLAUDE_SPAWN_ARGS = [
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  ...CLAUDE_SAFETY_ARGS,
  ...CLAUDE_PROMPT_ARGS,
  '--include-partial-messages',
];

/**
 * @param {{ system?: string, user: string }} prompt
 * @returns {string} single NDJSON line, no trailing newline
 */
export function encodeClaudePrompt({ system, user }) {
  const content = system ? `${system}\n\n${user}` : user;
  return JSON.stringify({ type: 'user', message: { role: 'user', content } });
}

/** The same fields the Anthropic API backend reads. */
function claudeUsage(u) {
  if (!u || typeof u !== 'object') return null;
  const out = {};
  if (typeof u.input_tokens === 'number') out.inputTokens = u.input_tokens;
  if (typeof u.output_tokens === 'number') out.outputTokens = u.output_tokens;
  if (typeof u.cache_read_input_tokens === 'number')
    out.cacheReadTokens = u.cache_read_input_tokens;
  if (typeof u.cache_creation_input_tokens === 'number')
    out.cacheWriteTokens = u.cache_creation_input_tokens;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * `auth-retry` is not a terminal: the CLI retries the turn, and the caller decides when to give up.
 * `restart` ends the turn: the CLI changed text it had already streamed. `alive`: the CLI is retrying.
 * @typedef {{ kind: 'delta', text: string } | { kind: 'done', usage?: { inputTokens?: number, outputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number } } | { kind: 'error', message: string } | { kind: 'auth-retry', message: string } | { kind: 'restart', message: string } | { kind: 'alive' }} ClaudeEvent
 */

/** The CLI's typed error categories (api_retry `error`, a failed turn's synthetic assistant `error`). */
const CATEGORY_CODES = {
  authentication_failed: 'AUTH',
  oauth_org_not_allowed: 'AUTH',
  cloud_credential_error: 'AUTH',
  account_on_hold: 'AUTH',
  billing_error: 'QUOTA',
  overloaded: 'SERVER',
  server_error: 'SERVER',
  invalid_request: 'REQUEST',
  model_not_found: 'REQUEST',
  // The answer hit the output cap or the context window: the same request fails the same way again.
  max_output_tokens: 'REQUEST',
};

// The Anthropic API backend's wording, so a refusal reads the same on every backend.
const REFUSAL_MESSAGE =
  'The backend refused to answer this text. Reword it, or use another backend.';

// A plan or credit limit also arrives as rate_limit or 429, but it lasts hours, so a retry cannot help.
const HARD_LIMIT_RE =
  /you've hit your|you've reached your|out of (?:extra )?usage|usage credits?|credit limit|spend(?:ing)? limit|session limit|weekly limit|usage limit is set to|usage allocation has been disabled|disabled for your org|doesn't include (?:extra )?usage/i;

// A certificate the CLI cannot trust: it refuses to retry these itself, so ega must not either.
const CERT_FAILURE_RE =
  /SSL certificate|Self-signed certificate|SSL error \((?:CERT_|UNABLE_TO_|SELF_SIGNED|DEPTH_ZERO|ERR_TLS_CERT|HOSTNAME)/i;

/**
 * The ErrCode a failed claude turn carries, from its typed category, its HTTP status and its text; null leaves it to the text classifier.
 * @param {unknown} category @param {unknown} status @param {string} [message] @returns {string | null}
 */
export function claudeErrorCode(category, status, message = '') {
  // The CLI tags some rejected keys invalid_request, so a 401 or 403 stays AUTH whatever the category.
  if (status === 401 || status === 403) return 'AUTH';
  if (category === 'rate_limit' || status === 429) {
    return HARD_LIMIT_RE.test(message) ? 'QUOTA' : 'RATE_LIMIT';
  }
  // server_error with no HTTP status is a connection failure (offline, DNS, TLS, sleep): passing, whatever the text says.
  if (category === 'server_error' && typeof status !== 'number') {
    if (CERT_FAILURE_RE.test(message)) return 'NATIVE_SPAWN_FAIL';
    const byText = classifyCliError(message);
    return byText === 'UNKNOWN' || byText === 'REQUEST' ? 'NETWORK' : byText;
  }
  // The CLI also tags an expired login or a bad helper key invalid_request, with no status.
  if (
    category === 'invalid_request' &&
    typeof status !== 'number' &&
    classifyCliError(message) === 'AUTH'
  ) {
    return 'AUTH';
  }
  if (typeof category === 'string' && Object.hasOwn(CATEGORY_CODES, category)) {
    return CATEGORY_CODES[category];
  }
  if (typeof status !== 'number') return null;
  if (status === 402) return 'QUOTA';
  if (status === 400 || status === 404 || status === 413 || status === 422) return 'REQUEST';
  if (status >= 500 && status < 600) return 'SERVER';
  return null;
}

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
    // claude 2.1.280 marks a refusal is_error and words it for its own UI ("Start a new session"); the stop reason decides even if a later CLI drops the flag.
    if (j.stop_reason === 'refusal')
      return { kind: 'error', message: REFUSAL_MESSAGE, code: 'REQUEST' };
    // claude 2.x reports a failed login or a bad key as a `success` result with `is_error` set.
    if (j.subtype === 'success' && j.is_error !== true) {
      const usage = claudeUsage(j.usage);
      return usage ? { kind: 'done', usage } : { kind: 'done' };
    }
    const message =
      (j.error && typeof j.error.message === 'string' && j.error.message) ||
      (typeof j.result === 'string' && j.result) ||
      (typeof j.message === 'string' && j.message) ||
      (typeof j.subtype === 'string' && j.subtype !== 'success' && j.subtype) ||
      'unknown result error';
    const code = claudeErrorCode(undefined, j.api_error_status, message);
    return code ? { kind: 'error', message, code } : { kind: 'error', message };
  }
  return null;
}

/**
 * The warm child's parser, one per child. Text streams from `text_delta` events; each API message's
 * text, streamed or from its `assistant` frames, is compared with what this turn already sent, and only
 * the new part goes out. A CLI that retries the stream replays a prefix and sends nothing twice; a
 * non-streaming fallback delivers the rest in its `assistant` frame. Text that no longer extends what was
 * sent cannot be taken back, so the turn ends as `restart`.
 * @returns {(j: any) => ClaudeEvent | null}
 */
export function makeClaudeStreamParser() {
  let sent = '';
  let streamedMessage = '';
  let assistantId;
  let assistantMessage = '';
  // The newest message's text: a final answer shorter than what was sent would leave a stale tail on screen.
  let latest = '';
  // The category arrives on an earlier frame than the result it explains.
  let category;
  const forward = (full) => {
    latest = full;
    if (full.startsWith(sent)) {
      const rest = full.slice(sent.length);
      sent = full;
      return rest ? { kind: 'delta', text: rest } : null;
    }
    if (sent.startsWith(full)) return null;
    return { kind: 'restart', message: 'The claude CLI restarted its answer with different text.' };
  };
  return (j) => {
    if (j?.type === 'assistant' && typeof j.error === 'string') category = j.error;
    if (j?.type === 'system' && j.subtype === 'api_retry' && typeof j.error === 'string') {
      category = j.error;
    }
    if (j?.type === 'stream_event') {
      if (j.event?.type === 'message_start') streamedMessage = '';
      const delta = j.event?.type === 'content_block_delta' ? j.event.delta : null;
      if (delta?.type !== 'text_delta' || typeof delta.text !== 'string' || !delta.text)
        return null;
      streamedMessage += delta.text;
      return forward(streamedMessage);
    }
    const event = parseClaudeFrame(j);
    // The retry can take longer than the extension's idle guard, and no text flows meanwhile.
    if (j?.type === 'system' && j.subtype === 'api_retry' && event === null)
      return { kind: 'alive' };
    if (event?.kind === 'delta') {
      // One assistant frame per content block; blocks of one message share its id.
      const id = j.message?.id;
      if (id === undefined || id !== assistantId) assistantMessage = '';
      assistantId = id;
      assistantMessage += event.text;
      return forward(assistantMessage);
    }
    if (event?.kind === 'done' || event?.kind === 'error') {
      const cut = event.kind === 'done' && latest !== '' && latest !== sent;
      latest = '';
      sent = '';
      streamedMessage = '';
      assistantId = undefined;
      assistantMessage = '';
      const typed =
        event.kind === 'error'
          ? claudeErrorCode(category, j.api_error_status, event.message)
          : null;
      category = undefined;
      if (cut) {
        return {
          kind: 'restart',
          message: 'The claude CLI ended with a shorter answer than it had sent.',
        };
      }
      if (typed) return { ...event, code: typed };
    }
    return event;
  };
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
