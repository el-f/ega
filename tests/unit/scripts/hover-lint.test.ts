import { describe, it, expect } from 'vitest';
import { lintSvelte, lintCss } from '../../../scripts/hover-lint';

describe('hover-lint', () => {
  it('flags a size change inside a :hover block', () => {
    const src = `
<div>x</div>
<style>
  .row:hover { max-height: 3rem; }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.prop).toBe('max-height');
  });

  it('flags spacing changes under :hover and :focus-within alike', () => {
    const src = `
<style>
  .a:hover .b { margin-top: 4px; }
  .a:focus-within .b { padding-top: 8px; }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v.map((x) => x.prop).sort()).toEqual(['margin-top', 'padding-top']);
  });

  it('flags a border shorthand added on hover but not border-color alone', () => {
    const src = `
<style>
  .a:hover { border-top: 1px solid var(--color-border); }
  .b:hover { border-color: var(--color-accent); }
  .c:hover { border-radius: 8px; }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.prop).toBe('border-top');
  });

  it('ignores paint-only state changes', () => {
    const src = `
<style>
  .a:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
    box-shadow: 0 1px 2px var(--color-shadow);
    opacity: 1;
    outline: 2px solid var(--color-accent);
    transform: translateY(-1px);
    cursor: pointer;
  }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('ignores a pseudo-element tooltip that is generated out of flow', () => {
    const src = `
<style>
  [data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    padding: 4px 8px;
    font-size: 11px;
  }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('ignores a state block whose base rule made the pseudo-element absolute', () => {
    const src = `
<style>
  .send::after { content: ''; position: absolute; width: 0; }
  .send:focus-visible::after { width: 100%; }
</style>`;
    expect(lintSvelte(src, 'x.svelte')).toEqual([]);
  });

  it('matches a placement override back to its absolute base rule', () => {
    const src = `
<style>
  [data-tooltip]:not([data-tooltip='']):hover::after { position: absolute; bottom: 4px; }
  [data-tooltip][data-tooltip-placement='left']:hover::after { bottom: auto; right: 6px; }
</style>`;
    expect(lintSvelte(src, 'x.svelte')).toEqual([]);
  });

  it('does not let an unrelated absolute pseudo-element excuse its host element', () => {
    const src = `
<style>
  .row::after { content: ''; position: absolute; }
  .row:hover { padding: 8px; }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.prop).toBe('padding');
  });

  it('flags an element that leaves normal flow only on hover', () => {
    const src = `
<style>
  .row:hover { position: absolute; }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.prop).toBe('position');
  });

  it('still flags a sized state block that is in normal flow', () => {
    const src = `
<style>
  .a:hover::after { content: '.'; padding: 4px; }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.prop).toBe('padding');
  });

  it('ignores declarations inside CSS comments', () => {
    const src = `
<style>
  /* .a:hover { padding: 4px; } — removed, caused a jump */
  .a:hover { color: red; }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('respects the /* hover-lint-allow */ escape hatch', () => {
    const src = `
<style>
  .a:hover { padding: 4px; /* hover-lint-allow: popover is out of flow */ }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });

  it('reports the real line number in plain CSS', () => {
    const src = ['.a { padding: 4px; }', '.a:hover {', '  font-weight: 600;', '}'].join('\n');
    const v = lintCss(src, 'x.css');
    expect(v).toHaveLength(1);
    expect(v[0]?.line).toBe(3);
    expect(v[0]?.prop).toBe('font-weight');
  });

  it('sees state blocks nested in a media query', () => {
    const src = `
<style>
  @media (min-width: 600px) {
    .a:hover { height: 40px; }
  }
</style>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toHaveLength(1);
    expect(v[0]?.prop).toBe('height');
  });

  it('ignores CSS outside a <style> block in a Svelte file', () => {
    const src = `
<script lang="ts">
  const css = '.a:hover { padding: 9px; }';
</script>
<div>{css}</div>`;
    const v = lintSvelte(src, 'x.svelte');
    expect(v).toEqual([]);
  });
});
