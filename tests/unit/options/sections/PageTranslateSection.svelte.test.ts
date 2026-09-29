// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import PageTranslateSection from '@/options/components/sections/PageTranslateSection.svelte';
import { makeSectionProps } from './_helpers';

describe('PageTranslateSection', () => {
  it('renders the batch concurrency slider anchor', () => {
    const { container } = render(PageTranslateSection, { props: makeSectionProps() });
    expect(
      container.querySelector('[data-ega-setting="advanced.batchConcurrency"]'),
    ).not.toBeNull();
  });

  it('details element starts collapsed (no open attribute)', () => {
    const { container } = render(PageTranslateSection, { props: makeSectionProps() });
    const det = container.querySelector('details');
    if (!det) throw new Error('details element not rendered');
    expect(det.hasAttribute('open')).toBe(false);
  });
});
