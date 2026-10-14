// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import BrandMark from '@/shared/components/BrandMark.svelte';

describe('BrandMark', () => {
  it('renders the PNG icon with the Ega label', () => {
    const { container, getByText } = render(BrandMark);
    const icon = container.querySelector<HTMLImageElement>('[data-ega-brand-icon]');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('src') ?? '').toMatch(/(?:icon-32\.png|^data:image\/png)/);
    expect(getByText('Ega')).toBeTruthy();
  });

  it('default size is 16 (compact-chrome canonical)', () => {
    const { container } = render(BrandMark);
    const icon = container.querySelector<HTMLImageElement>('[data-ega-brand-icon]');
    expect(icon?.getAttribute('width')).toBe('16');
    expect(icon?.getAttribute('height')).toBe('16');
  });

  it('size=20 propagates to width/height (Options header canonical)', () => {
    const { container } = render(BrandMark, { props: { size: 20 } });
    const icon = container.querySelector<HTMLImageElement>('[data-ega-brand-icon]');
    expect(icon?.getAttribute('width')).toBe('20');
    expect(icon?.getAttribute('height')).toBe('20');
  });

  it('uses the supplied label and size=14 (mark-only canonical)', () => {
    const { container, getByText } = render(BrandMark, { props: { label: 'Workspace', size: 14 } });
    const mark = container.querySelector<HTMLElement>('.ega-brand-mark');
    const icon = container.querySelector<HTMLImageElement>('[data-ega-brand-icon]');
    expect(getByText('Workspace')).toBeTruthy();
    expect(mark?.getAttribute('style')).toContain('--ega-brand-icon-size: 14px');
    expect(icon?.getAttribute('width')).toBe('14');
    expect(icon?.getAttribute('height')).toBe('14');
  });
});
