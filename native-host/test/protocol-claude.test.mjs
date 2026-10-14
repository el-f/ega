import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUDE_SAFETY_ARGS,
  CLAUDE_CHILD_ENV,
  CLAUDE_PROMPT_ARGS,
  CLAUDE_SPAWN_ARGS,
  encodeClaudePrompt,
  makeClaudeStreamParser,
  parseClaudeFrame,
} from '../lib/protocol-claude.mjs';

test('CLAUDE_SPAWN_ARGS matches the spike-documented invocation', () => {
  assert.deepEqual(CLAUDE_SPAWN_ARGS, [
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--no-session-persistence',
    ...CLAUDE_PROMPT_ARGS,
    '--include-partial-messages',
  ]);
});

test('the child gets a short fixed system prompt instead of the CLI coding-agent prompt', () => {
  assert.equal(CLAUDE_PROMPT_ARGS[0], '--system-prompt');
  const text = CLAUDE_PROMPT_ARGS[1];
  assert.ok(text.length > 0 && text.length < 300);
  // It crosses cmd.exe when claude is a .cmd shim: % expands inside quotes and a quote ends the argument.
  assert.doesNotMatch(text, /[%"^&|<>\r\n]/);
});

test('CLAUDE_SAFETY_ARGS leaves the child no tools, no MCP servers and no settings', () => {
  assert.deepEqual(CLAUDE_SAFETY_ARGS, [
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--no-session-persistence',
  ]);
  // No `--mcp-config` anywhere, or `--strict-mcp-config` would allow that file's servers.
  assert.equal(CLAUDE_SPAWN_ARGS.includes('--mcp-config'), false);
});

test('CLAUDE_CHILD_ENV keeps the user memory and CLAUDE.md files out of the prompt, at low effort', () => {
  assert.deepEqual(CLAUDE_CHILD_ENV, {
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
    CLAUDE_CODE_EFFORT_LEVEL: 'low',
  });
});

test('encodeClaudePrompt produces one NDJSON line wrapping system + user', () => {
  const line = encodeClaudePrompt({ system: 'sys', user: 'u' });
  assert.equal(line.includes('\n'), false, 'must be single-line NDJSON');
  const parsed = JSON.parse(line);
  assert.equal(parsed.type, 'user');
  assert.equal(parsed.message.role, 'user');
  assert.equal(typeof parsed.message.content, 'string');
  assert.match(parsed.message.content, /sys/);
  assert.match(parsed.message.content, /u/);
});

test('encodeClaudePrompt with empty system omits the separator', () => {
  const parsed = JSON.parse(encodeClaudePrompt({ system: '', user: 'hola' }));
  assert.equal(parsed.message.content, 'hola');
});

test('parseClaudeFrame ignores system.hook_started', () => {
  assert.equal(parseClaudeFrame({ type: 'system', subtype: 'hook_started' }), null);
});

test('parseClaudeFrame ignores system.hook_response', () => {
  assert.equal(parseClaudeFrame({ type: 'system', subtype: 'hook_response' }), null);
});

test('parseClaudeFrame ignores system.init', () => {
  assert.equal(parseClaudeFrame({ type: 'system', subtype: 'init', session_id: 's1' }), null);
});

test('parseClaudeFrame ignores rate_limit_event', () => {
  assert.equal(
    parseClaudeFrame({ type: 'rate_limit_event', remaining: 100 }),
    null,
    'rate-limit telemetry is not surfaced',
  );
});

test('parseClaudeFrame extracts delta from assistant.text content', () => {
  const r = parseClaudeFrame({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'hola ' },
        { type: 'text', text: 'mundo' },
      ],
    },
  });
  assert.deepEqual(r, { kind: 'delta', text: 'hola mundo' });
});

test('parseClaudeFrame returns null when assistant frame has no text', () => {
  const r = parseClaudeFrame({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }] },
  });
  assert.equal(r, null);
});

