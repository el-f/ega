import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitiseModel } from '../lib/cli-session.mjs';

// Read as text: importing ega-host.mjs starts its stdin reader, and node cannot load the .ts.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(__dirname, '..', 'ega-host.mjs');
const PROFILES = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'shared',
  'backends',
  'provider-profiles.ts',
);

/** Extract the STATIC_MODELS object literal from ega-host.mjs source text. */
function extractStaticModels() {
  const src = readFileSync(HOST, 'utf8');
  const start = src.indexOf('const STATIC_MODELS = {');
  assert.notEqual(start, -1, 'STATIC_MODELS declaration not found in ega-host.mjs');
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.notEqual(end, -1, 'unbalanced braces around STATIC_MODELS');
  const literal = src.slice(braceStart, end + 1);
  // Plain data, so Function-eval reaches no host import.
  return Function(`return (${literal});`)();
}

/** Extract the anthropic profile's defaultModel — DEFAULT_MODEL's cloud source — as text. */
function extractDefaultAnthropicModel() {
  const src = readFileSync(PROFILES, 'utf8');
  const m = src.match(/anthropic:\s*\{[\s\S]*?defaultModel:\s*'([^']+)'/);
  assert.ok(m, "the anthropic profile's defaultModel not found in provider-profiles.ts");
  return m[1];
}

/** Strip a trailing `-YYYYMMDD` date segment to get the model family id. */
function modelFamily(id) {
  return id.replace(/-\d{8}$/, '');
}

test('STATIC_MODELS keys are exactly the registered native CLI ids', () => {
  const models = extractStaticModels();
  assert.deepEqual(Object.keys(models).sort(), ['claude', 'codex']);
});

test('every STATIC_MODELS entry is a non-empty array of valid model ids', () => {
  const models = extractStaticModels();
  for (const [cli, list] of Object.entries(models)) {
    assert.ok(Array.isArray(list) && list.length > 0, `${cli} menu must be non-empty`);
    for (const id of list) {
      assert.equal(typeof id, 'string', `${cli} entry must be a string`);
      assert.equal(sanitiseModel(id), id, `${cli} id "${id}" must survive the host sanitizer`);
    }
  }
});

test('STATIC_MODELS.claude leads with the aliases, which cannot go stale', () => {
  assert.deepEqual(extractStaticModels().claude.slice(0, 3), ['opus', 'sonnet', 'haiku']);
});

test('STATIC_MODELS.claude contains the active anthropic default family (drift guard)', () => {
  const family = modelFamily(extractDefaultAnthropicModel());
  const claude = extractStaticModels().claude;
  assert.ok(
    claude.includes(family),
    `STATIC_MODELS.claude is missing the active anthropic default family "${family}". ` +
      `DEFAULT_MODEL.anthropic changed without updating the native model menu in ega-host.mjs. ` +
      `Menu: ${JSON.stringify(claude)}`,
  );
});
