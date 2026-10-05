import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function svelteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return svelteFiles(p);
    return p.endsWith('.svelte') ? [p] : [];
  });
}

/** Every `<SectionReset ... />` with its visible label (default 'Reset section') and accessible name. */
const uses = svelteFiles('src').flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/<SectionReset\b([\s\S]*?)\/>/g)].map((m) => {
    const attrs = m[1] ?? '';
    const label = /\blabel="([^"]*)"/.exec(attrs)?.[1] ?? 'Reset section';
    const aria = /\bariaLabel="([^"]*)"/.exec(attrs)?.[1] ?? 'Reset section to defaults';
    return [file, label, aria] as const;
  }),
);

// WCAG 2.5.3: a voice user says the visible text, so the accessible name must start with it.
describe('SectionReset accessible names start with the visible text', () => {
  it('finds the callers', () => {
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });

  it.each(uses)('%s', (_file, label, aria) => {
    expect(aria.startsWith(label)).toBe(true);
  });
});
