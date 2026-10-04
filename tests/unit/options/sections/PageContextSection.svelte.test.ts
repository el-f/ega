// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PageContextSection from '@/options/components/sections/PageContextSection.svelte';
import { makeSectionProps, type OnPatch } from './_helpers';

describe('PageContextSection', () => {
  it('renders the contextEnabled toggle', () => {
    const { container } = render(PageContextSection, { props: makeSectionProps() });
    expect(container.querySelector('[data-ega-setting="display.contextEnabled"]')).not.toBeNull();
  });

  it('hides the 4 payload sliders when contextEnabled is false', () => {
    const { container } = render(PageContextSection, {
      props: makeSectionProps({ s: { contextEnabled: false } }),
    });
    expect(container.querySelector('[data-ega-setting="advanced.pageContextPayload"]')).toBeNull();
  });

  it('shows only the selection slider under Minimal, and says how to get the rest', () => {
    const { container, getByText } = render(PageContextSection, {
      props: makeSectionProps({ s: { contextEnabled: true, pageContextLevel: 'minimal' } }),
    });
    const wrapper = container.querySelector('[data-ega-setting="advanced.pageContextPayload"]');
    expect(wrapper?.querySelectorAll('[role="slider"]').length).toBe(1);
    expect(container.querySelector('[data-ega-setting="advanced.headingTrailDepth"]')).toBeNull();
    expect(getByText(/Set Context depth to Rich/)).toBeTruthy();
  });

  it('shows the 4 payload sliders under Rich', () => {
    const { container } = render(PageContextSection, {
      props: makeSectionProps({ s: { contextEnabled: true, pageContextLevel: 'rich' } }),
    });
    const wrapper = container.querySelector('[data-ega-setting="advanced.pageContextPayload"]');
    expect(wrapper).not.toBeNull();
    const sliders = wrapper?.querySelectorAll('[role="slider"]') ?? [];
    expect(sliders.length).toBeGreaterThanOrEqual(4);
  });

  it('fires onPatch when toggling contextEnabled', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(PageContextSection, {
      props: makeSectionProps({ s: { contextEnabled: true }, onPatch }),
    });
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) throw new Error('checkbox not rendered');
    await fireEvent.click(checkbox);
    expect(onPatch).toHaveBeenCalledWith({ contextEnabled: false });
  });
});
