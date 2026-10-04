import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { coverageIdOf } from '../coverage-marker';

export function changedFlowFiles(base = 'origin/master'): string[] {
  const raw = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf-8' });
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.flow.spec.ts'))
    .map((s) => path.relative('tests/e2e/flows', s).replace(/\\/g, '/'));
}

/** The id in the spec's `coverage:` marker, the key the journey reporter writes under; empty for a deleted or unmarked file. */
export function coverageIdsFromFlowFile(rel: string, root = 'tests/e2e/flows'): string[] {
  let source: string;
  try {
    source = readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return [];
  }
  const id = coverageIdOf(source);
  return id === null ? [] : [id];
}
