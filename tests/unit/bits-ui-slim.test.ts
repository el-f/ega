import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHIM = 'tests/mocks/bits-ui-slim.ts';
const NAMED_IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]bits-ui['"]/g;
const ANY_IMPORT = /from\s+['"]bits-ui['"]|import\(\s*['"]bits-ui['"]/g;

const sources = readdirSync(path.join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.(?:ts|svelte)$/.test(e.name))
  .map((e) => {
    const file = path.join(e.parentPath, e.name);
    return { file: path.relative(ROOT, file), text: readFileSync(file, 'utf8') };
  });

const imports = sources.flatMap(({ file, text }) =>
  [...text.matchAll(NAMED_IMPORT)]
    .filter((m) => !m[1])
    .flatMap((m) => (m[2] ?? '').split(','))
    .map((s) => s.trim())
    .filter((s) => s !== '' && !s.startsWith('type '))
    .map((s) => ({ name: s.split(/\s+as\s+/)[0] ?? s, file })),
);

const exported = new Set(
  [...readFileSync(path.join(ROOT, SHIM), 'utf8').matchAll(/export\s+\{\s*(\w+)\s*\}/g)].map(
    (m) => m[1],
  ),
);

describe('the vitest bits-ui shim', () => {
  it('finds the bits-ui imports in src/', () => {
    expect(imports.map((i) => i.name)).toContain('DropdownMenu');
  });

  it('sees only named imports, the one form it can check', () => {
    const other = sources
      .filter(({ text }) => text.match(ANY_IMPORT)?.length !== text.match(NAMED_IMPORT)?.length)
      .map(({ file }) => file);
    expect(other, `import bits-ui as import { X } from 'bits-ui' in`).toEqual([]);
  });

  it('exports every bits-ui name src/ imports', () => {
    const missing = imports
      .filter((i) => !exported.has(i.name))
      .map((i) => `${i.name} (${i.file})`);
    expect(
      missing,
      `add each to ${SHIM}: export { X } from '../../node_modules/bits-ui/dist/bits/<x>/index.js'`,
    ).toEqual([]);
  });
});
