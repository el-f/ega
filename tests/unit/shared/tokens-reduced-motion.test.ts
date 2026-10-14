import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKENS = join(__dirname, '..', '..', '..', 'src/shared/tokens.css');

// jsdom cannot evaluate media queries, so assert the press transform and its reduced-motion override as text.
describe('tokens.css reduced-motion', () => {
  const css = readFileSync(TOKENS, 'utf8');

  it('declares the universal button press transform', () => {
    expect(css).toMatch(/button:not\(:disabled\):active\s*\{[^}]*transform:\s*scale\(0\.97\)/);
  });

  it('suppresses the press transform under prefers-reduced-motion', () => {
    // Match `@media (prefers-reduced-motion: reduce)` followed (within ~400
    // chars) by the active-press rule resetting transform to `none`.
    const re =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]{0,600}?button:not\(:disabled\):active\s*\{[^}]*transform:\s*none/;
    expect(css).toMatch(re);
  });
});
