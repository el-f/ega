// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve('src/content/shadow.css'), 'utf8');

function rule(selector: string): CSSStyleDeclaration | undefined {
  document.head.innerHTML = `<style>${css}</style>`;
  const rules = Array.from(document.styleSheets[0]?.cssRules ?? []);
  return rules.find(
    (r): r is CSSStyleRule =>
      r instanceof CSSStyleRule && r.selectorText.replace(/\s+/g, ' ') === selector,
  )?.style;
}

describe('tooltip chrome', () => {
  it('keeps a floor width, so the loading card does not jump wider when the answer lands', () => {
    expect(rule('.tooltip')?.getPropertyValue('min-width')).toBe('220px');
  });

  it('draws no focus ring on the panel itself, which takes focus only so Esc works', () => {
    expect(rule('.tooltip:focus, .tooltip:focus-visible')?.getPropertyValue('outline')).toBe(
      'none',
    );
  });

  it('shows Cancel, the one classless action, as a bordered button rather than a text link', () => {
    const cancel = rule('.tooltip .actions button:not([class])');
    expect(cancel?.getPropertyValue('border')).toMatch(/solid/);
    expect(
      rule('.tooltip .actions button:not([class]):hover')?.getPropertyValue('text-decoration'),
    ).toBe('none');
  });
});
