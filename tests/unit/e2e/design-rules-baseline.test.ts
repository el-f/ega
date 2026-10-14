import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GATE_PREFIX, staleGateKeys } from '../../e2e/design-rules-gate';

const E2E = join('tests', 'e2e');

/** The shot names screenshot-audit can write, as patterns: a `${...}` part matches any text. */
function auditShotPatterns(): RegExp[] {
  const source = readFileSync(join(E2E, 'screenshot-audit.spec.ts'), 'utf8');
  const literal = [...source.matchAll(/\bshot\(\s*\w+,\s*(['`])([^'`]+)\1/g)].map((m) => m[2]);
  // A loop over a table passes the name as a variable: `{ name: 'sidepanel-zoomed-refine-open', … }`.
  const tabled = [...source.matchAll(/\bname:\s*(['`])([^'`]+)\1/g)].map((m) => m[2]);
  // The options captures go through optShot, which writes `<name>` in light and `<name>-dark` in dark.
  const options = [...source.matchAll(/\boptShot\(\s*\w+,\s*(['`])([^'`]+)\1/g)].flatMap((m) => [
    m[2],
    `${m[2] ?? ''}-dark`,
  ]);
  return [...literal, ...tabled, ...options].map((name) => {
    const parts = (name ?? '').split(/\$\{[^}]+\}/);
    const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`^${escaped.join('.+')}$`);
  });
}

const baseline = JSON.parse(
  readFileSync(join(E2E, 'design-rules-baseline.json'), 'utf8'),
) as Record<string, string[]>;

describe('design-rules baseline', () => {
  it('lists only audit captures that still exist', () => {
    const patterns = auditShotPatterns();
    expect(patterns.length).toBeGreaterThan(50);
    const stale = Object.keys(baseline).filter(
      (k) => !k.startsWith(GATE_PREFIX) && !patterns.some((p) => p.test(k)),
    );
    expect(stale).toEqual([]);
  });

  it('lists only gate keys that design-rules.spec.ts still captures', () => {
    expect(staleGateKeys(baseline)).toEqual([]);
  });
});
