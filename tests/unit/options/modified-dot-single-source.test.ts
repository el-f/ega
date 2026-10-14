import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// `isFieldModified` is the one answer; a re-inlined default comparison drifts from it silently.

const ROOT = resolve('src/options');

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...svelteFiles(p));
    else if (e.name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** `modified={...}` / `differsFromInherited={...}` bodies, non-greedy to the closing brace. */
const DOT_PROP = /(?:modified|differsFromInherited)=\{([^{}]*)\}/g;

describe('options — the modified dot has one implementation', () => {
  it('no component compares a field to a shipped default inline', () => {
    const offenders: string[] = [];
    for (const file of svelteFiles(ROOT)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(DOT_PROP)) {
        const body = m[1] ?? '';
        if (/\bDEF\b|DEFAULT_/.test(body))
          offenders.push(`${relative(ROOT, file)}: ${body.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
