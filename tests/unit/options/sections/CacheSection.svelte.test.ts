// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CacheSection from '@/options/components/sections/CacheSection.svelte';
import { makeSectionProps, type OnPatch } from './_helpers';

describe('CacheSection', () => {
  it('renders the cacheEnabled toggle', () => {
    const { container } = render(CacheSection, { props: makeSectionProps() });
    expect(container.querySelector('[data-ega-setting="advanced.cacheEnabled"]')).not.toBeNull();
  });

  it('fires onPatch when toggling cacheEnabled', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(CacheSection, {
      props: makeSectionProps({ s: { cacheEnabled: true }, onPatch }),
    });
    const cb = container.querySelector<HTMLInputElement>('#cache-enabled-toggle');
    if (!cb) throw new Error('no cache-enabled checkbox');
    await fireEvent.click(cb);
    expect(onPatch).toHaveBeenCalledWith({ cacheEnabled: false });
  });
});
