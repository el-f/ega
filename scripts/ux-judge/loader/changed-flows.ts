import { execSync } from 'node:child_process';
import path from 'node:path';

export function changedFlowFiles(base = 'origin/master'): string[] {
  const raw = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf-8' });
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.flow.spec.ts'))
    .map((s) => path.relative('tests/e2e/flows', s).replace(/\\/g, '/'));
}

/** Maps `<family>/<surface>/<action>.flow.spec.ts` to one id; empty means skip the file. */
export function coverageIdsFromFlowFile(rel: string): string[] {
  const cleaned = rel.replace(/\.flow\.spec\.ts$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length < 3) return [];
  const family = parts[0];
  const surface = parts[1];
  const action = parts.slice(2).join('-');
  return [`${family}.${surface}.${action}`];
}
