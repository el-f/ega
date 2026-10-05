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

describe('tooltip meta row contrast', () => {
  it('puts no opacity on the row, which no child pill could undo', () => {
    expect(rule('.tooltip .meta')?.getPropertyValue('opacity')).toBe('');
  });

  it('colors the low-confidence pill with the -fg shade that clears 4.5:1', () => {
    expect(rule('.pill.lo')?.getPropertyValue('color')).toBe('var(--color-danger-fg)');
  });
});

describe('tooltip error body', () => {
  it('drops pre-wrap, so the space between the title and the sentence is not a blank line', () => {
    expect(rule('.tooltip .tooltip-error-body')?.getPropertyValue('white-space')).toBe('normal');
  });
});
