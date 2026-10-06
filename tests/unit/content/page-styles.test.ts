// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensurePageStyles, resetPageStyles } from '@/content/page-styles';

// Read from disk: the `?inline` CSS transform does not run under vitest, so the import is empty.
const pageCss = readFileSync(resolve('src/content/page-styles.css'), 'utf8');
const shadowCss = readFileSync(resolve('src/content/shadow.css'), 'utf8');

/** Each selector matches an element created in the PAGE DOM, which the shadow sheet cannot reach. */
const PAGE_DOM_SELECTORS = [
  '[data-ega-replaced]',
  '[data-ega-pending]',
  '[data-ega-tx]',
  '[data-ega-retry-block]',
  '[data-ega-tx-error]',
  '[data-ega-picking]',
];

describe('ensurePageStyles', () => {
  beforeEach(() => {
    resetPageStyles();
    document.head.innerHTML = '';
  });

  it('injects a style element under the page-styles id', () => {
    ensurePageStyles();
    expect(document.getElementById('ega-page-styles')).toBeInstanceOf(HTMLStyleElement);
  });

  it('is idempotent — a second call adds nothing', () => {
    ensurePageStyles();
    ensurePageStyles();
    expect(document.querySelectorAll('#ega-page-styles')).toHaveLength(1);
  });

  it('re-injects after the page detaches the element', () => {
    ensurePageStyles();
    document.getElementById('ega-page-styles')?.remove();
    ensurePageStyles();
    expect(document.querySelectorAll('#ega-page-styles')).toHaveLength(1);
  });

  it('never adopts a decoy element the page planted under our id', () => {
    const decoy = document.createElement('style');
    decoy.id = 'ega-page-styles';
    decoy.textContent = '/* not ours */';
    document.head.appendChild(decoy);

    ensurePageStyles();

    expect(document.querySelectorAll('#ega-page-styles')).toHaveLength(2);
    expect(decoy.textContent).toBe('/* not ours */');
  });
});

