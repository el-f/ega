// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { collectPageContext, collectPageLevelContext } from '@/content/page-context-collector';

function makeDoc(html: string, title = ''): Document {
  const d = new DOMParser().parseFromString(html, 'text/html');
  if (title) d.title = title;
  return d;
}

function fakeLocation(href: string): Location {
  return { href } as Location;
}

describe('collectPageContext', () => {
  it('minimal level returns title + url + before/after only', () => {
    const d = makeDoc(
      '<html lang="en"><head><meta name="description" content="Hi"/></head><body></body></html>',
      'Title',
    );
    const loc = fakeLocation('https://example.com/path');
    const ctx = collectPageContext({ beforeText: 'a', afterText: 'b' }, 'minimal', d, loc);
    expect(ctx).toEqual({
      pageTitle: 'Title',
      pageUrl: 'https://example.com/path',
      beforeText: 'a',
      afterText: 'b',
    });
    // rich-only fields absent
    expect('pageLang' in ctx).toBe(false);
    expect('siteName' in ctx).toBe(false);
  });

  it('strips query string and fragment from pageUrl (no token/PII leak to the LLM)', () => {
    const d = makeDoc('<html><body></body></html>', 'T');
    const loc = fakeLocation('https://example.com/reset?token=secret123&u=a#frag');
    const ctx = collectPageContext({ beforeText: 'a', afterText: 'b' }, 'minimal', d, loc);
    expect(ctx.pageUrl).toBe('https://example.com/reset');
    const rich = collectPageLevelContext('minimal', d, loc);
    expect(rich.pageUrl).toBe('https://example.com/reset');
  });

  it('rich level adds lang, description, siteName, headingTrail', () => {
    const d = makeDoc(
      `<html lang="he-IL">
         <head>
           <meta name="description" content="A fine page." />
           <meta property="og:site_name" content="Acme" />
         </head>
         <body>
           <article>
             <h1>Top</h1>
             <section>
               <h2>Sub</h2>
               <p id="anchor">x</p>
             </section>
           </article>
         </body>
       </html>`,
      'T',
    );
    const anchor = d.getElementById('anchor');
    const ctx = collectPageContext(
      { beforeText: 'b', afterText: 'a', ...(anchor ? { anchorNode: anchor } : {}) },
      'rich',
      d,
      fakeLocation('https://example.com/x'),
    );
    expect(ctx.pageLang).toBe('he-IL');
    expect(ctx.pageDescription).toBe('A fine page.');
    expect(ctx.siteName).toBe('Acme');
    expect(ctx.headingTrail).toEqual(['Top', 'Sub']);
    expect(ctx.pageTitle).toBe('T');
    expect(ctx.pageUrl).toBe('https://example.com/x');
  });

  it('rich level caps pageDescription at 200 chars', () => {
    const desc = 'z'.repeat(500);
    const d = makeDoc(
      `<html><head><meta name="description" content="${desc}" /></head><body></body></html>`,
      'T',
    );
    const ctx = collectPageContext({}, 'rich', d, fakeLocation('u'));
    expect(ctx.pageDescription?.length).toBe(200);
  });

  it('caps page-controlled pageTitle / siteName / pageLang at 200 chars', () => {
    const long = 'z'.repeat(5000);
    const d = makeDoc(
      `<html lang="${long}"><head><meta property="og:site_name" content="${long}" /></head><body></body></html>`,
      long,
    );
    const ctx = collectPageContext({}, 'rich', d, fakeLocation('u'));
    expect(ctx.pageTitle?.length).toBe(200);
    expect(ctx.siteName?.length).toBe(200);
    expect(ctx.pageLang?.length).toBe(200);
    expect(collectPageLevelContext('rich', d, fakeLocation('u')).pageTitle?.length).toBe(200);
  });

  it('rich level without anchorNode skips headingTrail', () => {
    const d = makeDoc('<html><head></head><body><h1>X</h1></body></html>', 'T');
    const ctx = collectPageContext({}, 'rich', d, fakeLocation('u'));
    expect(ctx.headingTrail).toBeUndefined();
  });

  it('minimal spreads beforeText/afterText conditionally', () => {
    const d = makeDoc('<html><body></body></html>', 'T');
    const ctx = collectPageContext({}, 'minimal', d, fakeLocation('u'));
    expect('beforeText' in ctx).toBe(false);
    expect('afterText' in ctx).toBe(false);
  });
});

