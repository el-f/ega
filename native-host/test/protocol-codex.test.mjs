import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODEX_SAFETY_ARGS,
  codexErrorFromFrame,
  codexMcpOverrides,
  codexTextFromFrame,
} from '../lib/protocol-codex.mjs';

test('CODEX_SAFETY_ARGS pins the child read-only with no web, shell, browser, image or apps tool', () => {
  assert.deepEqual(CODEX_SAFETY_ARGS, [
    '-c',
    'sandbox_mode="read-only"',
    '-c',
    'approval_policy="never"',
    '-c',
    'tools.web_search=false',
    '-c',
    'web_search="disabled"',
    '-c',
    'features.shell_tool=false',
    '-c',
    'features.unified_exec=false',
    '-c',
    'features.browser_use=false',
    '-c',
    'features.computer_use=false',
    '-c',
    'features.view_image=false',
    '-c',
    'features.apps=false',
  ]);
});

// The shape `codex mcp list --json` prints on codex-cli 0.155.1, trimmed to the fields read.
const MCP_LIST = JSON.stringify([
  { name: 'probe', enabled: true, disabled_reason: null, transport: { type: 'stdio' } },
  { name: 'a.b', enabled: true, disabled_reason: null, transport: { type: 'stdio' } },
  { name: 'off', enabled: false, disabled_reason: null, transport: { type: 'stdio' } },
  { name: 'team:fs@v1/x', enabled: true, disabled_reason: null, transport: { type: 'stdio' } },
]);

test('codexMcpOverrides disables every enabled server it can name and reports the rest', () => {
  assert.deepEqual(codexMcpOverrides(MCP_LIST), {
    args: ['-c', 'mcp_servers.probe.enabled=false', '-c', 'mcp_servers.team:fs@v1/x.enabled=false'],
    stillLoaded: ['a.b'],
  });
});

// An override naming a server codex did not load fails its config load, so a bad list must add nothing.
test('codexMcpOverrides adds nothing for output that is not a JSON array', () => {
  for (const text of ['', '[', '{"name":"x","enabled":true}', 'null', '[1, "x", null]']) {
    assert.deepEqual(codexMcpOverrides(text), { args: [], stillLoaded: [] }, JSON.stringify(text));
  }
});

// `-c mcp_servers={}` was tried and dropped: codex deep-merges table overrides, so it changed nothing.
test('no mcp_servers override — an empty table override is a silent no-op in codex', () => {
  assert.equal(
    CODEX_SAFETY_ARGS.some((a) => String(a).startsWith('mcp_servers')),
    false,
  );
});

test('every safety override is a -c key=value pair', () => {
  for (let i = 0; i < CODEX_SAFETY_ARGS.length; i += 2) {
    assert.equal(CODEX_SAFETY_ARGS[i], '-c');
    assert.match(String(CODEX_SAFETY_ARGS[i + 1]), /^[\w.]+=/);
  }
});

test('codexTextFromFrame reads the 0.125+ item.completed shape', () => {
  assert.equal(
    codexTextFromFrame({ type: 'item.completed', item: { type: 'agent_message', text: 'hola' } }),
    'hola',
  );
});

test('codexTextFromFrame reads a bare text field', () => {
  assert.equal(codexTextFromFrame({ text: 'plain' }), 'plain');
});

test('codexTextFromFrame joins a content array', () => {
  assert.equal(
    codexTextFromFrame({ message: { content: [{ text: 'a' }, { text: 'b' }, { type: 'image' }] } }),
    'ab',
  );
});

test('codexTextFromFrame returns empty for noise and malformed input', () => {
  for (const frame of [
    null,
    undefined,
    'string',
    42,
    {},
    { item: {} },
    { message: {} },
    { type: 'thread.started', thread_id: 't1' },
    { type: 'item.completed', item: { type: 'reasoning', text: 'thinking out loud' } },
    { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
  ]) {
    assert.equal(codexTextFromFrame(frame), '', `expected '' for ${JSON.stringify(frame)}`);
  }
});

test('codexErrorFromFrame reads the error and turn.failed shapes codex-cli 0.155 prints', () => {
  assert.equal(
    codexErrorFromFrame({ type: 'error', message: 'unexpected status 401' }),
    'unexpected status 401',
  );
  assert.equal(
    codexErrorFromFrame({ type: 'turn.failed', error: { message: 'unexpected status 401' } }),
    'unexpected status 401',
  );
});

test('codexErrorFromFrame returns empty for answers, warnings and malformed input', () => {
  for (const frame of [
    null,
    'string',
    {},
    { type: 'error' },
    { type: 'turn.failed', error: {} },
    { type: 'item.completed', item: { type: 'agent_message', text: 'hola' } },
    { type: 'item.completed', item: { type: 'error', message: 'Falling back from WebSockets' } },
    { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
  ]) {
    assert.equal(codexErrorFromFrame(frame), '', `expected '' for ${JSON.stringify(frame)}`);
  }
});
