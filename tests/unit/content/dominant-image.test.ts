// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { findDominantPostImage } from '@/content/dominant-image';

function img(w: number, h: number, src: string): HTMLImageElement {
  const el = document.createElement('img');
  Object.defineProperty(el, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: h, configurable: true });
  el.getBoundingClientRect = () =>
    ({
      width: w,
      height: h,
      top: 0,
      left: 0,
      right: w,
      bottom: h,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  Object.defineProperty(el, 'currentSrc', { value: src, configurable: true });
  el.src = src;
  return el;
}

describe('findDominantPostImage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
  });

  it('returns the large post image', () => {
    const root = document.createElement('div');
    root.appendChild(img(600, 600, 'https://i.redd.it/big.png'));
    document.body.appendChild(root);
    expect(findDominantPostImage(root)).toBe('https://i.redd.it/big.png');
  });

  it('ignores tiny icons/avatars', () => {
    const root = document.createElement('div');
    root.appendChild(img(24, 24, 'https://x/avatar.png'));
    document.body.appendChild(root);
    expect(findDominantPostImage(root)).toBeNull();
  });

  it('returns null when two large images compete (ambiguous)', () => {
    const root = document.createElement('div');
    root.appendChild(img(600, 600, 'https://x/a.png'));
    root.appendChild(img(600, 600, 'https://x/b.png'));
    document.body.appendChild(root);
    expect(findDominantPostImage(root)).toBeNull();
  });

  it('ignores data: URLs', () => {
    const root = document.createElement('div');
    root.appendChild(img(600, 600, 'data:image/png;base64,AAAA'));
    document.body.appendChild(root);
    expect(findDominantPostImage(root)).toBeNull();
  });

  it('rejects an image that clears the edge gate but is tiny relative to the viewport', () => {
    Object.defineProperty(window, 'innerWidth', { value: 3000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 3000, configurable: true });
    const root = document.createElement('div');
    // 300×300 = 90k px clears MIN_EDGE(200) but is 1% of a 9M-px viewport (< 15%).
    root.appendChild(img(300, 300, 'https://x/small-in-huge.png'));
    document.body.appendChild(root);
    expect(findDominantPostImage(root)).toBeNull();
  });

  it('returns null for a root with no images', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    expect(findDominantPostImage(root)).toBeNull();
  });
});
