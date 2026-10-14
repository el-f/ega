import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SETTINGS_SPEC } from '@/shared/settings-spec';

// A spec anchor with no markup drops the search user on a tab with nothing to change.

function svelteSources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...svelteSources(p));
    else if (e.name.endsWith('.svelte')) out.push(readFileSync(p, 'utf8'));
  }
  return out;
}

const SOURCES = svelteSources(resolve('src'));

/** Attributes whose value is bound at runtime (`attr={id}` inside an each block). */
const DYNAMIC_VALUE_ATTRS: ReadonlySet<string> = new Set([
  'data-ega-task-item',
  'data-ega-api-key',
  'data-ega-cm-group',
]);

interface ParsedSelector {
  readonly attr: string;
  readonly value: string | null;
}

function parseSelector(sel: string): ParsedSelector | null {
  const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
  if (!m?.[1]) return null;
  return { attr: m[1], value: m[2] ?? null };
}

/** Matches both markup (`attr="v"`) and the `dataAttrs={{ 'attr': 'v' }}` prop form. */
function anchorExists({ attr, value }: ParsedSelector): boolean {
  if (value === null) return SOURCES.some((s) => s.includes(attr));
  if (DYNAMIC_VALUE_ATTRS.has(attr)) return SOURCES.some((s) => s.includes(`${attr}={`));
  return SOURCES.some(
    (s) =>
      s.includes(`${attr}="${value}"`) ||
      s.includes(`'${attr}': '${value}'`) ||
      s.includes(`"${attr}": "${value}"`),
  );
}

describe('settings-spec — every targetSelector anchors on real markup', () => {
  it('parses as a single attribute selector', () => {
    const bad: string[] = [];
    for (const entry of SETTINGS_SPEC) {
      if (!entry.targetSelector) continue;
      if (!parseSelector(entry.targetSelector)) bad.push(`${entry.id}: ${entry.targetSelector}`);
    }
    expect(bad).toEqual([]);
  });

  it('every anchor exists in some src/**/*.svelte', () => {
    const missing: string[] = [];
    for (const entry of SETTINGS_SPEC) {
      const sel = entry.targetSelector;
      if (!sel) continue;
      const parsed = parseSelector(sel);
      if (!parsed) continue;
      if (!anchorExists(parsed)) missing.push(`${entry.id}: ${sel}`);
    }
    expect(missing).toEqual([]);
  });

  it('every dynamic-value allowlist entry is still bound at runtime', () => {
    for (const attr of DYNAMIC_VALUE_ATTRS) {
      expect(SOURCES.some((s) => s.includes(`${attr}={`))).toBe(true);
      expect(SETTINGS_SPEC.some((e) => e.targetSelector?.startsWith(`[${attr}=`))).toBe(true);
    }
  });
});
