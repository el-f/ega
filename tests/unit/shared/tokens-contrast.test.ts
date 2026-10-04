import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read from disk: the `?inline` CSS transform does not run under vitest, so the import is empty.
const css = readFileSync(resolve('src/shared/tokens.css'), 'utf8');

function lum(hex: string): number {
  const ch = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** The declarations of the first block that starts at `selector`. */
function block(selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`no block ${selector}`);
  return css.slice(css.indexOf('{', start), css.indexOf('\n}', start));
}

function token(decls: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(decls);
  if (!m?.[1]) throw new Error(`no ${name}`);
  return m[1];
}

const THEMES: Record<string, string> = {
  'dark (default)': block(':root,'),
  light: block("[data-theme='light'],"),
  'dark (explicit)': block("[data-theme='dark'],"),
};

describe.each(Object.entries(THEMES))('%s theme contrast', (_name, decls) => {
  it('draws a form control edge at 3:1 or more on the elevated surface', () => {
    const elevated = /--color-bg-elevated:\s*(#[0-9a-f]{6})/i.exec(decls)?.[1];
    expect(elevated).toBeDefined();
    expect(ratio(token(decls, '--color-control-border'), elevated ?? '')).toBeGreaterThanOrEqual(3);
  });

  it('reads text on the accent fill at 4.5:1 or more', () => {
    const fg = token(decls, '--color-accent-fg');
    expect(ratio(fg, token(decls, '--color-accent'))).toBeGreaterThanOrEqual(4.5);
  });
});
