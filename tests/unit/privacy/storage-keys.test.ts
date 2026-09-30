import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORAGE_KEYS } from '@/shared/constants';

// Pins every storage key in src/ to the Storage shape table in docs/ARCHITECTURE.md.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const sources = readdirSync(path.join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.(?:ts|svelte)$/.test(e.name))
  .map((e) => readFileSync(path.join(e.parentPath, e.name), 'utf8'));

// A `*KEY` or `*KEY_PREFIX` constant, or a literal handed straight to a storage call.
const KEY_SHAPES = [
  /\bconst\s+[A-Z_]*KEY(?:_PREFIX)?\s*=\s*'([^']+)'/g,
  /\b(?:localStorage|sessionStorage)\??\.(?:get|set|remove)Item\(\s*'([^']+)'/g,
  /\bchrome\.storage\.(?:local|session)\.(?:get|remove)\(\s*'([^']+)'/g,
];
// A JSON field name in the stream parser, not a storage key.
const NOT_STORAGE = new Set(['"translation"']);

const codeKeys = [
  ...new Set([
    ...Object.values(STORAGE_KEYS),
    ...sources.flatMap((src) =>
      KEY_SHAPES.flatMap((re) => [...src.matchAll(re)].map((m) => m[1] ?? '')),
    ),
  ]),
]
  .filter((k) => !NOT_STORAGE.has(k))
  .sort();

const arch = readFileSync(path.join(ROOT, 'docs/ARCHITECTURE.md'), 'utf8');
const section = arch.slice(arch.indexOf('## Storage shape'));
const tableKeys = section
  .slice(0, section.indexOf('\n## ', 1))
  .split('\n')
  .map((line) => /^\| `([^`]+)`/.exec(line)?.[1])
  .filter((k): k is string => k !== undefined);

// `ega:conv:t:<origin>` documents the `ega:conv:t:` prefix; a bare key needs its own row.
const documented = (key: string): boolean =>
  tableKeys.some((t) => t === key || t.replace(/<[^>]+>$/, '') === key);

describe('privacy: every storage key is in the ARCHITECTURE Storage shape table', () => {
  it('finds keys from each shape it scans', () => {
    expect(codeKeys).toEqual(expect.arrayContaining(['ega.settings', 'egaAuditLog', 'ega-debug']));
  });

  it('no key in src/ is missing from the table', () => {
    expect(codeKeys.filter((k) => !documented(k))).toEqual([]);
  });
});
