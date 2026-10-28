// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { extractPostBlockText } from '@/content/post-block';

function anchorTextOf(selector: string): Node {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`test setup: ${selector} missing`);
  const node = el.firstChild;
  if (!node) throw new Error(`test setup: ${selector} has no firstChild`);
  return node;
}

describe('extractPostBlockText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the nearest post-container text, including OP context not adjacent to the selection', () => {
    document.body.innerHTML = `
      <article>
        <a class="title">Literally 1753</a>
        <div class="md"><p>Context: shipped from England in 1753 to pump floodwater out of the Schuyler copper mine.</p></div>
      </article>`;
    const out = extractPostBlockText(anchorTextOf('.title'), 800);
    expect(out).toContain('Literally 1753');
    expect(out).toContain('Schuyler copper mine');
  });

  it('caps the result length', () => {
    const big = 'x'.repeat(2000);
    document.body.innerHTML = `<article><span id="a">a</span>${big}</article>`;
    const out = extractPostBlockText(anchorTextOf('#a'), 800);
    expect(out).toBeDefined();
    expect(out?.length).toBeLessThanOrEqual(800);
  });

  it('a cap inside an emoji drops the emoji, never leaving half of it', () => {
    document.body.innerHTML = `<article><span id="a">${'x'.repeat(799)}😀 more</span></article>`;
    expect(extractPostBlockText(anchorTextOf('#a'), 800)).toBe('x'.repeat(799));
  });

  it('returns undefined when there is no substantial container', () => {
    document.body.innerHTML = `<span id="a">hi</span>`;
    expect(extractPostBlockText(anchorTextOf('#a'), 800)).toBeUndefined();
  });

  it('falls back to the nearest ancestor with substantial text when no semantic container exists', () => {
    const filler = 'word '.repeat(60); // ~300 chars, no article/.thing/etc.
    document.body.innerHTML = `<div class="outer"><div class="inner"><span id="a">Literally 1753</span> ${filler}</div></div>`;
    const out = extractPostBlockText(anchorTextOf('#a'), 800);
    expect(out).toContain('Literally 1753');
    expect(out).toContain('word');
  });

  it('reads only the words a reader sees: no script, style, hidden text, draft or Ega text', () => {
    document.body.innerHTML = `
      <article>
        <script type="application/ld+json">{"@type":"NewsArticle"}</script>
        <style>.a{color:red}</style>
        <p id="a">Visible words here</p>
        <div hidden>hidden draft reply text</div>
        <div contenteditable="true">my private draft</div>
        <span data-ega-replaced="x">Ega translation</span>
        <p>More words</p>
      </article>`;
    expect(extractPostBlockText(anchorTextOf('#a'), 800)).toBe('Visible words here More words');
  });

  it('never falls back to a draft or a hidden part around the anchor', () => {
    const draft = 'my private draft '.repeat(20);
    document.body.innerHTML = `
      <div contenteditable="true"><p id="a">${draft}</p></div>
      <div hidden><p id="h">${draft}</p></div>
      <article data-ega-skip><p id="s">${draft}</p></article>`;
    for (const id of ['#a', '#h', '#s'])
      expect(extractPostBlockText(anchorTextOf(id), 800)).toBeUndefined();
  });

  it('counts only visible text toward the size floor', () => {
    const state = `window.__STATE__={"user":"Dana Levi","phone":"+972501234567","pad":"${'x'.repeat(300)}"}`;
    document.body.innerHTML = `<div><p id="a">short line</p><script>${state}</script></div>`;
    expect(extractPostBlockText(anchorTextOf('#a'), 800)).toBeUndefined();
  });
});