test('parseClaudeFrame emits done on result.success', () => {
  assert.deepEqual(parseClaudeFrame({ type: 'result', subtype: 'success', result: 'hola' }), {
    kind: 'done',
  });
});

test('parseClaudeFrame emits error on result with non-success subtype', () => {
  const r = parseClaudeFrame({
    type: 'result',
    subtype: 'error_max_turns',
    error: { message: 'max turns reached' },
  });
  assert.equal(r.kind, 'error');
  assert.match(r.message, /max turns/);
});

// Frame shapes from claude 2.1.280 with an empty CLAUDE_CONFIG_DIR and no API key.
test('parseClaudeFrame reads a logged-out turn as an error, not an answer', () => {
  const failure = 'Not logged in · Please run /login';
  assert.equal(
    parseClaudeFrame({
      type: 'assistant',
      message: { content: [{ type: 'text', text: failure }], model: '<synthetic>' },
      error: 'authentication_failed',
      is_api_error_message: true,
    }),
    null,
  );
  assert.deepEqual(
    parseClaudeFrame({
      type: 'result',
      subtype: 'success',
      is_error: true,
      api_error_status: null,
      terminal_reason: 'api_error',
      result: failure,
    }),
    { kind: 'error', message: failure },
  );
});

test('parseClaudeFrame never reports an is_error result as done, even with no text', () => {
  const r = parseClaudeFrame({ type: 'result', subtype: 'success', is_error: true });
  assert.equal(r.kind, 'error');
  assert.notEqual(r.message, 'success');
});

// Shape from claude 2.1.280 with an invalid ANTHROPIC_API_KEY: ten of these over ~4 minutes.
test('parseClaudeFrame marks a 401 or 403 api_retry as an auth retry and drops other retries', () => {
  const retry = (status) => ({
    type: 'system',
    subtype: 'api_retry',
    attempt: 1,
    max_retries: 10,
    retry_delay_ms: 509,
    error_status: status,
    error: 'authentication_failed',
  });
  for (const status of [401, 403]) {
    const r = parseClaudeFrame(retry(status));
    assert.equal(r?.kind, 'auth-retry', `status ${status}`);
    assert.match(r.message, new RegExp(`\\b${status}\\b`));
  }
  for (const status of [429, 500, 529, null, undefined]) {
    assert.equal(parseClaudeFrame(retry(status)), null, `status ${status}`);
  }
});

test('parseClaudeFrame emits error on system.error', () => {
  const r = parseClaudeFrame({
    type: 'system',
    subtype: 'error',
    message: 'rate limited',
  });
  assert.equal(r.kind, 'error');
  assert.match(r.message, /rate limited/);
});

test('parseClaudeFrame returns null for unknown frame types (no throw)', () => {
  assert.equal(parseClaudeFrame({ type: 'frobnicate' }), null);
  assert.equal(parseClaudeFrame({}), null);
  assert.equal(parseClaudeFrame(null), null);
  assert.equal(parseClaudeFrame('not an object'), null);
});

test('parses a synthetic NDJSON stream into meaningful events only', () => {
  const ndjson = [
    '{"type":"system","subtype":"hook_started","hook":"SessionStart"}',
    '{"type":"system","subtype":"hook_response","hook":"SessionStart","output":"ok"}',
    '{"type":"system","subtype":"init","session_id":"s1"}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"hola "}]}}',
    '{"type":"rate_limit_event","remaining":99}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"mundo"}]}}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t","name":"x","input":{}}]}}',
    '{"type":"result","subtype":"success","result":"hola mundo"}',
  ];
  const events = [];
  for (const line of ndjson) {
    const f = parseClaudeFrame(JSON.parse(line));
    if (f) events.push(f);
  }
  assert.deepEqual(events, [
    { kind: 'delta', text: 'hola ' },
    { kind: 'delta', text: 'mundo' },
    { kind: 'done' },
  ]);
});

