import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Runes only transform in .svelte and .svelte.ts files; in a plain .ts they throw ReferenceError at runtime.

const RUNE_RE = /\B\$(?:state|effect|derived|props|host|inspect)\b/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) yield* walk(abs);
    else if (abs.endsWith('.ts') && !abs.endsWith('.svelte.ts') && !abs.endsWith('.d.ts'))
      yield abs;
  }
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('rune-in-plain-ts guard', () => {
  it('no plain .ts file in src/ references a Svelte rune (must be .svelte.ts)', () => {
    const srcRoot = path.resolve(__dirname, '..', '..', 'src');
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const stripped = stripComments(readFileSync(file, 'utf8'));
      if (RUNE_RE.test(stripped)) offenders.push(path.relative(srcRoot, file));
    }
    expect(offenders).toEqual([]);
  });
});
