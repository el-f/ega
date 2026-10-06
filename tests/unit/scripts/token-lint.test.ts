import { describe, it, expect } from 'vitest';
import { lintSvelte, lintCss, lintTs } from '../../../scripts/token-lint';

describe('token-lint', () => {
  it('flags a raw #hex in a Svelte <style> block', () => {
    const src = `
<script>let x = 1;</script>
<div>hi</div>
<style>
  .a { color: #f85149; }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.snippet).toContain('#f85149');
  });

  it('flags a raw #hex in an inline style="..." attribute', () => {
    const src = `
<script>let x = 1;</script>
<div style="color: #ff0000;">hi</div>
`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.snippet).toContain('#ff0000');
  });

  it('ignores #hex appearing inside a <script> block', () => {
    const src = `
<script>
  // see issue #118 — comment with hash + digits
  const color = 'transparent';
</script>
<div>x</div>
`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('ignores #hex inside a /* CSS comment */', () => {
    const src = `
<div>x</div>
<style>
  /* see #118 and ref #abc123 for context */
  .a { display: block; }
</style>
`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('ignores #hex inside an <!-- HTML comment -->', () => {
    const src = `
<!-- v0.5 refactor — see issue #123 -->
<div>x</div>
`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('respects the /* token-lint-allow */ escape hatch', () => {
    const src = `
<style>
  .a { background: #ff0000; /* token-lint-allow brand red */ }
</style>
`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('flags raw #hex in plain CSS, preserving line numbers', () => {
    const src = ['.a { color: red; }', '.b {', '  color: #abcdef;', '}'].join('\n');
    const v = lintCss(src, 'x.css');
    expect(v).toHaveLength(1);
    expect(v[0]?.line).toBe(3);
  });

  it('accepts `var(--color-*)` refs without flagging', () => {
    const src = `
<style>
  .a { color: var(--color-danger); }
</style>
`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('classifies #hex as kind hex', () => {
    const v = lintCss('.a { color: #abcdef; }', 'x.css');
    expect(v[0]?.kind).toBe('hex');
  });

  it('flags rgba() in a Svelte <style> block as kind fn', () => {
    const src = `
<style>
  .a { background: rgba(0, 0, 0, 0.45); }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.kind).toBe('fn');
  });

  it('flags hsl(), oklch() and color-mix() in plain CSS as kind fn', () => {
    const src = [
      '.a { color: hsl(210 100% 50%); }',
      '.b { color: oklch(0.7 0.1 250); }',
      '.c { background: color-mix(in srgb, red 30%, transparent); }',
    ].join('\n');
    const v = lintCss(src, 'x.css');
    expect(v.map((x) => x.kind)).toEqual(['fn', 'fn', 'fn']);
  });

  it('respects the allow marker for color functions too', () => {
    const src = '.a { background: rgba(0, 0, 0, 0.4); /* token-lint-allow scrim */ }';
    expect(lintCss(src, 'x.css')).toEqual([]);
  });

  it('does not flag identifiers that merely end in a color-function name', () => {
    const src = '.a { width: progressbar(1); }';
    expect(lintCss(src, 'x.css')).toEqual([]);
  });
});

describe('token-lint font sizes', () => {
  it.each([
    '.a { font-size: 11px; }',
    '.a { font-size: 0.9em; }',
    '.a { font-size: 1rem; }',
    '.a { font-size: var(--my-size); }',
    '.a { font: 600 13px/1.5 system-ui; }',
  ])('flags %s as kind font', (src) => {
    expect(lintCss(src, 'x.css').map((v) => v.kind)).toEqual(['font']);
  });

  it.each([
    '.a { font-size: var(--fs-sm); }',
    '.a { font-size: var(--ega-md-fs, var(--fs-sm)); }',
    '.a { font-size: inherit; }',
    '.a { font: inherit; }',
    '.a { font-weight: 600; }',
    '.a { font-size: 0.95em; /* token-lint-allow inline code */ }',
  ])('accepts %s', (src) => {
    expect(lintCss(src, 'x.css')).toEqual([]);
  });

  it('flags a literal size in an inline style attribute', () => {
    expect(lintSvelte('<span style="font-size: 10px">x</span>', 'x.svelte')).toHaveLength(1);
  });

  it.each([
    ['a style:font-size directive', '<span style:font-size="10px">x</span>'],
    ['a style:font-size directive with an expression', '<span style:font-size={size}>x</span>'],
    ['a single-quoted style attribute', "<span style='font-size: 10px'>x</span>"],
    ['a template-literal style', '<span style={`font-size: ${n}px`}>x</span>'],
    [
      'a second font-size on the line',
      '<span style="font-size: var(--fs-sm); font-size: 9px">x</span>',
    ],
    ['a shorthand sized in vw', '<style>.a { font: 600 2vw system-ui; }</style>'],
    ['a shorthand sized in ch', '<style>.a { font: 1ch serif; }</style>'],
    ['a shorthand sized by keyword', '<style>.a { font: bold large serif; }</style>'],
    [
      'a custom property that feeds a font-size',
      '<style>.a { --ega-md-fs: 13px; } .b { font-size: var(--ega-md-fs, var(--fs-sm)); }</style>',
    ],
    ['a --fs-* token redefined off scale', '<style>.a { --fs-sm: 11px; }</style>'],
    [
      'a style string built in the script',
      '<script>const s = `font-size: ${n}px`;</script>\n<span style={s}>x</span>',
    ],
  ])('flags %s', (_name, src) => {
    expect(lintSvelte(src, 'x.svelte').map((v) => v.kind)).toEqual(['font']);
  });

  it.each([
    ['a scale value through the directive', '<span style:font-size="var(--fs-sm)">x</span>'],
    ['a scale literal in an expression', `<span style:font-size={'var(--fs-sm)'}>x</span>`],
    [
      'a shorthand that only names small caps',
      '<style>.a { font: small-caps var(--fs-sm) serif; }</style>',
    ],
    ['a custom property no font-size reads', '<style>.a { --gap: 13px; }</style>'],
    [
      'a feeding property set to a scale value',
      '<style>.a { --ega-md-fs: var(--fs-md); } .b { font-size: var(--ega-md-fs, var(--fs-sm)); }</style>',
    ],
  ])('accepts %s', (_name, src) => {
    expect(lintSvelte(src, 'x.svelte')).toEqual([]);
  });

  // inherit and unset keep the parent's scale size; the other CSS-wide keywords compute to a browser default.
  it.each(['inherit', 'unset'])('accepts font-size: %s', (v) => {
    expect(lintCss(`.a { font-size: ${v}; }`, 'x.css')).toEqual([]);
  });

  it.each(['initial', 'revert', 'revert-layer'])('flags font-size: %s as off the scale', (v) => {
    expect(lintCss(`.a { font-size: ${v}; }`, 'x.css').map((x) => x.kind)).toEqual(['font']);
  });

  it('reads a font shorthand that prettier wrapped onto the next lines', () => {
    const src = '.a {\n  font:\n    700 0.75em/1.5 system-ui,\n    sans-serif;\n}';
    expect(lintCss(src, 'x.css')).toEqual([
      { file: 'x.css', line: 2, snippet: 'font:', kind: 'font' },
    ]);
    const allowed = src.replace('sans-serif;', 'sans-serif; /* token-lint-allow page sheet */');
    expect(lintCss(allowed, 'x.css')).toEqual([]);
  });

  it('uses the custom properties other files feed into a font-size', () => {
    expect(lintCss('.a { --reader-fs: 13px; }', 'x.css')).toEqual([]);
    expect(lintCss('.a { --reader-fs: 13px; }', 'x.css', new Set(['--reader-fs']))).toHaveLength(1);
  });
});

