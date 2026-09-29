import { describe, it, expect } from 'vitest';
import { deriveOrigin, GENERAL_ORIGIN } from '@/sidepanel/state/conversation-store';

describe('deriveOrigin', () => {
  it('returns the origin for http(s) urls', () => {
    expect(deriveOrigin('https://nytimes.com/world/article?x=1#frag')).toBe('https://nytimes.com');
    expect(deriveOrigin('http://example.com:8080/a')).toBe('http://example.com:8080');
  });
  it('maps non-web schemes to the general bucket', () => {
    expect(deriveOrigin('chrome://extensions')).toBe(GENERAL_ORIGIN);
    expect(deriveOrigin('file:///C:/x.pdf')).toBe(GENERAL_ORIGIN);
    expect(deriveOrigin('about:blank')).toBe(GENERAL_ORIGIN);
  });
  it('maps undefined / malformed urls to the general bucket', () => {
    expect(deriveOrigin(undefined)).toBe(GENERAL_ORIGIN);
    expect(deriveOrigin('')).toBe(GENERAL_ORIGIN);
    expect(deriveOrigin('not a url')).toBe(GENERAL_ORIGIN);
  });
});
