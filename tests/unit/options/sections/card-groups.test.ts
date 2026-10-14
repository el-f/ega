// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import BackendChecksSection from '@/options/components/sections/BackendChecksSection.svelte';
import GenerationSection from '@/options/components/sections/GenerationSection.svelte';
import PageContextSection from '@/options/components/sections/PageContextSection.svelte';
import StreamingSection from '@/options/components/sections/StreamingSection.svelte';
import { makeGenerationSectionProps, makeSectionProps } from './_helpers';

// R1-14, R1-15 (spec 1.1, R14): in cards of stacked controls each control with its hint and notes is a
// group, 24px from the next, so a hint never reads as the next control's.
describe('cards of stacked controls space their children as groups', () => {
  const body = (c: HTMLElement): Element | null => c.querySelector('.ega-section-card-body');

  it('Timeouts and checks', () => {
    const { container } = render(BackendChecksSection, { props: makeSectionProps() });
    expect(body(container)?.classList.contains('groups')).toBe(true);
  });

  it('Generation', () => {
    const { container } = render(GenerationSection, { props: makeGenerationSectionProps() });
    expect(body(container)?.classList.contains('groups')).toBe(true);
  });

  it('Page context', () => {
    const { container } = render(PageContextSection, { props: makeSectionProps() });
    expect(body(container)?.classList.contains('groups')).toBe(true);
  });

  it('Streaming and cache', () => {
    const { container } = render(StreamingSection, { props: makeSectionProps() });
    expect(body(container)?.classList.contains('groups')).toBe(true);
  });
});
