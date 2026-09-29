import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// tokens.css puts the pseudo ABOVE — a rule that moves it BELOW must clear bottom + transform.

function readStyles(): string {
  const path = resolve(__dirname, '../../../src/content/styles.css');
  return readFileSync(path, 'utf8');
}

function readTokens(): string {
  const path = resolve(__dirname, '../../../src/shared/tokens.css');
  return readFileSync(path, 'utf8');
}

function extractRuleBody(css: string, selectorFragment: string): string {
  // First matching rule only — these files have no nested at-rules.
  const idx = css.indexOf(selectorFragment);
  if (idx < 0) throw new Error(`selector "${selectorFragment}" not found`);
  const openIdx = css.indexOf('{', idx);
  const closeIdx = css.indexOf('}', openIdx);
  if (openIdx < 0 || closeIdx < 0) throw new Error('rule braces not found');
  return css.slice(openIdx + 1, closeIdx);
}

describe('Context tooltip stem resets the global cascade', () => {
  it('local .tooltip .actions .icon-btn ::after resets bottom + transform from global tokens', () => {
    const styles = readStyles();
    const body = extractRuleBody(
      styles,
      ".tooltip .actions .icon-btn[data-tooltip]:not([data-tooltip='']):hover::after",
    );
    expect(body).toMatch(/bottom:\s*auto/);
    // Without `transform: none` the global translateX(-50%) and the local `translate` reach -100%.
    expect(body).toMatch(/transform:\s*none/);
    expect(body).toMatch(/top:\s*calc\(100%\s*\+\s*4px\)/);
  });

  it('local .ega-icon-btn ::after resets bottom + transform from global tokens', () => {
    const styles = readStyles();
    const body = extractRuleBody(
      styles,
      ".ega-icon-btn[data-tooltip]:not([data-tooltip='']):hover::after",
    );
    expect(body).toMatch(/bottom:\s*auto/);
    expect(body).toMatch(/transform:\s*none/);
    expect(body).toMatch(/top:\s*calc\(100%\s*\+\s*4px\)/);
  });

  it('tokens.css still positions the default tooltip ABOVE — local must override', () => {
    const tokens = readTokens();
    const body = extractRuleBody(tokens, "[data-tooltip]:not([data-tooltip='']):hover::after");
    expect(body).toMatch(/bottom:\s*calc\(100%\s*\+\s*6px\)/);
    expect(body).toMatch(/transform:\s*translateX\(-50%\)/);
  });
});
