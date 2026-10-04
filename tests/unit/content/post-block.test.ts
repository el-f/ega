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
});
