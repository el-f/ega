import { describe, it, expect } from 'vitest';
import { boundPageContext } from '@/shared/page-context-bounds';
import { MAX_SELECTION_CHARS } from '@/shared/constants';

describe('boundPageContext (page context from a message or storage)', () => {
  it('keeps every string field and the heading trail', () => {
    const ctx = {
      pageTitle: 'T',
      pageUrl: 'https://example.com/a',
      pageLang: 'en',
      pageDescription: 'D',
      siteName: 'S',
      headingTrail: ['H1', 'H2'],
      beforeText: 'B',
      afterText: 'A',
      postText: 'P',
      imageAlt: 'Alt',
      imageCaption: 'Caption',
    };
    expect(boundPageContext(ctx)).toEqual(ctx);
  });

  it('drops a field of the wrong type, an unknown key and a non-string heading', () => {
    expect(
      boundPageContext({
        pageTitle: 42,
        pageUrl: { href: 'x' },
        headingTrail: ['ok', 7, null],
        extra: 'x',
        imageAlt: 'kept',
      }),
    ).toEqual({ headingTrail: ['ok'], imageAlt: 'kept' });
  });

  it('caps each string at the selection cap and the trail at ten entries', () => {
    const out = boundPageContext({
      imageCaption: 'c'.repeat(5000),
      headingTrail: Array.from({ length: 20 }, () => 'h'.repeat(5000)),
    });
    expect(out?.imageCaption).toHaveLength(MAX_SELECTION_CHARS);
    expect(out?.headingTrail).toHaveLength(10);
    expect(out?.headingTrail?.[0]).toHaveLength(MAX_SELECTION_CHARS);
  });

  it.each([null, undefined, 'title', 3, ['x']])('reads %j as no context', (raw) => {
    expect(boundPageContext(raw)).toBeUndefined();
  });
});
