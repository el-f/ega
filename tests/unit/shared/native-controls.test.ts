import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function svelteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return svelteFiles(p);
    return p.endsWith('.svelte') ? [p] : [];
  });
}

/** The primitives own the dark-theme skin (appearance:none); LanguagePicker repeats it for its optgroups. */
const OWNERS = {
  select: ['src/shared/ui/Select.svelte', 'src/shared/components/LanguagePicker.svelte'],
  checkbox: ['src/shared/ui/Checkbox.svelte'],
};

function offenders(pattern: RegExp, owners: readonly string[]): string[] {
  return svelteFiles('src')
    .map((p) => relative('.', p).split(sep).join('/'))
    .filter((p) => !owners.includes(p) && pattern.test(withoutComments(readFileSync(p, 'utf8'))));
}

function withoutComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

describe('native form controls', () => {
  // Windows dark mode paints a native select chevron and check light; only the primitives restyle them.
  it('every select goes through the shared Select (or LanguagePicker)', () => {
    expect(offenders(/<select\b/, OWNERS.select)).toEqual([]);
  });

  it('every checkbox goes through the shared Checkbox', () => {
    expect(offenders(/type="checkbox"/, OWNERS.checkbox)).toEqual([]);
  });

  it('LanguagePicker carries the same appearance reset as Select', () => {
    const css = readFileSync('src/shared/components/LanguagePicker.svelte', 'utf8');
    expect(css).toMatch(/\bappearance:\s*none/);
    expect(css).toMatch(/color-scheme:\s*dark/);
  });
});