test('a successful result frame carries the token usage the CLI reports', () => {
  assert.deepEqual(
    parseClaudeFrame({
      type: 'result',
      subtype: 'success',
      usage: {
        input_tokens: 12,
        output_tokens: 7,
        cache_read_input_tokens: 3400,
        cache_creation_input_tokens: 5,
      },
    }),
    {
      kind: 'done',
      usage: { inputTokens: 12, outputTokens: 7, cacheReadTokens: 3400, cacheWriteTokens: 5 },
    },
  );
  assert.deepEqual(parseClaudeFrame({ type: 'result', subtype: 'success' }), { kind: 'done' });
  assert.deepEqual(
    parseClaudeFrame({ type: 'result', subtype: 'success', usage: { input_tokens: 'x' } }),
    { kind: 'done' },
  );
});

const textDelta = (text) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
});
const assistantText = (text) => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
});

test('the stream parser sends each text delta once and skips the assistant frame that repeats them', () => {
  const parse = makeClaudeStreamParser();
  const out = [
    {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hm' } },
    },
    textDelta('Good '),
    textDelta('morning'),
    assistantText('Good morning'),
    { type: 'result', subtype: 'success' },
  ].map(parse);
  assert.deepEqual(out, [
    null,
    { kind: 'delta', text: 'Good ' },
    { kind: 'delta', text: 'morning' },
    null,
    { kind: 'done' },
  ]);
});

test('a turn that streamed no delta still gets its text from the assistant frame, and the next turn streams again', () => {
  const parse = makeClaudeStreamParser();
  assert.deepEqual(parse(textDelta('one')), { kind: 'delta', text: 'one' });
  assert.equal(parse(assistantText('one')), null);
  assert.deepEqual(parse({ type: 'result', subtype: 'success' }), { kind: 'done' });
  assert.deepEqual(parse(assistantText('two')), { kind: 'delta', text: 'two' });
  assert.deepEqual(parse({ type: 'result', subtype: 'success' }), { kind: 'done' });
  assert.deepEqual(parse(textDelta('three')), { kind: 'delta', text: 'three' });
});

const messageStart = { type: 'stream_event', event: { type: 'message_start' } };
const apiRetry = { type: 'system', subtype: 'api_retry', error: 'server_error', attempt: 1 };

// claude 2.1.280 on a connection reset mid-answer: stops the stream, retries, and streams the whole answer again.
test('a stream the CLI retries from the start sends each character once and keeps the host alive meanwhile', () => {
  const parse = makeClaudeStreamParser();
  const out = [
    messageStart,
    textDelta('{"t":"Good '),
    apiRetry,
    messageStart,
    textDelta('{"t":"Go'),
    textDelta('od '),
    textDelta('morning"}'),
    assistantText('{"t":"Good morning"}'),
    { type: 'result', subtype: 'success' },
  ].map(parse);
  assert.deepEqual(out, [
    null,
    { kind: 'delta', text: '{"t":"Good ' },
    { kind: 'alive' },
    null,
    null,
    null,
    { kind: 'delta', text: 'morning"}' },
    null,
    { kind: 'done' },
  ]);
});

// "Error streaming, falling back to non-streaming mode": the full answer arrives only in the assistant frame.
test('a non-streaming fallback after partial text sends only the missing rest', () => {
  const parse = makeClaudeStreamParser();
  assert.deepEqual(parse(textDelta('Good ')), { kind: 'delta', text: 'Good ' });
  assert.deepEqual(parse(assistantText('Good morning')), { kind: 'delta', text: 'morning' });
  assert.deepEqual(parse({ type: 'result', subtype: 'success' }), { kind: 'done' });
});

test('text that no longer extends what was sent ends the turn as a restart', () => {
  const parse = makeClaudeStreamParser();
  parse(textDelta('Good '));
  assert.equal(parse(assistantText('Hello there'))?.kind, 'restart');
  const again = makeClaudeStreamParser();
  again(textDelta('Good '));
  again(messageStart);
  assert.equal(again(textDelta('Hi'))?.kind, 'restart');
});

