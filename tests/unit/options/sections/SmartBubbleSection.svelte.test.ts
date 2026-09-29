// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SmartBubbleSection from '@/options/components/sections/SmartBubbleSection.svelte';
import { makeSectionProps } from './_helpers';

describe('SmartBubbleSection', () => {
  it('shows the smartBubbleMinLength slider when bubbleMode is smart', () => {
    const { container } = render(SmartBubbleSection, {
      props: makeSectionProps({ s: { bubbleMode: 'smart' as const } }),
    });
    expect(
      container.querySelector('[data-ega-setting="advanced.smartBubbleMinLength"]'),
    ).not.toBeNull();
  });

  it('hides the slider when bubbleMode is always', () => {
    const { container } = render(SmartBubbleSection, {
      props: makeSectionProps({ s: { bubbleMode: 'always' as const } }),
    });
    expect(
      container.querySelector('[data-ega-setting="advanced.smartBubbleMinLength"]'),
    ).toBeNull();
  });

  it('hides the slider when bubbleMode is never', () => {
    const { container } = render(SmartBubbleSection, {
      props: makeSectionProps({ s: { bubbleMode: 'never' as const } }),
    });
    expect(
      container.querySelector('[data-ega-setting="advanced.smartBubbleMinLength"]'),
    ).toBeNull();
  });
});
