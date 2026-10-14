import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Chrome ties anchor-positioned pseudo-elements to the nearest scroll container, so overflow on `.tooltip` clips the button hover labels.

describe('.tooltip CSS — no outer overflow clip', () => {
  const css = readFileSync(
    path.join(__dirname, '../../../src/content/tooltip/tooltip.css'),
    'utf8',
  );

  // A CSS comment quoting the forbidden value would false-trigger the matchers.
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Match the primary `.tooltip` rule only, not descendants like `.tooltip .body`.
  function tooltipBlock(src: string): string {
    const m = src.match(/(?:^|[^.\w])\.tooltip\s*\{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    return m?.[1] ?? '';
  }

  const block = tooltipBlock(cssNoComments);

  it('.tooltip has no overflow-y: auto|scroll|hidden', () => {
    expect(block).not.toMatch(/overflow-y\s*:\s*(auto|scroll|hidden)/i);
  });

  it('.tooltip has no overflow-x: hidden (inner pseudo labels must escape)', () => {
    expect(block).not.toMatch(/overflow-x\s*:\s*hidden/i);
  });

  it('.tooltip has no shorthand `overflow:` that would clip', () => {
    // Any value other than `visible` creates a scroll or clip container.
    const m = block.match(/(?<!-)overflow\s*:\s*([a-z]+)/i);
    if (m) expect(m[1]).toBe('visible');
  });

  it('.tooltip does not cap max-height (tooltip grows with content)', () => {
    expect(block).not.toMatch(/max-height\s*:/i);
  });
});
