import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODEX_SAFETY_ARGS,
  codexAuthStoreArgs,
  codexMcpOverrides,
  codexInstructionsArgs,
  codexErrorFromFrame,
  codexTextFromFrame,
  codexUsageFromFrame,
} from '../lib/protocol-codex.mjs';

test('CODEX_SAFETY_ARGS pins the child read-only with no web, shell, browser, image, apps or plugin tool', () => {
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
    '-c',
    'features.plugins=false',
    '-c',
    'project_doc_max_bytes=0',
  ]);
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

test('codexUsageFromFrame reads turn.completed usage and ignores every other frame', () => {
  assert.deepEqual(
    codexUsageFromFrame({
      type: 'turn.completed',
      usage: {
        input_tokens: 24763,
        cached_input_tokens: 20000,
        output_tokens: 9,
        reasoning_output_tokens: 0,
      },
    }),
    { inputTokens: 24763, outputTokens: 9 },
  );
  assert.equal(
    codexUsageFromFrame({ type: 'item.completed', item: { type: 'agent_message', text: 'x' } }),
    null,
  );
  assert.equal(codexUsageFromFrame({ type: 'turn.completed' }), null);
});

// Checked on codex-cli 0.155.1 through cmd.exe and codex.cmd: this form loaded the file and cut a
// one-line gpt-6-luna translation from 8431 to 4934 input tokens.
test('codexInstructionsArgs writes the path as a TOML basic string, backslashes and quotes escaped', () => {
  assert.deepEqual(codexInstructionsArgs('C:\\Users\\O"Brien\\Temp\\ega-codex-1.md'), [
    '-c',
    'model_instructions_file="C:\\\\Users\\\\O\\"Brien\\\\Temp\\\\ega-codex-1.md"',
  ]);
});

test('codexAuthStoreArgs passes the top-level login store through and nothing else', () => {
  const pair = (v) => ['-c', `cli_auth_credentials_store="${v}"`];
  assert.deepEqual(
    codexAuthStoreArgs('model = "x"\ncli_auth_credentials_store = "keyring"\n'),
    pair('keyring'),
  );
  assert.deepEqual(codexAuthStoreArgs("cli_auth_credentials_store='auto' # note\n"), pair('auto'));
  assert.deepEqual(codexAuthStoreArgs('cli_auth_credentials_store = "file"'), pair('file'));
  // A BOM before a first-line key (PowerShell 5.1 writes one) and a quoted key are both valid TOML that codex reads.
  assert.deepEqual(
    codexAuthStoreArgs('\uFEFFcli_auth_credentials_store = "keyring"\n'),
    pair('keyring'),
  );
  assert.deepEqual(
    codexAuthStoreArgs('"cli_auth_credentials_store" = "keyring"\n'),
    pair('keyring'),
  );
  for (const text of [
    '"cli_auth_credentials_store\' = "keyring"',
    '',
    'model = "x"',
    '[profiles.p]\ncli_auth_credentials_store = "keyring"\n',
    'cli_auth_credentials_store = "vault"',
    '# cli_auth_credentials_store = "keyring"',
  ]) {
    assert.deepEqual(codexAuthStoreArgs(text), [], JSON.stringify(text));
  }
});

test('codexMcpOverrides turns off every enabled, addressable server and names the rest', () => {
  assert.deepEqual(
    codexMcpOverrides(
      JSON.stringify([
        { name: 'jira', enabled: true },
        { name: 'off', enabled: false },
        { name: 'corp.tools', enabled: true },
        { name: 7, enabled: true },
      ]),
    ),
    { args: ['-c', 'mcp_servers.jira.enabled=false'], stillLoaded: ['corp.tools'] },
  );
  assert.deepEqual(codexMcpOverrides('not json'), { args: [], stillLoaded: [] });
  assert.deepEqual(codexMcpOverrides('{}'), { args: [], stillLoaded: [] });
});