test('blocks of one assistant message join, so a two-block answer is not read as a restart', () => {
  const parse = makeClaudeStreamParser();
  const block = (text) => ({
    type: 'assistant',
    message: { id: 'm1', content: [{ type: 'text', text }] },
  });
  assert.deepEqual(parse(block('Good ')), { kind: 'delta', text: 'Good ' });
  assert.deepEqual(parse(block('morning')), { kind: 'delta', text: 'morning' });
});

test('an auth api_retry stays auth-retry, not alive', () => {
  const parse = makeClaudeStreamParser();
  assert.equal(
    parse({ type: 'system', subtype: 'api_retry', error_status: 401 })?.kind,
    'auth-retry',
  );
});

// Categories from claude 2.x api_retry and the synthetic assistant turn; the text classifier stays the fallback.
test('a failed turn carries the code of its typed category, not of its wording', () => {
  const parse = makeClaudeStreamParser();
  assert.equal(
    parse({ type: 'assistant', error: 'billing_error', message: { content: [] } }),
    null,
  );
  assert.deepEqual(
    parse({ type: 'result', subtype: 'success', is_error: true, result: 'Something went wrong' }),
    { kind: 'error', message: 'Something went wrong', code: 'QUOTA' },
  );
  // The category belongs to that turn only.
  assert.deepEqual(parse({ type: 'result', subtype: 'success', is_error: true, result: 'x' }), {
    kind: 'error',
    message: 'x',
  });
});

test('a retry category reaches the result it explains', () => {
  const parse = makeClaudeStreamParser();
  parse({ type: 'system', subtype: 'api_retry', error_status: 429, error: 'rate_limit' });
  assert.equal(
    parse({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'gave up' })
      ?.code,
    'RATE_LIMIT',
  );
  parse({ type: 'assistant', error: 'model_not_found', message: { content: [] } });
  assert.equal(
    parse({ type: 'result', subtype: 'success', is_error: true, result: 'y' })?.code,
    'REQUEST',
  );
});

// Shapes read from the claude 2.1.280 binary: a final refusal becomes a synthetic API-error turn
// (error invalid_request, stop_reason refusal) and the result carries is_error and the stop reason.
test('a refused turn ends as REQUEST with the refusal text every backend uses, never as an answer', () => {
  const parse = makeClaudeStreamParser();
  const cliText =
    "API Error: Claude can't help with this. Start a new session to continue.\n\nLearn more: https://www.anthropic.com/legal/aup";
  assert.equal(
    parse({
      type: 'assistant',
      error: 'invalid_request',
      is_api_error_message: true,
      message: {
        model: '<synthetic>',
        content: [{ type: 'text', text: cliText }],
        stop_reason: 'refusal',
      },
    }),
    null,
  );
  assert.deepEqual(
    parse({
      type: 'result',
      subtype: 'success',
      is_error: true,
      stop_reason: 'refusal',
      api_error_status: null,
      result: cliText,
    }),
    {
      kind: 'error',
      message: 'The backend refused to answer this text. Reword it, or use another backend.',
      code: 'REQUEST',
    },
  );
});

test('a refusal stop reason is an error even on a result not marked is_error', () => {
  assert.equal(
    parseClaudeFrame({ type: 'result', subtype: 'success', stop_reason: 'refusal', result: 'No.' })
      ?.code,
    'REQUEST',
  );
});

// The CLI turns a cut answer into an API-error turn with category max_output_tokens.
test('an answer cut at the output cap ends as REQUEST', () => {
  const parse = makeClaudeStreamParser();
  parse({ type: 'assistant', error: 'max_output_tokens', message: { content: [] } });
  assert.equal(
    parse({
      type: 'result',
      subtype: 'success',
      is_error: true,
      stop_reason: 'max_tokens',
      result: "API Error: Claude's response exceeded the 32000 output token maximum.",
    })?.code,
    'REQUEST',
  );
});

