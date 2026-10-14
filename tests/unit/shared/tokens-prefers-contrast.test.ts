import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read from disk: the `?inline` CSS transform does not run under vitest, so the import is empty.
const css = readFileSync(resolve('src/shared/tokens.css'), 'utf8');

const contrastSection = css.slice(css.indexOf('@media (prefers-contrast: more)'));

describe('prefers-contrast: more', () => {
  it('has a prefers-contrast section', () => {
    expect(css).toContain('@media (prefers-contrast: more)');
  });

  it('lifts both border tokens, not only one', () => {
    expect(contrastSection).toMatch(/--color-border-subtle:\s*#5a6169/);
    expect(contrastSection).toMatch(/--color-border:\s*#696e77/);
    expect(contrastSection).toMatch(/--color-border-subtle:\s*#8b8d98/);
    expect(contrastSection).toMatch(/--color-border:\s*#80838d/);
  });

  it('covers all four theme cases', () => {
    expect(contrastSection).toMatch(/@media \(prefers-contrast: more\) \{\s*:root/);
    expect(contrastSection).toContain(
      '@media (prefers-contrast: more) and (prefers-color-scheme: light)',
    );
    expect(contrastSection).toContain("[data-theme='light']");
    expect(contrastSection).toContain("[data-theme='dark']");
  });

  // Equal specificity, so source order decides: a forced-dark panel on a light OS must not get light borders.
  it('puts the explicit dark override last', () => {
    expect(contrastSection.indexOf("[data-theme='dark']")).toBeGreaterThan(
      contrastSection.indexOf("[data-theme='light']"),
    );
  });
});
