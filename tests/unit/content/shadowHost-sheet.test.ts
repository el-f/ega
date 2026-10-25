// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import shadowCss from '@/content/shadow.css?inline';
import { ensureShadowSheet, getShadowRoot } from '@/content/shadowHost';

afterEach(() => {
  document.getElementById('ega-shadow-host')?.remove();
});

describe('the root sheet', () => {
  // shadow.css imports tokens.css, which holds .ega-stable; a second copy would only drift.
  it('carries the StableLabel rules once, from tokens.css (R63)', () => {
    const sheet = getShadowRoot().querySelector('style')?.textContent ?? '';
    expect(sheet).toBe(shadowCss);
    expect(readFileSync(resolve(process.cwd(), 'src/content/shadow.css'), 'utf8')).toMatch(
      /^@import '\.\.\/shared\/tokens\.css';/,
    );
    expect(readFileSync(resolve(process.cwd(), 'src/shared/tokens.css'), 'utf8')).toMatch(
      /\.ega-stable > \[data-label\]::before\s*\{\s*content: attr\(data-label\);/,
    );
  });
});

describe('ensureShadowSheet', () => {
  it('adds a lazy surface sheet to the shadow root once', () => {
    ensureShadowSheet('ega-test-sheet', '.x { color: red; }');
    ensureShadowSheet('ega-test-sheet', '.x { color: red; }');
    const sheets = getShadowRoot().querySelectorAll('#ega-test-sheet');
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.textContent).toBe('.x { color: red; }');
  });

  it('adds it again to a host the page rebuilt', () => {
    ensureShadowSheet('ega-test-sheet', '.x {}');
    document.getElementById('ega-shadow-host')?.remove();
    ensureShadowSheet('ega-test-sheet', '.x {}');
    expect(getShadowRoot().querySelector('#ega-test-sheet')).not.toBeNull();
  });
});
