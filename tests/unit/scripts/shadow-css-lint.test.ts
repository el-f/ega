import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  classSelectors,
  allowedClasses,
  sheetDeclares,
  markupClasses,
  readSheet,
} from '../../../scripts/shadow-css-lint';

describe('classSelectors', () => {
  it('picks up class selectors', () => {
    expect(classSelectors('.a { color: red } .b-c:hover { color: blue }')).toEqual(['a', 'b-c']);
  });

  it('ignores class-looking text inside a comment', () => {
    expect(classSelectors('/* see Tooltip.Trigger */ .real {}')).toEqual(['real']);
  });

  it('ignores class-looking text inside a quoted value', () => {
    const css = `.sel { background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>"); }`;
    expect(classSelectors(css)).toEqual(['sel']);
  });

  it('does not treat a decimal number as a class', () => {
    expect(classSelectors('.a { opacity: 0.55; margin: 1.5px }')).toEqual(['a']);
  });

  it('deduplicates repeats', () => {
    expect(classSelectors('.a {} .a:hover {} .a:focus {}')).toEqual(['a']);
  });
});

describe('sheetDeclares', () => {
  it('finds a class the sheet declares', () => {
    expect(sheetDeclares('.ega-select { color: red }', 'ega-select')).toBe(true);
  });

  it('does NOT accept a longer class as a match for a shorter one', () => {
    expect(sheetDeclares('.ega-select-wrap { display: flex }', 'ega-select')).toBe(false);
  });

  it('matches when the class is followed by a pseudo, a combinator or a comma', () => {
    expect(sheetDeclares('.a:hover {}', 'a')).toBe(true);
    expect(sheetDeclares('.a > .b {}', 'a')).toBe(true);
    expect(sheetDeclares('.a, .b {}', 'a')).toBe(true);
    expect(sheetDeclares('.a.b {}', 'a')).toBe(true);
  });

  it('matches a class that is itself a prefix, when the sheet declares it too', () => {
    expect(sheetDeclares('.ega-select-wrap {} .ega-select {}', 'ega-select')).toBe(true);
  });

  it('is literal about regex characters in the class name', () => {
    expect(sheetDeclares('.axb {}', 'a.b')).toBe(false);
  });

  it('does not count a mention inside a comment', () => {
    expect(
      sheetDeclares('/* .sr-only lives in tokens.css */ .other { color: red }', 'sr-only'),
    ).toBe(false);
  });

  it('does not count a mention inside a declaration value', () => {
    expect(sheetDeclares('.a { content: ".b"; }', 'b')).toBe(false);
  });

  it('does not count a :not() exclusion as coverage', () => {
    expect(sheetDeclares('.btn:not(.ghost) { border: 0 }', 'ghost')).toBe(false);
  });

  it('still counts a class used only to scope its descendants', () => {
    expect(sheetDeclares('.ctx.ctx-tooltip .row { gap: 0 }', 'ctx-tooltip')).toBe(true);
  });

  it('counts a rule nested in an at-rule', () => {
    expect(sheetDeclares('@media (min-width: 10px) { .a { color: red } }', 'a')).toBe(true);
  });
});

describe('allowedClasses', () => {
  it('reads a comma-separated list', () => {
    expect([...allowedClasses('/* shadow-css-lint-allow: one, two */')]).toEqual(['one', 'two']);
  });

  it('accepts a leading dot', () => {
    expect([...allowedClasses('/* shadow-css-lint-allow: .dotted */')]).toEqual(['dotted']);
  });

  it('stops at the reason that follows the class name', () => {
    const src =
      '/* shadow-css-lint-allow: portal-cls — renders into document.body, not the root. */';
    expect([...allowedClasses(src)]).toEqual(['portal-cls']);
  });

  it('does not read a comma inside the reason as another class', () => {
    const src = '/* shadow-css-lint-allow: a, b — renders elsewhere, not in the root. */';
    expect([...allowedClasses(src)]).toEqual(['a', 'b']);
  });

  it('is empty for a bare whole-file marker', () => {
    expect(allowedClasses('/* shadow-css-lint-allow */').size).toBe(0);
  });

  it('is empty when no marker is present', () => {
    expect(allowedClasses('.a {}').size).toBe(0);
  });
});

describe('markupClasses', () => {
  it('reads static ega- classes off both quote styles', () => {
    expect(markupClasses(`<span class="ega-a ega-b"></span><i class='ega-c'></i>`).sort()).toEqual([
      'ega-a',
      'ega-b',
      'ega-c',
    ]);
  });

  it('reads a class: directive', () => {
    expect(markupClasses('<div class:ega-open={x}></div>')).toEqual(['ega-open']);
  });

  it('ignores non-ega classes and interpolated names', () => {
    expect(markupClasses('<div class="meta ega-a {dynamic}"></div>')).toEqual(['ega-a']);
  });

  it('ignores class names that only appear in script or style', () => {
    const src = `<script>const c = 'ega-script';</script><div class="ega-real"></div><style>.ega-styled{}</style>`;
    expect(markupClasses(src)).toEqual(['ega-real']);
  });
});

describe('readSheet', () => {
  const root = path.resolve(__dirname, '../../..');

  it('inlines @import so tokens.css rules count as reaching the shadow root', async () => {
    const sheet = await readSheet(path.join(root, 'src/content/styles.css'));
    expect(sheet).not.toMatch(/@import\s+(?:url\(\s*)?['"]/);
    expect(sheetDeclares(sheet, 'ega-sr-only')).toBe(true);
  });

  it('does not find the imported rule without resolving the import', async () => {
    const raw = await readSheet(path.join(root, 'src/shared/tokens.css'));
    expect(sheetDeclares(raw, 'ega-root')).toBe(false);
  });
});
