import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read from disk: the `?inline` CSS transform does not run under vitest, so the import is empty.
const tokensCss = readFileSync(resolve('src/shared/tokens.css'), 'utf8');

function block(name: string): string {
  const start = tokensCss.indexOf(name);
  if (start < 0) return '';
  const open = tokensCss.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < tokensCss.length; i++) {
    if (tokensCss[i] === '{') depth++;
    if (tokensCss[i] === '}') {
      depth--;
      if (depth === 0) return tokensCss.slice(open, i);
    }
  }
  return '';
}

describe('forced-colors focus ring', () => {
  const forced = block('@media (forced-colors: active)');

  it('has a forced-colors block', () => {
    expect(forced).not.toBe('');
  });

  it('restores the ring on keyboard focus with a system color', () => {
    expect(forced).toContain(':focus-visible');
    expect(forced).toMatch(/outline:\s*2px solid Highlight/);
  });

  it('rings the picked state, which the mode strips of its background tint', () => {
    expect(forced).toMatch(
      /\[aria-pressed='true'\],\s*\[aria-selected='true'\],\s*\[role='radio'\]\[aria-checked='true'\]:not\(:focus-visible\)/,
    );
    expect(forced).toMatch(
      /\[aria-selected='true'\][\s\S]{0,120}outline:\s*2px solid Highlight\s*!important/,
    );
  });

  it('does not stack opacity on GrayText for disabled controls', () => {
    expect(forced).toMatch(
      /:disabled,\s*\[aria-disabled='true'\][\s\S]{0,80}opacity:\s*1\s*!important/,
    );
    // Proves the override is what neutralizes the dimming, not a silent deletion of it.
    const iconBtn = readFileSync(resolve('src/shared/ui/IconButton.svelte'), 'utf8');
    expect(iconBtn).toMatch(/\.ega-icon-btn:disabled\)[\s\S]{0,80}opacity:\s*0\.55/);
  });

  it('keeps the focus ring last, so a focused pressed control keeps the outside ring', () => {
    expect(forced.lastIndexOf(':focus-visible {')).toBeGreaterThan(
      forced.indexOf("[aria-pressed='true']"),
    );
  });

  it('leaves a focused checked radio to the focus ring, which source order alone cannot do', () => {
    // [role][aria-checked] outranks a bare :focus-visible, so the inset ring would win on the focused radio.
    expect(forced).toContain("[role='radio'][aria-checked='true']:not(:focus-visible)");
  });

  it('wins over the components that replace the ring with a border or a shadow', () => {
    // Those rules are more specific, and @media adds no specificity.
    expect(forced).toMatch(/outline:[^;]*!important/);
  });
});
