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

function block(selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`no block ${selector}`);
  return css.slice(css.indexOf('{', start), css.indexOf('\n}', start));
}

function token(decls: string, name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(decls);
  if (!m?.[1]) throw new Error(`no ${name}`);
  return m[1].trim();
}

/** The rule body whose selector line is exactly `selector`. */
function rule(file: string, selector: string): string {
  const src = readFileSync(file, 'utf8');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^\\s*${escaped} \\{([^}]*)\\}`, 'm').exec(src);
  if (!m?.[1]) throw new Error(`no rule ${selector} in ${file}`);
  return m[1];
}

describe('type scale', () => {
  const root = block(':root,');

  it('keeps every text size at 12px or more', () => {
    const sizes = [...root.matchAll(/--fs-[\w-]+:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it('gives reading text a 1.5 line height', () => {
    expect(Number(token(root, '--lh-body'))).toBeGreaterThanOrEqual(1.5);
  });
});

const THEMES: Record<string, string> = {
  'dark (default)': block(':root,'),
  'light (OS)': block(':root,', css.indexOf('@media (prefers-color-scheme: light)')),
  light: block("[data-theme='light'],"),
  'dark (explicit)': block("[data-theme='dark'],"),
};

describe.each(Object.entries(THEMES))('%s placeholder text', (_name, decls) => {
  // The light theme's explicit block inherits the surface colors it does not restate, so read them from the theme that defines them.
  const surface = (name: string): string => {
    const own = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(decls)?.[1];
    return own ?? token(THEMES['dark (default)'] ?? '', name);
  };

  it.each(['--color-bg', '--color-bg-elevated', '--color-bg-sunken'])(
    'reads at 4.5:1 or more on %s',
    (bg) => {
      expect(ratio(token(decls, '--color-placeholder'), surface(bg))).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('shared controls', () => {
  it('draws the secondary button edge with the 3:1 control border', () => {
    expect(rule('src/shared/ui/Button.svelte', '.variant-secondary')).toMatch(
      /border-color: var\(--color-control-border\);/,
    );
  });

  it('sets popover titles in sentence case at the 12px size', () => {
    const title = rule('src/shared/ui/Popover.svelte', '.ega-popover-title');
    expect(title).not.toMatch(/text-transform/);
    expect(title).toMatch(/font-size: var\(--fs-sm\);/);
  });
});
