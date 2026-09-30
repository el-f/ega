// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  readPageLang,
  readPageDescription,
  readSiteName,
  readHeadingTrail,
} from '@/shared/page-context';

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('readPageLang', () => {
  it('reads <html lang>', () => {
    const d = makeDoc('<html lang="he-IL"><head></head><body></body></html>');
    expect(readPageLang(d)).toBe('he-IL');
  });

  it('falls back to og:locale', () => {
    const d = makeDoc(
      '<html><head><meta property="og:locale" content="en_US" /></head><body></body></html>',
    );
    expect(readPageLang(d)).toBe('en_US');
  });

  it('returns undefined when neither is present or blank', () => {
    const d = makeDoc('<html><head></head><body></body></html>');
    expect(readPageLang(d)).toBeUndefined();
    const d2 = makeDoc('<html lang="   "><head></head><body></body></html>');
    expect(readPageLang(d2)).toBeUndefined();
  });
});

describe('readPageDescription', () => {
  it('reads <meta name="description">', () => {
    const d = makeDoc(
      '<html><head><meta name="description" content="A fine page." /></head><body></body></html>',
    );
    expect(readPageDescription(d)).toBe('A fine page.');
  });

  it('falls back to og:description when no name=description', () => {
    const d = makeDoc(
      '<html><head><meta property="og:description" content="OG only." /></head><body></body></html>',
    );
    expect(readPageDescription(d)).toBe('OG only.');
  });

  it('returns undefined when malformed / empty / absent', () => {
    const d1 = makeDoc('<html><head></head><body></body></html>');
    expect(readPageDescription(d1)).toBeUndefined();
    const d2 = makeDoc(
      '<html><head><meta name="description" content="   " /></head><body></body></html>',
    );
    expect(readPageDescription(d2)).toBeUndefined();
  });
});

describe('readSiteName', () => {
  it('reads og:site_name (colon)', () => {
    const d = makeDoc(
      '<html><head><meta property="og:site_name" content="Acme Blog" /></head><body></body></html>',
    );
    expect(readSiteName(d)).toBe('Acme Blog');
  });

  it('falls back to applicationName', () => {
    const d = makeDoc(
      '<html><head><meta name="application-name" content="Acme App" /></head><body></body></html>',
    );
    expect(readSiteName(d)).toBe('Acme App');
  });

  it('returns undefined when neither present', () => {
    const d = makeDoc('<html><head></head><body></body></html>');
    expect(readSiteName(d)).toBeUndefined();
  });
});

describe('readHeadingTrail', () => {
  it('walks up and collects nearest h1-h6 ancestry, outermost first', () => {
    const d = makeDoc(`
      <html><body>
        <section>
          <h1>Top</h1>
          <article>
            <h2>Middle</h2>
            <div>
              <h3>Inner</h3>
              <p id="anchor">selected</p>
            </div>
          </article>
        </section>
      </body></html>
    `);
    const anchor = d.getElementById('anchor');
    if (!anchor) throw new Error('test setup: #anchor');
    const trail = readHeadingTrail(anchor);
    // Default cap of 3, outermost first
    expect(trail).toEqual(['Top', 'Middle', 'Inner']);
  });

  it('returns empty array when no headings in ancestry', () => {
    const d = makeDoc('<html><body><p id="a">x</p></body></html>');
    const a = d.getElementById('a');
    if (!a) throw new Error('test setup: #a');
    expect(readHeadingTrail(a)).toEqual([]);
  });

  it('caps entry length to maxLen and entry count to maxDepth', () => {
    const long = 'a'.repeat(200);
    const d = makeDoc(`
      <html><body>
        <section>
          <h1>H1 ${long}</h1>
          <section>
            <h2>H2</h2>
            <section>
              <h3>H3</h3>
              <section>
                <h4>H4</h4>
                <p id="p">x</p>
              </section>
            </section>
          </section>
        </section>
      </body></html>
    `);
    const a = d.getElementById('p');
    if (!a) throw new Error('test setup: #p');
    const trail = readHeadingTrail(a, 3, 50);
    expect(trail.length).toBe(3);
    // first entry was truncated to 50 chars
    const first = trail[0];
    if (first === undefined) throw new Error('expected trail[0]');
    expect(first.length).toBeLessThanOrEqual(50);
    // outermost-first ordering keeps the deepest-4 headings h2,h3,h4
    // (h1 was 4 levels out; we cap at 3)
    expect(trail).toEqual(['H2', 'H3', 'H4']);
  });

  it('accepts a text-node anchor by walking to its parentElement', () => {
    const d = makeDoc(
      '<html><body><article><h1>Only</h1><p id="p">selected</p></article></body></html>',
    );
    const p = d.getElementById('p');
    if (!p) throw new Error('test setup: #p');
    const text = p.firstChild;
    if (!text) throw new Error('test setup: p has no firstChild');
    expect(text.nodeType).toBe(3);
    expect(readHeadingTrail(text)).toEqual(['Only']);
  });

  it('finds a heading wrapped in <header>', () => {
    // <section><header><h2/></header><p/></section>: the one-level header lookup must find the heading.
    const d = makeDoc(`
      <html><body>
        <section>
          <header><h2>Sec Title</h2></header>
          <p id="p">selected</p>
        </section>
      </body></html>
    `);
    const p = d.getElementById('p');
    if (!p) throw new Error('test setup: #p');
    expect(readHeadingTrail(p)).toEqual(['Sec Title']);
  });

  it('performs in linear time on deep-DOM pages', () => {
    // 50 nested divs plus 200 siblings: scanning direct children and one header level stays linear, not quadratic.
    const inner = Array.from({ length: 50 }, () => '<div>').join('');
    const closers = '</div>'.repeat(50);
    const noise = Array.from({ length: 200 }, (_, i) => `<span>s${i}</span>`).join('');
    const d = makeDoc(`
      <html><body>
        <article>
          <h1>Outer</h1>
          ${noise}
          ${inner}
          <p id="p">selected</p>
          ${closers}
        </article>
      </body></html>
    `);
    const p = d.getElementById('p');
    if (!p) throw new Error('test setup: #p');
    const start = performance.now();
    const trail = readHeadingTrail(p);
    const elapsed = performance.now() - start;
    expect(trail).toEqual(['Outer']);
    // jsdom is ~10x slower than a browser; a linear scan stays under 50ms, a quadratic one does not.
    expect(elapsed).toBeLessThan(50);
  });
});
