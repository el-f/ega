import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// A fixed sleep flakes when too short and slows the suite when long: wait on the state (waitFor, flushAsync, fake timers).

/** On whitespace-free source: a promise whose resolver goes straight to setTimeout. A 0 ms delay is one macrotask turn, not a sleep. */
const SLEEP_RE = /newPromise(?:<[^>]*>)?\(\(?(\w+)(?::[^)=]*)?\)?=>\{?setTimeout\(\1,([^)]+)\)/g;

const SELF = 'tests/unit/no-fixed-sleeps.test.ts';

/** Kept sleeps by file and count, each with a comment saying real time is what it tests. Empty today. */
const ALLOWED: Record<string, number> = {};

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return testFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

function sleepsIn(src: string): number {
  return [...src.replace(/\s+/g, '').matchAll(SLEEP_RE)].filter((m) => m[2] !== '0').length;
}

describe('unit and integration tests', () => {
  it('wait on state, not on a fixed sleep', () => {
    const found: Record<string, number> = {};
    for (const p of [...testFiles('tests/unit'), ...testFiles('tests/integration')]) {
      const file = relative('.', p).replaceAll('\\', '/');
      if (file === SELF) continue;
      const n = sleepsIn(readFileSync(p, 'utf8'));
      if (n > 0) found[file] = n;
    }
    expect(found).toEqual(ALLOWED);
  });

  it('catches the sleep shapes it is meant to catch, and lets a 0 ms turn through', () => {
    const shapes = [
      'await new Promise((r) => setTimeout(r, 50));',
      'await new Promise<void>((resolve) => setTimeout(resolve, 10));',
      'const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));',
      'await new Promise((r) => {\n  setTimeout(r, 25);\n});',
    ];
    for (const s of shapes) expect(sleepsIn(s), s).toBe(1);
    expect(sleepsIn('await new Promise((r) => setTimeout(r, 0));')).toBe(0);
  });
});
