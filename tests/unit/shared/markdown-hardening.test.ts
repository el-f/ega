// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render as renderComponent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { loadMarkdownRenderer, SANITIZE_CONFIG } from '@/shared/components/markdown-loader';
import { resetMarkdownLoaderCache } from '@tests/_helpers/markdown-loader.test-utils';
import Markdown from '@/shared/components/Markdown.svelte';

async function waitForReady(container: HTMLElement, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!container.querySelector('.ega-md-fallback')) return;
    await new Promise((r) => setTimeout(r, 10));
    await tick();
  }
  throw new Error('markdown not ready within timeout');
}

describe('sanitizer allowlist', () => {
  beforeEach(() => resetMarkdownLoaderCache());
  afterEach(() => resetMarkdownLoaderCache());

  it('pins the allowed tags and attributes', () => {
    expect(SANITIZE_CONFIG.ALLOWED_TAGS).toEqual([
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'del',
      'span',
      'code',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
    ]);
    expect(SANITIZE_CONFIG.ALLOWED_ATTR).toEqual([
      'href',
      'src',
      'alt',
      'title',
      'target',
      'rel',
      'loading',
      'align',
    ]);
  });

  it('drops class, so a reply cannot borrow a global class such as ega-sr-only', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('<p class="ega-sr-only">hidden</p>');
    expect(out).toContain('hidden');
    expect(out).not.toContain('ega-sr-only');
    expect(out).not.toContain('class=');
  });

  it('a fenced code block still renders as pre > code', async () => {
    const render = await loadMarkdownRenderer();
    expect(render('```js\nlet x = 1;\n```')).toMatch(/<pre><code>let x = 1;/);
  });

  const stripped: Array<[string, string]> = [
    ['iframe', '<iframe src="https://evil.example/"></iframe>'],
    ['object', '<object data="https://evil.example/x.swf"></object>'],
    ['embed', '<embed src="https://evil.example/x.swf">'],
    ['form', '<form action="https://evil.example/"><button>send</button></form>'],
    ['input', '<input name="password" value="x">'],
    ['style', '<style>body { display: none }</style>'],
  ];

  for (const [tag, markup] of stripped) {
    it(`strips <${tag}>`, async () => {
      const render = await loadMarkdownRenderer();
      expect(render(markup)).not.toContain(`<${tag}`);
    });
  }
});

describe('model-emitted images', () => {
  beforeEach(() => resetMarkdownLoaderCache());
  afterEach(() => resetMarkdownLoaderCache());

  it('keeps a base64 raster data URI and makes it lazy', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('![pixel](data:image/gif;base64,R0lGODlhAQABAAD/ACw=)');
    expect(out).toContain('<img');
    expect(out).toContain('loading="lazy"');
  });

  it('blocks an SVG data URI — attacker-drawn vector art inside the panel', async () => {
    const render = await loadMarkdownRenderer();
    const out = render(
      '![fake dialog](data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3C/svg%3E)',
    );
    expect(out).not.toContain('<img');
    expect(out).toContain('ega-md-img-blocked');
    expect(out).toContain('fake dialog');
  });

  it('blocks a data URI that is not base64 raster image data', async () => {
    const render = await loadMarkdownRenderer();
    expect(render('![x](data:text/html,%3Cb%3Ehi%3C/b%3E)')).not.toContain('<img');
    expect(render('![y](data:image/png,not-base64)')).not.toContain('<img');
  });

  it('blocks a remote image — it would fire a request to the attacker host', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('![tracker](https://attacker.example/track?id=123)');
    expect(out).not.toContain('<img');
    expect(out).toContain('tracker');
  });
});

describe('model-emitted links', () => {
  beforeEach(() => resetMarkdownLoaderCache());
  afterEach(() => resetMarkdownLoaderCache());

  it('shows the destination host next to the link text', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('[Re-authenticate your account](https://evil.example/ega)');
    expect(out).toContain('ega-md-link-host');
    expect(out).toContain('evil.example');
    expect(out).toContain('title="https://evil.example/ega"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('skips the host label when the link text already shows the host', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('https://example.com/docs');
    expect(out).not.toContain('ega-md-link-host');
    expect(out).toContain('target="_blank"');
  });

  it('leaves a same-page anchor alone', async () => {
    const render = await loadMarkdownRenderer();
    const out = render('[top](#top)');
    expect(out).toContain('href="#top"');
    expect(out).not.toContain('target="_blank"');
    expect(out).not.toContain('ega-md-link-host');
  });

  it('drops a href that is neither https nor mailto nor a page anchor', async () => {
    const render = await loadMarkdownRenderer();
    expect(render('[call me](tel:+15550100)')).not.toContain('tel:');
    expect(render('[settings](/options.html)')).not.toContain('href="/options.html"');
    expect(render('[x](//evil.example/y)')).not.toContain('//evil.example');
  });

  it('keeps a mailto link', async () => {
    const render = await loadMarkdownRenderer();
    expect(render('[write](mailto:hi@example.com)')).toContain('mailto:hi@example.com');
  });
});

describe('Markdown.svelte renders the hardened output', () => {
  it('puts the destination host in the visible text', async () => {
    const { container } = renderComponent(Markdown, {
      props: { text: '[Re-authenticate your account](https://evil.example/ega)' },
    });
    await waitForReady(container);
    expect(container.textContent).toContain('evil.example');
    expect(container.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('does not render an SVG data URI as an image', async () => {
    const { container } = renderComponent(Markdown, {
      props: { text: '![art](data:image/svg+xml,%3Csvg%3E%3C/svg%3E)' },
    });
    await waitForReady(container);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.ega-md-img-blocked')).not.toBeNull();
  });
});
