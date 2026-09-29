// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadMarkdownRenderer } from '@/shared/components/markdown-loader';
import { resetMarkdownLoaderCache } from '@/shared/components/markdown-loader.test-utils';

describe('loadMarkdownRenderer', () => {
  beforeEach(() => {
    resetMarkdownLoaderCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMarkdownLoaderCache();
  });

  it('caches the resolved renderer across calls (no re-import)', async () => {
    const r1 = await loadMarkdownRenderer();
    const r2 = await loadMarkdownRenderer();
    expect(r2).toBe(r1);
  });

  it('renders a smoke-test fragment', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('# hello');
    expect(out).toContain('<h1');
    expect(out).toContain('hello');
  });

  it('strips <svg onload> — mutation-XSS vector not in allowlist', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('<svg onload="window.__svgpwn=1"><circle r="10"/></svg>');
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('onload');
  });

  it('strips <math> — MathML not in allowlist', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('<math><mrow><mi>x</mi></mrow></math>');
    expect(out).not.toContain('<math');
    expect(out).not.toContain('<mrow');
  });

  it('strips onerror attribute even on otherwise-allowed tags', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('allows normal markdown: bold, em, code, table, image link', async () => {
    const render = await loadMarkdownRenderer();
    const bold = render('**bold**');
    expect(bold).toContain('<strong>');

    const em = render('_italics_');
    expect(em).toContain('<em>');

    const code = render('`inline`');
    expect(code).toContain('<code>');

    const table = render('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(table).toContain('<table');
    expect(table).toContain('<th');

    const img = render('![alt](data:image/gif;base64,R0lGODlhAQABAAD/ACw=)');
    expect(img).toContain('<img');
    expect(img).toContain('alt');
  });

  it('clears the cache on rejection so the next call retries', async () => {
    const mod = await import('marked');
    const originalSetOptions = mod.marked.setOptions;
    let calls = 0;
    vi.spyOn(mod.marked, 'setOptions').mockImplementation(((opts) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('synthetic transient import failure');
      }
      return originalSetOptions.call(mod.marked, opts);
    }) as typeof mod.marked.setOptions);

    await expect(loadMarkdownRenderer()).rejects.toThrow(/transient/);
    const render = await loadMarkdownRenderer();
    expect(typeof render).toBe('function');
    expect(calls).toBe(2);
  });
});
