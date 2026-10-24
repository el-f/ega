// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadMarkdownRenderer } from '@/shared/components/markdown-loader';
import { resetMarkdownLoaderCache } from '@tests/_helpers/markdown-loader.test-utils';

function dom(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

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

  // Model output is text: raw HTML shows as its source, Markdown syntax still renders.
  it('shows a block of raw HTML as a code block of its source', async () => {
    const render = await loadMarkdownRenderer();
    const src = '<h1>Comment thread fixture</h1>\n<p id="c1">mar7aba habibi, kifak?</p>';
    const out = dom(render(src));
    expect(out.querySelector('h1')).toBeNull();
    expect(out.querySelector('p')).toBeNull();
    expect(out.querySelector('pre > code')?.textContent).toBe(`${src}\n`);
  });

  it('shows inline tags as text inside the paragraph', async () => {
    const render = await loadMarkdownRenderer();
    const out = dom(render('Hello <b>bold</b> and <script>x()</script> end'));
    expect(out.querySelectorAll('p')).toHaveLength(1);
    expect(out.querySelector('b, script')).toBeNull();
    expect(out.textContent).toContain('<b>bold</b>');
    expect(out.textContent).toContain('<script>x()</script>');
  });

  it('escapes the text after an inline <pre> or <script> too', async () => {
    const render = await loadMarkdownRenderer();
    for (const opener of ['<pre>', '<script>']) {
      const src = `Hello ${opener}x <img src=x onerror=alert(1)// end`;
      const out = dom(render(src));
      expect(out.querySelector('img, .ega-md-img-blocked')).toBeNull();
      expect(out.textContent).toContain(src);
    }
  });

  // A GFM table cell cannot hold a newline, so models break its lines with <br>.
  it('a bare <br> in a table cell breaks the line; any other <br> stays text', async () => {
    const render = await loadMarkdownRenderer();
    const table = dom(render('| a | b |\n| --- | --- |\n| one<br>two | x<br/>y |'));
    const cells = table.querySelectorAll('td');
    expect(cells[0]?.querySelectorAll('br')).toHaveLength(1);
    expect(cells[1]?.querySelectorAll('br')).toHaveLength(1);
    expect(table.textContent).not.toContain('<br');
    const withAttr = dom(render('| a |\n| --- |\n| one<br class="x">two |'));
    expect(withAttr.querySelector('td br')).toBeNull();
    expect(withAttr.querySelector('td')?.textContent).toContain('<br class="x">');
    for (const src of ['Hello<br>World', '- item one<br/>more']) {
      const out = dom(render(src));
      expect(out.querySelector('br'), src).toBeNull();
      expect(out.textContent, src).toContain('<br');
    }
  });

  it('keeps a link whose text holds a tag, with the tag as text', async () => {
    const render = await loadMarkdownRenderer();
    const out = dom(render('[<b>x</b>](https://a.b)'));
    expect(out.querySelector('a')?.textContent).toBe('<b>x</b>');
    expect(out.querySelector('b')).toBeNull();
  });

  it('still renders Markdown: a fenced block and an autolink', async () => {
    const render = await loadMarkdownRenderer();
    expect(dom(render('```\nlet x = 1;\n```')).querySelector('pre > code')?.textContent).toBe(
      'let x = 1;\n',
    );
    expect(dom(render('see <https://example.com>')).querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com',
    );
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
