import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRules } from '../../../scripts/shadow-css-lint';

const css = parseRules(readFileSync('src/options/options.css', 'utf8'));

function decls(selector: string): Map<string, string> {
  const found = css.find((r) => r.selectors.includes(selector));
  if (!found) throw new Error(`no rule ${selector} in options.css`);
  return found.decls;
}

describe('options.css page-wide rules', () => {
  // --color-border is 1.37:1 in light and 1.65:1 in dark; the Name field beside these uses the 3:1 control edge.
  it('gives a raw text field, select and textarea the 3:1 control edge of the shared Input (RD2-05)', () => {
    for (const sel of ["input[type='text']", 'select', 'textarea']) {
      expect(decls(sel).get('border')).toBe('1px solid var(--color-control-border)');
    }
  });

  it('keeps the bare-label margin off the shared checkbox and radio rows (RD2-07)', () => {
    expect(decls('label.ega-checkbox').get('margin')).toBe('0');
    expect(decls('label.ega-radio-row').get('margin-block')).toBe('0');
  });
});