test('an unknown category leaves the code to the text classifier', () => {
  const parse = makeClaudeStreamParser();
  parse({ type: 'assistant', error: 'unknown', message: { content: [] } });
  const r = parse({ type: 'result', subtype: 'success', is_error: true, result: 'z' });
  assert.equal(r?.code, undefined);
});

test('the result HTTP status names the code when the CLI gives no category', () => {
  const r = (status) =>
    parseClaudeFrame({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'f',
      api_error_status: status,
    });
  assert.equal(r(401)?.code, 'AUTH');
  assert.equal(r(402)?.code, 'QUOTA');
  assert.equal(r(429)?.code, 'RATE_LIMIT');
  assert.equal(r(404)?.code, 'REQUEST');
  assert.equal(r(529)?.code, 'SERVER');
  assert.equal(r(null)?.code, undefined);
});

test('a plan or credit limit is QUOTA, a passing rate limit stays RATE_LIMIT', () => {
  const run = (text) => {
    const parse = makeClaudeStreamParser();
    parse({ type: 'assistant', error: 'rate_limit', message: { content: [] } });
    return parse({ type: 'result', subtype: 'success', is_error: true, result: text })?.code;
  };
  assert.equal(run("You've hit your session limit · resets 4pm"), 'QUOTA');
  assert.equal(run("You've hit your weekly limit"), 'QUOTA');
  assert.equal(run('Usage credits required for 1M context'), 'QUOTA');
  assert.equal(run('Request rate limited, try again shortly'), 'RATE_LIMIT');
});

test('a 401 or 403 stays AUTH even when the CLI tags it invalid_request', () => {
  const parse = makeClaudeStreamParser();
  parse({ type: 'assistant', error: 'invalid_request', message: { content: [] } });
  const r = parse({
    type: 'result',
    subtype: 'success',
    is_error: true,
    api_error_status: 403,
    result: 'Your organization has disabled API key authentication',
  });
  assert.equal(r?.code, 'AUTH');
});

test('a server_error with no HTTP status is left to the text classifier', () => {
  const parse = makeClaudeStreamParser();
  parse({ type: 'assistant', error: 'server_error', message: { content: [] } });
  const offline = parse({
    type: 'result',
    subtype: 'success',
    is_error: true,
    result: 'Unable to connect to API (ECONNREFUSED)',
  });
  assert.equal(offline?.code, 'NETWORK');
  parse({ type: 'assistant', error: 'server_error', message: { content: [] } });
  const fivexx = parse({
    type: 'result',
    subtype: 'success',
    is_error: true,
    api_error_status: 500,
    result: 'API Error: 500',
  });
  assert.equal(fivexx?.code, 'SERVER');
});

// Connection failures from claude 2.1.280 (server_error, no HTTP status): always passing, never REQUEST or UNKNOWN.
test('a connection failure is NETWORK or TIMEOUT whatever its wording', () => {
  const run = (text) => {
    const parse = makeClaudeStreamParser();
    parse({ type: 'assistant', error: 'server_error', message: { content: [] } });
    return parse({
      type: 'result',
      subtype: 'success',
      is_error: true,
      api_error_status: null,
      result: text,
    })?.code;
  };
  for (const text of [
    'API Error: Connection refused — a firewall or proxy may be blocking it (ConnectionRefused)',
    "API Error: Can't reach the API server — check your internet or DNS (FailedToOpenSocket)",
    'API Error: Connection dropped (EPIPE)',
    'API Error: No internet route — check your connection or VPN (ENETDOWN)',
    'Unable to connect to API. Check your internet connection',
    'Failed to refresh OAuth token: another Claude Code process is refreshing it. This is usually transient',
  ]) {
    assert.equal(run(text), 'NETWORK', text);
  }
  assert.equal(run('API Error: Request timed out (ETIMEDOUT)'), 'TIMEOUT');
});

