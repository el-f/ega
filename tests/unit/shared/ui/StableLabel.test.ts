// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/svelte';
import StableLabel from '@/shared/ui/StableLabel.svelte';

describe('StableLabel (R63)', () => {
  it('shows the current label and holds every label as an empty, hidden sizer', () => {
    const { container } = render(StableLabel, {
      props: { current: 'Copied', labels: ['Copy as JSON', 'Copied'] },
    });
    const stack = container.querySelector('.ega-stable');
    expect(stack?.textContent).toBe('Copied');
    const sizers = [...(stack?.querySelectorAll('[data-label]') ?? [])];
    expect(sizers.map((s) => s.getAttribute('data-label'))).toEqual(['Copy as JSON', 'Copied']);
    for (const s of sizers) {
      expect(s.getAttribute('aria-hidden')).toBe('true');
      expect(s.textContent).toBe('');
    }
    expect(stack?.classList.contains('is-start')).toBe(false);
  });

  it('start puts the words at the start of the cell', () => {
    const { container } = render(StableLabel, {
      props: { current: 'Show less', labels: ['Show all page info', 'Show less'], start: true },
    });
    expect(container.querySelector('.ega-stable')?.classList.contains('is-start')).toBe(true);
  });

  // jsdom has no layout, so the rules are read from tokens.css, the one sheet every surface and the shadow root load.
  it('its rules stack the labels in one hidden grid cell and keep a link underline', () => {
    const css = readFileSync('src/shared/tokens.css', 'utf8');
    const rule = (selector: string): string => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';
    };
    expect(rule('.ega-stable')).toMatch(/display: inline-grid;/);
    expect(rule('.ega-stable')).toMatch(/text-decoration: inherit;/);
    expect(rule('.ega-stable > *')).toMatch(/grid-area: 1 \/ 1;/);
    expect(rule('.ega-stable > [data-label]')).toMatch(/visibility: hidden;/);
    expect(rule('.ega-stable > [data-label]::before')).toMatch(/content: attr\(data-label\);/);
    expect(rule('.ega-stable.is-start')).toMatch(/justify-items: start;/);
  });
});
