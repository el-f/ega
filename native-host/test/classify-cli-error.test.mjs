import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCliError } from '../lib/classify-cli-error.mjs';

test('maps rate limiting to RATE_LIMIT', () => {
  assert.equal(classifyCliError('Error 429: rate limit exceeded'), 'RATE_LIMIT');
  assert.equal(classifyCliError('Too many requests, slow down'), 'RATE_LIMIT');
});

test('maps billing and quota exhaustion to QUOTA', () => {
  assert.equal(classifyCliError('You have exceeded your usage limit'), 'QUOTA');
  assert.equal(classifyCliError('insufficient funds on this account'), 'QUOTA');
});

test('maps credential failures to AUTH', () => {
  assert.equal(classifyCliError('401 Unauthorized'), 'AUTH');
  assert.equal(classifyCliError('You are not logged in. Run `claude login`.'), 'AUTH');
});

test("maps the CLIs' own failure lines to AUTH and RATE_LIMIT", () => {
  // codex-cli 0.155.1 turn.failed text for a bad key; a 429 comes through the same template.
  assert.equal(
    classifyCliError(
      'unexpected status 401 Unauthorized: Incorrect API key provided: sk-bogus****0000., url: https://api.openai.com/v1/responses, auth error: 401, auth error code: invalid_api_key',
    ),
    'AUTH',
  );
  assert.equal(
    classifyCliError(
      'unexpected status 429 Too Many Requests: Rate limit reached for gpt-5, url: https://api.openai.com/v1/responses',
    ),
    'RATE_LIMIT',
  );
  // claude 2.1.280 result text when logged out, and after its retries on a bad key.
  assert.equal(classifyCliError('Not logged in · Please run /login'), 'AUTH');
  assert.equal(
    classifyCliError('Failed to authenticate. API Error: 401 API key is invalid.'),
    'AUTH',
  );
});

test('maps prompt and model rejections to REQUEST so they do not retry', () => {
  assert.equal(classifyCliError('unknown model: gpt-9'), 'REQUEST');
  assert.equal(classifyCliError('Request refused by content policy'), 'REQUEST');
  // claude 2.x's own wording for a model id it does not know.
  assert.equal(
    classifyCliError(
      "There's an issue with the selected model (claude-sonnet-4-7). It may not exist or you may not have access to it. Run --model to pick a different model.",
    ),
    'REQUEST',
  );
});

test('maps a CLI too old for the safety flags to REQUEST', () => {
  assert.equal(classifyCliError("error: unknown option '--tools'"), 'REQUEST');
  assert.equal(classifyCliError('error: unexpected argument --setting-sources found'), 'REQUEST');
});

test('maps transport failures to TIMEOUT and NETWORK', () => {
  assert.equal(classifyCliError('deadline exceeded after 60s'), 'TIMEOUT');
  assert.equal(classifyCliError('connect ECONNREFUSED 127.0.0.1:1234'), 'NETWORK');
});

test('leaves unrecognised text UNKNOWN rather than guessing retryable', () => {
  assert.equal(classifyCliError('something went sideways'), 'UNKNOWN');
  assert.equal(classifyCliError(''), 'UNKNOWN');
  assert.equal(classifyCliError(undefined), 'UNKNOWN');
});

test('every produced code is one the extension knows', () => {
  const known = new Set([
    'NETWORK',
    'AUTH',
    'RATE_LIMIT',
    'QUOTA',
    'REQUEST',
    'NATIVE_NOT_INSTALLED',
    'NATIVE_SPAWN_FAIL',
    'ABORTED',
    'TIMEOUT',
    'PARSE',
    'PROTOCOL',
    'UNSUPPORTED',
    'UNKNOWN',
  ]);
  const samples = [
    '429 rate limit',
    'quota exceeded',
    '403 forbidden',
    'invalid model',
    'timed out',
    'socket hang up',
    'gibberish',
  ];
  for (const s of samples) assert.ok(known.has(classifyCliError(s)), `${s} -> unknown vocabulary`);
});

test('classifies the last stderr line first, then the whole tail', () => {
  assert.equal(classifyCliError('warning: approaching rate limit\nError: invalid api key'), 'AUTH');
  // A stack-trace tail says nothing on its own; the earlier line still decides.
  assert.equal(classifyCliError('Error: 401 Unauthorized\n    at run (cli.js:10:3)'), 'AUTH');
});