test('more plan-limit wording is QUOTA, and the server throttle stays RATE_LIMIT', () => {
  const run = (text) => {
    const parse = makeClaudeStreamParser();
    parse({ type: 'assistant', error: 'rate_limit', message: { content: [] } });
    return parse({ type: 'result', subtype: 'success', is_error: true, result: text })?.code;
  };
  assert.equal(run("You've reached your monthly usage limit"), 'QUOTA');
  assert.equal(run('Your org is out of usage · add funds to continue'), 'QUOTA');
  assert.equal(run("Your seat type doesn't include usage"), 'QUOTA');
  assert.equal(run("Your seat type doesn't include extra usage"), 'QUOTA');
  assert.equal(run("You're out of extra usage"), 'QUOTA');
  assert.equal(
    run("Your group's usage limit is set to $0 · ask your admin for a higher limit"),
    'QUOTA',
  );
  assert.equal(run('Your usage allocation has been disabled by your admin'), 'QUOTA');
  assert.equal(run('Usage is disabled for your org'), 'QUOTA');
  assert.equal(run('Server is temporarily limiting requests (not your usage limit)'), 'RATE_LIMIT');
});

test('an expired login tagged invalid_request with no status is AUTH', () => {
  const parse = makeClaudeStreamParser();
  parse({ type: 'assistant', error: 'invalid_request', message: { content: [] } });
  const r = parse({
    type: 'result',
    subtype: 'success',
    is_error: true,
    result: 'Invalid API key · Fix external API key',
  });
  assert.equal(r?.code, 'AUTH');
  parse({ type: 'assistant', error: 'invalid_request', message: { content: [] } });
  const bad = parse({
    type: 'result',
    subtype: 'success',
    is_error: true,
    result: 'messages: text content blocks must be non-empty',
  });
  assert.equal(bad?.code, 'REQUEST');
});

// claude 2.1.280 refuses to retry a certificate it cannot trust, so ega does not retry it either.
test('a certificate failure is not retryable, unlike a dropped connection', () => {
  const run = (text) => {
    const parse = makeClaudeStreamParser();
    parse({ type: 'assistant', error: 'server_error', message: { content: [] } });
    return parse({ type: 'result', subtype: 'success', is_error: true, result: text })?.code;
  };
  for (const text of [
    'API Error: Unable to connect to API: SSL certificate has expired',
    'API Error: Unable to connect to API: SSL certificate hostname mismatch',
    'API Error: Unable to connect to API: SSL certificate verification failed',
    'API Error: Unable to connect to API: Self-signed certificate detected',
    'API Error: SSL error (CERT_REJECTED)',
  ]) {
    assert.equal(run(text), 'NATIVE_SPAWN_FAIL', text);
  }
  assert.equal(run('API Error: SSL error (ERR_TLS_HANDSHAKE_TIMEOUT)'), 'NETWORK');
});

test('an expired profile login tagged invalid_request is AUTH', () => {
  const parse = makeClaudeStreamParser();
  parse({ type: 'assistant', error: 'invalid_request', message: { content: [] } });
  const r = parse({
    type: 'result',
    subtype: 'success',
    is_error: true,
    result: 'Anthropic profile login expired · Re-authenticate your Anthropic profile',
  });
  assert.equal(r?.code, 'AUTH');
});

test('a replay that ends shorter than the text already sent ends as a restart, not a done', () => {
  const parse = makeClaudeStreamParser();
  parse(textDelta('Good morning everyone'));
  parse(messageStart);
  assert.equal(parse(textDelta('Good morning')), null);
  assert.equal(parse({ type: 'result', subtype: 'success' })?.kind, 'restart');
  // The next turn starts clean.
  assert.deepEqual(parse(textDelta('Hi')), { kind: 'delta', text: 'Hi' });
});