describe('token-lint font sizes set from .ts', () => {
  it.each([
    ["el.style.fontSize = '12px';"],
    ['el.style.fontSize = `${n}px`;'],
    ["el.style.setProperty('font-size', '0.9em');"],
    ["el.style.cssText = 'color: red; font-size: 11px';"],
    ["el.style.setProperty('--ega-md-fs', '13px');"],
  ])('flags %s', (src) => {
    const fed = new Set(['--ega-md-fs']);
    expect(lintTs(src, 'x.ts', fed).map((v) => v.kind)).toEqual(['font']);
  });

  it.each([
    ["el.style.fontSize = 'var(--fs-sm)';"],
    ["el.style.setProperty('--gap', '13px');"],
    ["// el.style.fontSize = '12px';"],
    ["const link = '#top'; // a hash in code is not a color"],
  ])('accepts %s', (src) => {
    expect(lintTs(src, 'x.ts')).toEqual([]);
  });
});

describe('token-lint text that only looks like a comment opener', () => {
  it.each([
    ['a font size', '  .a { font-size: 13px; }', 'font'],
    ['a hex color', '  .a { color: #ff0000; }', 'hex'],
    ['a color function', '  .a { color: rgba(0, 0, 0, 0.5); }', 'fn'],
  ])('flags %s in <style> after an attribute value holding /*', (_name, decl, kind) => {
    const src = ['<input accept="image/*" />', '<style>', decl, '  /* a comment */', '</style>'];
    expect(lintSvelte(src.join('\n'), 'x.svelte').map((v) => [v.line, v.kind])).toEqual([
      [3, kind],
    ]);
  });

  it.each([
    ['a single-quoted string', "const accept = 'image/*';"],
    ['a double-quoted string', 'const accept = "image/*";'],
    ['a template literal', 'const accept = `image/*`;'],
    ['a URL pattern', "const origin = 'chrome-extension://*';"],
  ])('flags a style write in .ts after %s', (_name, opener) => {
    const src = [opener, "el.style.fontSize = '12px';", '/* a comment */'].join('\n');
    expect(lintTs(src, 'x.ts').map((v) => v.line)).toEqual([2]);
  });

  it('flags a style write in a <script> after a string holding /*', () => {
    const src = [
      '<script>',
      "  const accept = 'image/*';",
      "  el.style.fontSize = '12px';",
      '  /* a comment */',
      '</script>',
    ].join('\n');
    expect(lintSvelte(src, 'x.svelte').map((v) => v.line)).toEqual([3]);
  });

  it('flags a style write that follows a comment holding an apostrophe', () => {
    const src = ["// it's a trap", "el.style.fontSize = '12px';"].join('\n');
    expect(lintTs(src, 'x.ts').map((v) => v.line)).toEqual([2]);
  });

  it.each([
    ["/* el.style.fontSize = '12px'; */"],
    ["/*\n  el.style.fontSize = '12px';\n*/"],
    ["const a = 1; /* it's fine */ el.style.fontSize = 'var(--fs-sm)';"],
    ["const url = 'https://example.test/a'; // el.style.fontSize = '12px';"],
  ])('ignores a real comment: %s', (src) => {
    expect(lintTs(src, 'x.ts')).toEqual([]);
  });
});
