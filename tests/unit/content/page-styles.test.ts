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
