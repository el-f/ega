// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readFileSync } from 'node:fs';
import Markdown from '@/shared/components/Markdown.svelte';

// marked and DOMPurify load lazily on first mount; wait for them before asserting.
async function waitForReady(container: HTMLElement, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!container.querySelector('.ega-md-fallback')) return;
    await new Promise((r) => setTimeout(r, 10));
    await tick();
  }
  throw new Error('markdown not ready within timeout');
}

describe('Markdown.svelte', () => {
  // The fallback is the same text the rendered pass shows; a muted color made the first answer repaint.
  it('paints the pre-render fallback in the body color, not the muted one', () => {
    const src = readFileSync('src/shared/components/Markdown.svelte', 'utf8');
    const body = /\.ega-md-fallback \{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(body).not.toBe('');
    expect(body).not.toMatch(/color:/);
  });

  it('renders fenced code block as <pre><code>', async () => {
    const { container } = render(Markdown, {
      props: { text: '```js\nconst x = 1;\n```' },
    });
    await waitForReady(container);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    const code = pre?.querySelector('code');
    expect(code?.textContent).toContain('const x = 1');
  });

  it('strips <script> tags so injected JS does not execute', async () => {
    const malicious = 'Hello <script>window.__ega_pwned = true;</script> world';
    const { container } = render(Markdown, { props: { text: malicious } });
    await waitForReady(container);
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __ega_pwned?: boolean }).__ega_pwned).toBeUndefined();
    // The textual "Hello world" still surfaces (sanitizer strips the tag, not the surrounding text).
    expect(container.textContent).toContain('Hello');
    expect(container.textContent).toContain('world');
  });

  it('allows data:image/png;base64 in <img src>', async () => {
    const text =
      '![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=)';
    const { container } = render(Markdown, { props: { text } });
    await waitForReady(container);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src') ?? '').toMatch(/^data:image\/png;base64,/);
  });

  it('blocks javascript: hrefs (link href stripped or unset)', async () => {
    const text = '[click me](javascript:alert(1))';
    const { container } = render(Markdown, { props: { text } });
    await waitForReady(container);
    const anchor = container.querySelector('a');
    if (anchor) {
      // DOMPurify either strips href or empties it — assert it's not the unsafe URL.
      const href = anchor.getAttribute('href');
      expect(href === null || href === '' || !href.startsWith('javascript:')).toBe(true);
    }
  });

  it('renders images with loading="lazy"', async () => {
    const text = '![alt](data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=)';
    const { container } = render(Markdown, { props: { text } });
    await waitForReady(container);
    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('forces external links to target=_blank rel=noopener noreferrer', async () => {
    const text = '[ega](https://example.com/)';
    const { container } = render(Markdown, { props: { text } });
    await waitForReady(container);
    const a = container.querySelector('a');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel') ?? '').toContain('noopener');
  });

  // Fix 2: remote <img> exfil — auto-loading a remote URL leaks user IP.
  it('replaces remote <img> with alt text span (no auto-load beacon)', async () => {
    const text = '![tracker](https://attacker.example/track?id=123)';
    const { container } = render(Markdown, { props: { text } });
    await waitForReady(container);
    // The <img> must not survive — it would auto-load.
    expect(container.querySelector('img')).toBeNull();
    // Alt text must still be visible.
    expect(container.textContent).toContain('tracker');
  });

  it('keeps data-URI <img> (inline, no remote load)', async () => {
    const text = '![pixel](data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=)';
    const { container } = render(Markdown, { props: { text } });
    await waitForReady(container);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src') ?? '').toMatch(/^data:/);
  });

  // Fix 3: external link phishing hardening — every external link must carry
  // rel=noopener so a linked page cannot back-navigate via window.opener.
  it('adds rel=noopener noreferrer to every external link', async () => {
    const text = '[A](https://a.example/) and [B](https://b.example/)';
    const { container } = render(Markdown, { props: { text } });
    await waitForReady(container);
    const anchors = Array.from(container.querySelectorAll('a'));
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    for (const a of anchors) {
      const rel = a.getAttribute('rel') ?? '';
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
      expect(a.getAttribute('target')).toBe('_blank');
    }
  });

  it('does not override rel on same-page anchors (#hash)', async () => {
    // Hash anchors stay unchanged — postprocess only touches non-hash hrefs.
    const text = '[top](#top)';
    const { container } = render(Markdown, { props: { text } });
    await waitForReady(container);
    const a = container.querySelector('a');
    // postprocess skips href starting with '#', so target/_blank should not be set
    expect(a?.getAttribute('target') ?? '').not.toBe('_blank');
  });

  it('shows a <pre> fallback before the renderer loads', () => {
    const { container } = render(Markdown, { props: { text: 'hello' } });
    // Pre-tick — modules haven't resolved yet.
    const fallback = container.querySelector('.ega-md-fallback');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain('hello');
  });
});
