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

function mediaRule(condition: string, selector: string): CSSStyleDeclaration | undefined {
  document.head.innerHTML = `<style>${css}</style>`;
  const media = Array.from(document.styleSheets[0]?.cssRules ?? []).filter(
    (r): r is CSSMediaRule => r instanceof CSSMediaRule && r.media.mediaText === condition,
  );
  for (const m of media) {
    const hit = Array.from(m.cssRules).find(
      (r): r is CSSStyleRule =>
        r instanceof CSSStyleRule && r.selectorText.replace(/\s+/g, ' ') === selector,
    );
    if (hit) return hit.style;
  }
  return undefined;
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

  it('leaves pointer events on, so the hover titles on the pills work', () => {
    expect(rule('.tooltip .meta')?.getPropertyValue('pointer-events')).toBe('');
  });

  it('sizes the confidence pill with the 11px token, not a raw 10px', () => {
    expect(rule('.tooltip .pill')?.getPropertyValue('font-size')).toBe('var(--fs-xs)');
  });

  it('pushes the pills to the end of the action row', () => {
    expect(rule('.tooltip .actions .meta')?.getPropertyValue('margin-left')).toBe('auto');
  });

  it('fades a disabled action, which cannot take focus', () => {
    expect(rule('.tooltip .actions .icon-btn:disabled')?.getPropertyValue('opacity')).toBe('0.35');
  });

  // A blocked swap stays focusable; opacity would fade its focus ring and the label that says why it is blocked.
  it('greys an aria-disabled action with the disabled color, not opacity', () => {
    const blocked = rule(".tooltip .actions .icon-btn[aria-disabled='true']");
    expect(blocked?.getPropertyValue('opacity')).toBe('');
    expect(blocked?.getPropertyValue('color')).toBe('var(--color-fg-disabled)');
  });

  it('draws an aria-disabled action in GrayText under forced colors', () => {
    expect(
      mediaRule(
        '(forced-colors: active)',
        ".tooltip .actions .icon-btn[aria-disabled='true']",
      )?.getPropertyValue('color'),
    ).toBe('graytext');
  });

  // The generic action-button hover underline outranks .icon-btn, and the enabled-only reset left a disabled Explain underlined.
  it('never underlines a hovered icon button, disabled or not', () => {
    expect(rule('.tooltip .actions .icon-btn:hover')?.getPropertyValue('text-decoration')).toBe(
      'none',
    );
  });

  // The swap labels name both languages, far past 160px; nowrap ran the text past its own background box.
  it('wraps an action label inside its box', () => {
    const label = rule(
      ".tooltip .actions .icon-btn[data-tooltip]:not([data-tooltip='']):hover::after, .tooltip .actions .icon-btn[data-tooltip]:not([data-tooltip='']):focus-visible::after",
    );
    expect(label?.getPropertyValue('white-space')).toBe('normal');
    expect(label?.getPropertyValue('max-width')).toBe('220px');
    // The button's line-height: 1 would put a wrapped second line on the box edge.
    expect(label?.getPropertyValue('line-height')).toBe('var(--lh-heading)');
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