describe('the page sheet covers every page-DOM selector', () => {
  it.each(PAGE_DOM_SELECTORS)('%s has a rule in page-styles.css', (selector) => {
    expect(pageCss).toContain(selector);
  });

  it('uses no CSS custom properties — the page document declares none of ours', () => {
    expect(pageCss).not.toMatch(/var\(--/);
  });

  it('the shadow sheet does not re-declare them — nothing in the shadow tree carries these', () => {
    // A copy there is dead CSS and drifts from this sheet; only page-DOM code emits these markers.
    for (const selector of PAGE_DOM_SELECTORS) {
      expect(shadowCss).not.toContain(selector);
    }
  });
});

// jsdom resolves the cascade for these properties, so this reads what the user would see.
const VISUAL_PROPS = [
  'outline',
  'outlineColor',
  'outlineOffset',
  'outlineStyle',
  'outlineWidth',
  'boxShadow',
  'backgroundColor',
  'border',
  'filter',
] as const;

function paint(attrs: string): Record<string, string> {
  document.head.innerHTML = `<style>${pageCss}</style>`;
  document.body.innerHTML = `<p id="blk" ${attrs}>text</p>`;
  const el = document.getElementById('blk');
  if (!el) throw new Error('test setup: block missing');
  const cs = getComputedStyle(el);
  return Object.fromEntries(VISUAL_PROPS.map((p) => [p, cs[p]]));
}

function differing(a: Record<string, string>, b: Record<string, string>): string[] {
  return VISUAL_PROPS.filter((p) => a[p] !== b[p]);
}

describe('translate-areas — the keyboard cursor is visible on a selected block', () => {
  const plain = () => paint('');
  const cursorOnly = () => paint('data-ega-ms-cursor');
  const selectedOnly = () => paint('data-ega-ms-selected="1"');
  const both = () => paint('data-ega-ms-cursor data-ega-ms-selected="1"');

  it('a selected block under the cursor looks different from a selected block without it', () => {
    expect(differing(both(), selectedOnly())).not.toEqual([]);
  });

  it('paints the cursor through the same channel whether or not the block is selected', () => {
    expect(differing(cursorOnly(), plain())).toEqual(differing(both(), selectedOnly()));
  });

  it('leaves the selection its own signal — the two never read as one state', () => {
    expect(differing(selectedOnly(), plain())).not.toEqual([]);
    expect(differing(both(), cursorOnly())).not.toEqual([]);
  });
});

describe('picker mode — the page shows a crosshair', () => {
  it('every page element takes the crosshair while the root carries the picking marker', () => {
    document.documentElement.setAttribute('data-ega-picking', '');
    try {
      paint('style="cursor: pointer"');
      const el = document.getElementById('blk');
      if (!el) throw new Error('test setup: block missing');
      expect(getComputedStyle(el).cursor).toBe('crosshair');
    } finally {
      document.documentElement.removeAttribute('data-ega-picking');
    }
  });
});

/** The style declarations a media block applies to `selector`, parsed by the CSSOM. */
function underMedia(media: string, selector: string): CSSStyleDeclaration | undefined {
  document.head.innerHTML = `<style>${pageCss}</style>`;
  const sheet = document.styleSheets[0];
  if (!sheet) throw new Error('test setup: sheet missing');
  for (const rule of Array.from(sheet.cssRules)) {
    if (!(rule instanceof CSSMediaRule) || !rule.media.mediaText.includes(media)) continue;
    for (const inner of Array.from(rule.cssRules)) {
      if (inner instanceof CSSStyleRule && inner.selectorText.includes(selector))
        return inner.style;
    }
  }
  return undefined;
}

describe('reduced motion — the page sheet stops its own motion', () => {
  it('a settled block drops its tint without a fade, after the same 2 s', () => {
    const style = underMedia('prefers-reduced-motion: reduce', "[data-ega-tx-state='ok']");
    const transition = style?.getPropertyValue('transition') ?? '';
    expect(transition).toMatch(/background-color 0s 2s/);
  });
});

describe('page translate — a block still waiting on its reply moves', () => {
  // jsdom does not expand the animation shorthand, so these read the parsed rules.
  function topLevel(selector: string): CSSStyleDeclaration | undefined {
    document.head.innerHTML = `<style>${pageCss}</style>`;
    const rules = Array.from(document.styleSheets[0]?.cssRules ?? []);
    return rules.find(
      (r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === selector,
    )?.style;
  }

  it('a pending block, in either mode, shows one spinner at its inline end', () => {
    const style = topLevel('[data-ega-pending]::after');
    expect(style?.getPropertyValue('animation')).toMatch(/^ega-inline-spin .* infinite$/);
    expect(style?.getPropertyValue('margin-inline-start')).toBe('0.35em');
  });

  it('reduced motion holds the spinner still', () => {
    const style = underMedia('prefers-reduced-motion: reduce', '[data-ega-pending]::after');
    expect(style?.getPropertyValue('animation')).toBe('none');
  });

  it('a pending Show-both sibling keeps a line of height, so the bar shows before any words', () => {
    expect(topLevel('[data-ega-tx][data-ega-pending]')?.getPropertyValue('min-height')).toBe('1em');
  });
});

describe('page translate — error blocks on any page theme', () => {
  function rule(selector: string): CSSStyleDeclaration | undefined {
    document.head.innerHTML = `<style>${pageCss}</style>`;
    const rules = Array.from(document.styleSheets[0]?.cssRules ?? []);
    return rules.find(
      (r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === selector,
    )?.style;
  }

  it('the chip host takes no page styles of its own; its shadow root draws it', () => {
    const style = rule('[data-ega-tx-error]');
    expect(style?.getPropertyValue('display')).toBe('inline-flex');
    expect(style?.getPropertyValue('font-size')).toBe('');
  });

  it('no translated block carries a help cursor', () => {
    expect(pageCss).not.toMatch(/cursor:\s*help/);
  });

  it('the retry button is never hidden at rest', () => {
    expect(
      rule("[data-ega-tx-state='error'] [data-ega-retry-block]")?.getPropertyValue('opacity'),
    ).toBe('');
    expect(pageCss).not.toMatch(/\[data-ega-retry-block\][^{]*\{[^}]*opacity:\s*0/);
  });
});

describe('inline replace — a pending wrapper shows that a reply is coming', () => {
  function topLevel(selector: string): CSSStyleDeclaration | undefined {
    document.head.innerHTML = `<style>${pageCss}</style>`;
    const rules = Array.from(document.styleSheets[0]?.cssRules ?? []);
    return rules.find(
      (r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === selector,
    )?.style;
  }

  it('draws a spinning ring after the dimmed original', () => {
    const style = topLevel('[data-ega-pending]::after');
    expect(style?.getPropertyValue('content')).toMatch(/^(''|"")$/);
    expect(style?.getPropertyValue('animation')).toMatch(/ega-inline-spin/);
  });

  it('holds the ring still under reduced motion', () => {
    const style = underMedia('prefers-reduced-motion: reduce', '[data-ega-pending]::after');
    expect(style?.getPropertyValue('animation')).toBe('none');
  });
});

describe('bilingual — a translation reads as added, not as page text', () => {
  it('tints the translation and gives it a firm side bar', () => {
    document.head.innerHTML = `<style>${pageCss}</style>`;
    const rules = Array.from(document.styleSheets[0]?.cssRules ?? []);
    const style = rules.find(
      (r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === '[data-ega-tx]',
    )?.style;
    expect(style?.getPropertyValue('background-color')).toMatch(/rgba\(0, 144, 255/);
    expect(style?.getPropertyValue('border-inline-start')).toMatch(/^3px solid/);
  });
});
