// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Spec 1.4: every Ega surface on a page sits on its own layer inside the one shadow host, bottom to top.

function sheet(file: string): CSSStyleRule[] {
  const css = readFileSync(resolve(file), 'utf8').replace(/@import[^;]+;/g, '');
  document.head.innerHTML = `<style>${css}</style>`;
  return Array.from(document.styleSheets[0]?.cssRules ?? []).filter(
    (r): r is CSSStyleRule => r instanceof CSSStyleRule,
  );
}

function zIndex(file: string, selector: string): string | undefined {
  return sheet(file)
    .find((r) => r.selectorText === selector)
    ?.style.getPropertyValue('z-index');
}

describe('in-page motion', () => {
  it('under reduced motion the page toast fades in where it stands, with no rise', () => {
    const css = readFileSync(resolve('src/content/shadow.css'), 'utf8');
    document.head.innerHTML = `<style>${css.replace(/@import[^;]+;/g, '')}</style>`;
    const media = Array.from(document.styleSheets[0]?.cssRules ?? []).find(
      (r): r is CSSMediaRule =>
        r instanceof CSSMediaRule &&
        r.media.mediaText === '(prefers-reduced-motion: reduce)' &&
        Array.from(r.cssRules).some(
          (c) => c instanceof CSSStyleRule && c.selectorText === '.ega-toast',
        ),
    );
    const toast = Array.from(media?.cssRules ?? []).find(
      (c): c is CSSStyleRule => c instanceof CSSStyleRule && c.selectorText === '.ega-toast',
    );
    const name = toast?.style.getPropertyValue('animation-name');
    expect(name).toBe('ega-content-toast-fade');
    // The fade's keyframes move nothing.
    const frames = new RegExp(`@keyframes ${name ?? '-'}\\s*\\{([^@]*)`).exec(css)?.[1] ?? '';
    expect(frames).toContain('opacity');
    expect(frames).not.toMatch(/transform|translate|scale/);
  });
});

describe('in-page layers', () => {
  it('number the layers bottom to top: dimmer, outline, bar, bubble, tooltip, toast, label', () => {
    const host = sheet('src/content/shadow.css').find((r) => r.selectorText === ':host');
    const order = ['dimmer', 'outline', 'bar', 'bubble', 'tooltip', 'toast', 'label'].map((n) =>
      Number(host?.style.getPropertyValue(`--ega-layer-${n}`)),
    );
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('put each surface on its layer, so a toast sits over the tooltip and the tooltip over the pill', () => {
    expect(zIndex('src/content/shadow.css', '.bubble-group')).toBe('var(--ega-layer-bubble)');
    expect(zIndex('src/content/shadow.css', '.ega-toast')).toBe('var(--ega-layer-toast)');
    expect(zIndex('src/content/tooltip/tooltip.css', '.tooltip')).toBe('var(--ega-layer-tooltip)');
    expect(zIndex('src/content/batch-progress.css', '.ega-batch-progress')).toBe(
      'var(--ega-layer-bar)',
    );
  });
});
