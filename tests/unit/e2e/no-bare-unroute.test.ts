import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function specFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return specFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('e2e route resets', () => {
  it('go through resetRoutes, so the local-Ollama block survives them', () => {
    // A bare unrouteAll drops the block, and a real daemon on the dev box then answers the fallback.
    const count = (p: string): number =>
      (readFileSync(p, 'utf8').match(/\.unrouteAll\(/g) ?? []).length;
    const helpers = join('tests', 'e2e', 'helpers.ts');
    const offenders = specFiles('tests/e2e')
      .filter((p) => relative('.', p) !== helpers && count(p) > 0)
      .map((p) => relative('.', p));
    expect(offenders).toEqual([]);
    // The one call inside resetRoutes itself.
    expect(count(helpers)).toBe(1);
  });

  it('resetRoutes puts the Ollama block back after clearing', () => {
    const helpers = readFileSync('tests/e2e/helpers.ts', 'utf8');
    const body = /export async function resetRoutes[\s\S]*?\n\}/.exec(helpers)?.[0] ?? '';
    expect(body.indexOf('unrouteAll')).toBeGreaterThan(-1);
    expect(body.indexOf('blockLocalServers')).toBeGreaterThan(body.indexOf('unrouteAll'));
  });
});
