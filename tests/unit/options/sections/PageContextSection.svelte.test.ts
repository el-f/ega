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

  it('keeps the Rich-only limits on screen but off under Minimal, and says why', () => {
    const { container, getByText } = render(PageContextSection, {
      props: makeSectionProps({ s: { contextEnabled: true, pageContextLevel: 'minimal' } }),
    });
    const note = getByText('Used only with Rich');
    for (const id of ['descriptionContextCap', 'headingTrailDepth', 'headingTrailEntryCap']) {
      const anchor = container.querySelector(`[data-ega-setting="advanced.${id}"]`);
      expect(anchor, id).not.toBeNull();
      const thumb = anchor?.querySelector('[role="slider"]');
      expect(thumb?.getAttribute('aria-disabled')).toBe('true');
      expect(thumb?.getAttribute('aria-describedby')).toContain(note.id);
      // A search jump can scroll the shared note away, so each slider's own hint says it too.
      expect(anchor?.textContent).toContain('used only with Rich');
    }
    const selection = container.querySelector('[data-ega-setting="advanced.selectionContextCap"]');
    expect(selection?.querySelector('[role="slider"]')?.getAttribute('aria-disabled')).toBe(
      'false',
    );
  });

  it('shows the 4 payload sliders under Rich', () => {
    const { container } = render(PageContextSection, {
      props: makeSectionProps({ s: { contextEnabled: true, pageContextLevel: 'rich' } }),
    });
    const wrapper = container.querySelector('[data-ega-setting="advanced.pageContextPayload"]');
    expect(wrapper).not.toBeNull();
    const sliders = wrapper?.querySelectorAll('[role="slider"]') ?? [];
    expect(sliders.length).toBeGreaterThanOrEqual(4);
    expect(wrapper?.textContent).not.toContain('Rich only.');
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
