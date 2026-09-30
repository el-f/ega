import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUDE_SAFETY_ARGS,
  CLAUDE_CHILD_ENV,
  CLAUDE_SPAWN_ARGS,
  encodeClaudePrompt,
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
  ]);
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

test('CLAUDE_CHILD_ENV keeps the user memory and CLAUDE.md files out of the prompt', () => {
  assert.deepEqual(CLAUDE_CHILD_ENV, {
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
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