describe('collectPageLevelContext (selection-less)', () => {
  it('minimal level returns title + url only — no before/after', () => {
    const d = makeDoc(
      '<html lang="en"><head><meta name="description" content="Hi"/></head><body></body></html>',
      'Title',
    );
    const ctx = collectPageLevelContext('minimal', d, fakeLocation('https://example.com/path'));
    expect(ctx).toEqual({
      pageTitle: 'Title',
      pageUrl: 'https://example.com/path',
    });
    // rich-only fields absent at minimal level
    expect('pageLang' in ctx).toBe(false);
    expect('pageDescription' in ctx).toBe(false);
    expect('siteName' in ctx).toBe(false);
    expect('headingTrail' in ctx).toBe(false);
    // selection-only fields never populated in selection-less mode
    expect('beforeText' in ctx).toBe(false);
    expect('afterText' in ctx).toBe(false);
  });

  it('rich level adds lang, description, siteName, top-of-page headingTrail', () => {
    const d = makeDoc(
      `<html lang="he-IL">
         <head>
           <meta name="description" content="A fine page." />
           <meta property="og:site_name" content="Acme" />
         </head>
         <body>
           <h1>Top</h1>
           <article>
             <h2>Section A</h2>
             <p>x</p>
             <h2>Section B</h2>
             <p>y</p>
           </article>
         </body>
       </html>`,
      'T',
    );
    const ctx = collectPageLevelContext('rich', d, fakeLocation('https://example.com/x'));
    expect(ctx.pageLang).toBe('he-IL');
    expect(ctx.pageDescription).toBe('A fine page.');
    expect(ctx.siteName).toBe('Acme');
    expect(ctx.headingTrail).toEqual(['Top', 'Section A', 'Section B']);
    expect(ctx.pageTitle).toBe('T');
    expect(ctx.pageUrl).toBe('https://example.com/x');
  });

  it('rich level caps headingTrail at depth (3 by default)', () => {
    const d = makeDoc(
      `<html><body>
         <h1>One</h1>
         <h2>Two</h2>
         <h3>Three</h3>
         <h4>Four</h4>
         <h5>Five</h5>
       </body></html>`,
      'T',
    );
    const ctx = collectPageLevelContext('rich', d, fakeLocation('u'));
    expect(ctx.headingTrail?.length).toBe(3);
    expect(ctx.headingTrail).toEqual(['One', 'Two', 'Three']);
  });

  it('rich level caps each heading entry at 120 chars (default)', () => {
    const longTitle = 'A'.repeat(500);
    const d = makeDoc(`<html><body><h1>${longTitle}</h1></body></html>`, 'T');
    const ctx = collectPageLevelContext('rich', d, fakeLocation('u'));
    expect(ctx.headingTrail?.[0]?.length).toBe(120);
  });

  it('rich level caps pageDescription at 200 chars (default)', () => {
    const desc = 'z'.repeat(500);
    const d = makeDoc(
      `<html><head><meta name="description" content="${desc}" /></head><body></body></html>`,
      'T',
    );
    const ctx = collectPageLevelContext('rich', d, fakeLocation('u'));
    expect(ctx.pageDescription?.length).toBe(200);
  });

  it('rich level dedupes identical headings of the same level', () => {
    const d = makeDoc(
      `<html><body>
         <h2>Repeat</h2>
         <h2>Repeat</h2>
         <h2>Different</h2>
       </body></html>`,
      'T',
    );
    const ctx = collectPageLevelContext('rich', d, fakeLocation('u'));
    expect(ctx.headingTrail).toEqual(['Repeat', 'Different']);
  });

  it('rich level with no body omits headingTrail', () => {
    // jsdom always materializes a body; explicitly empty doc still yields a body.
    const d = makeDoc('<html></html>', '');
    const ctx = collectPageLevelContext('rich', d, fakeLocation('u'));
    expect('headingTrail' in ctx).toBe(false);
  });

  it('respects custom tunables (depth + entryCap + descCap)', () => {
    const d = makeDoc(
      `<html><head>
         <meta name="description" content="${'d'.repeat(50)}" />
       </head><body>
         <h1>${'h'.repeat(50)}</h1>
         <h2>two</h2>
         <h3>three</h3>
       </body></html>`,
      'T',
    );
    const ctx = collectPageLevelContext('rich', d, fakeLocation('u'), {
      headingTrailDepth: 1,
      headingTrailEntryCap: 10,
      descriptionContextCap: 8,
    });
    expect(ctx.headingTrail?.length).toBe(1);
    expect(ctx.headingTrail?.[0]?.length).toBe(10);
    expect(ctx.pageDescription?.length).toBe(8);
  });
});
