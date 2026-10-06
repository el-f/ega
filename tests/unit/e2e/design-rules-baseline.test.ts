import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const E2E = join('tests', 'e2e');

/** The shot names screenshot-audit can write, as patterns: a `${...}` part matches any text. */
function auditShotPatterns(): RegExp[] {
  const source = readFileSync(join(E2E, 'screenshot-audit.spec.ts'), 'utf8');
  const literal = [...source.matchAll(/\bshot\(\s*\w+,\s*(['`])([^'`]+)\1/g)].map((m) => m[2]);
  // A loop over a table passes the name as a variable: `{ name: 'sidepanel-zoomed-refine-open', … }`.
  const tabled = [...source.matchAll(/\bname:\s*(['`])([^'`]+)\1/g)].map((m) => m[2]);
  return [...literal, ...tabled].map((name) => {
    const parts = (name ?? '').split(/\$\{[^}]+\}/);
    const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`^${escaped.join('.+')}$`);
  });
}

describe('design-rules baseline', () => {
  it('lists only captures that still exist', () => {
    // The gate keys (gate-*) are checked at the end of a full design-rules.spec run instead.
    const baseline = JSON.parse(
      readFileSync(join(E2E, 'design-rules-baseline.json'), 'utf8'),
    ) as Record<string, string[]>;
    const patterns = auditShotPatterns();
    expect(patterns.length).toBeGreaterThan(50);
    const stale = Object.keys(baseline).filter(
      (k) => !k.startsWith('gate-') && !patterns.some((p) => p.test(k)),
    );
    expect(stale).toEqual([]);
  });
});
