import { describe, it, expect } from 'vitest';
import { lintSvelte, lintCss } from '../../../scripts/token-lint';

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
});
