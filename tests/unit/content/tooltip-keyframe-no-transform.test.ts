import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Any non-`none` transform makes a stacking context that traps the hover labels behind the card.
describe('ega-tooltip-in @keyframes', () => {
  const css = readFileSync(path.join(__dirname, '../../../src/content/styles.css'), 'utf8');

  it('exists', () => {
    expect(css).toMatch(/@keyframes\s+ega-tooltip-in/);
  });

  it('ends with transform: none (NOT translateY(0) or any other non-none transform)', () => {
    // A CSS comment naming a banned value would match below, so drop comments first.
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const m = cssNoComments.match(/@keyframes\s+ega-tooltip-in\s*\{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    const body = m?.[1] ?? '';
    const toMatch = body.match(/to\s*\{([\s\S]*?)\}/);
    expect(toMatch).not.toBeNull();
    const toBody = toMatch?.[1] ?? '';
    // No transform in `to` is also fine: the property reverts to `none`.
    const transformMatch = toBody.match(/transform\s*:\s*([^;]+)/);
    if (transformMatch) {
      const value = transformMatch[1]?.trim() ?? '';
      expect(value).toBe('none');
    }
    // translateY(0) looks like an identity but still opens a stacking context.
    expect(toBody).not.toMatch(/transform\s*:\s*translate/i);
    expect(toBody).not.toMatch(/transform\s*:\s*matrix/i);
  });
});
