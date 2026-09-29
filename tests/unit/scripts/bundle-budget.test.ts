import { describe, it, expect } from 'vitest';
import {
  compareBundles,
  contentEntryFromLoader,
  injectedContentCss,
  pagePreloadAssets,
  staticImportSpecifiers,
  walkStaticGraph,
  webAccessibleCss,
  type BundleEntry,
} from '../../../scripts/bundle-budget';

describe('pagePreloadAssets', () => {
  it('collects the module script, every modulepreload and every stylesheet once', () => {
    const html = [
      '<script type="module" crossorigin src="/assets/index.html-AAAA1111.js"></script>',
      '<link rel="modulepreload" crossorigin href="/assets/vendor-svelte-BBBB2222.js">',
      '<link rel="modulepreload" crossorigin href="/assets/vendor-svelte-BBBB2222.js">',
      '<link rel="stylesheet" crossorigin href="/assets/Button-CCCC3333.css">',
      '<link rel="icon" href="/icons/icon-16.png">',
    ].join('\n');
    expect(pagePreloadAssets(html)).toEqual([
      'assets/Button-CCCC3333.css',
      'assets/index.html-AAAA1111.js',
      'assets/vendor-svelte-BBBB2222.js',
    ]);
  });
});

describe('bundle-budget', () => {
  it('passes when sizes are within 10% of baseline', () => {
    const baseline: BundleEntry[] = [{ name: 'content', bytes: 10000 }];
    const current: BundleEntry[] = [{ name: 'content', bytes: 10500 }];
    const r = compareBundles(current, baseline, 0.1);
    expect(r.ok).toBe(true);
  });

  it('fails when an entry grows > threshold', () => {
    const baseline: BundleEntry[] = [{ name: 'content', bytes: 10000 }];
    const current: BundleEntry[] = [{ name: 'content', bytes: 12000 }];
    const r = compareBundles(current, baseline, 0.1);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/content.*grew 20\.0%/);
  });

  it('passes when an entry shrinks', () => {
    const baseline: BundleEntry[] = [{ name: 'content', bytes: 10000 }];
    const current: BundleEntry[] = [{ name: 'content', bytes: 8000 }];
    const r = compareBundles(current, baseline, 0.1);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/shrank 20\.0%/);
  });

  it('flags missing entries as new (informational, not failing)', () => {
    const baseline: BundleEntry[] = [{ name: 'content', bytes: 10000 }];
    const current: BundleEntry[] = [
      { name: 'content', bytes: 10000 },
      { name: 'new-entry', bytes: 500 },
    ];
    const r = compareBundles(current, baseline, 0.1);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/new-entry/);
  });

  it('fails when baseline is empty and --set flag is not used', () => {
    const r = compareBundles([{ name: 'x', bytes: 100 }], [], 0.1);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/baseline/i);
  });
});

// CRXJS 3 lists component CSS as web-accessible too; the content script's preload helper would link it into the host page.
describe('webAccessibleCss', () => {
  it('reports every stylesheet in web_accessible_resources', () => {
    expect(
      webAccessibleCss({
        web_accessible_resources: [
          { resources: ['assets/index.js', 'assets/IconButton.css'] },
          { resources: ['assets/Select.css'] },
        ],
      }),
    ).toEqual(['assets/IconButton.css', 'assets/Select.css']);
  });

  it('is empty for JS-only resources and a manifest without the key', () => {
    expect(webAccessibleCss({ web_accessible_resources: [{ resources: ['a.js'] }] })).toEqual([]);
    expect(webAccessibleCss({})).toEqual([]);
  });
});

describe('injectedContentCss', () => {
  it('reports every sheet CRXJS lifted into content_scripts', () => {
    const css = injectedContentCss({
      content_scripts: [
        { js: ['a.js'], css: ['assets/Select.css'] },
        { js: ['b.js'], css: ['assets/Kbd.css', 'assets/BrandMark.css'] },
      ],
    });
    expect(css).toEqual(['assets/Select.css', 'assets/Kbd.css', 'assets/BrandMark.css']);
  });

  it('is empty for a manifest whose content scripts declare no css', () => {
    expect(injectedContentCss({ content_scripts: [{ js: ['a.js'] }] })).toEqual([]);
    expect(injectedContentCss({})).toEqual([]);
  });
});

describe('staticImportSpecifiers', () => {
  it('collects every static form rollup emits', () => {
    const code = [
      'import"./bare.js";',
      'import{a as b}from"./named.js";',
      'import d from"./default.js";',
      'import*as n from"./ns.js";',
      'export{a}from"./reexport.js";',
      'export*from"./star.js";',
    ].join('');
    expect(staticImportSpecifiers(code)).toEqual([
      './bare.js',
      './named.js',
      './default.js',
      './ns.js',
      './reexport.js',
      './star.js',
    ]);
  });

  it('ignores dynamic imports — a lazy chunk is not paid for at page load', () => {
    const code = 'import{x}from"./eager.js";const p=import("./lazy.js");import.meta.url;';
    expect(staticImportSpecifiers(code)).toEqual(['./eager.js']);
  });
});

describe('contentEntryFromLoader', () => {
  it('reads the entry the CRXJS loader IIFE fetches', () => {
    const loader =
      '(function(){const {onExecute}=await import(/* @vite-ignore */ chrome.runtime.getURL("assets/index.ts-AB12.js"));})()';
    expect(contentEntryFromLoader(loader)).toBe('assets/index.ts-AB12.js');
  });

  it('returns null when the loader shape changed', () => {
    expect(contentEntryFromLoader('(function(){})()')).toBeNull();
  });
});

describe('walkStaticGraph', () => {
  const files: Record<string, string> = {
    'assets/entry.js': 'import"./a.js";import{z}from"./b.js";const l=import("./lazy.js");',
    'assets/a.js': 'import"./shared.js";',
    'assets/b.js': 'import"./shared.js";import"./c.js";',
    'assets/c.js': 'export const c=1;',
    'assets/shared.js': 'export const s=1;',
    'assets/lazy.js': 'import"./huge.js";',
    'assets/huge.js': 'export const h=1;',
  };
  const read = (rel: string): string | null => files[rel] ?? null;

  it('reaches every statically imported chunk exactly once', () => {
    expect(walkStaticGraph('assets/entry.js', read)).toEqual([
      'assets/a.js',
      'assets/b.js',
      'assets/c.js',
      'assets/entry.js',
      'assets/shared.js',
    ]);
  });

  it('stops at a dynamic import boundary', () => {
    const graph = walkStaticGraph('assets/entry.js', read);
    expect(graph).not.toContain('assets/lazy.js');
    expect(graph).not.toContain('assets/huge.js');
  });

  it('survives a specifier that resolves to nothing', () => {
    expect(walkStaticGraph('assets/gone.js', read)).toEqual(['assets/gone.js']);
  });
});
