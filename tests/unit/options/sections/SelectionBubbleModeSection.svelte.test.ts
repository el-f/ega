// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SelectionBubbleModeSection from '@/options/components/sections/SelectionBubbleModeSection.svelte';
import { makeSectionProps, type OnPatch } from './_helpers';

describe('SelectionBubbleModeSection', () => {
  it('renders the bubbleMode RadioGroup with 3 options', () => {
    const { container } = render(SelectionBubbleModeSection, { props: makeSectionProps() });
    expect(container.querySelector('input[name="bubbleMode"]')).not.toBeNull();
    const items = container.querySelectorAll('[role="radiogroup"] [role="radio"]');
    expect(items.length).toBe(3);
  });

  it('applies the current bubbleMode value to the group', () => {
    const { container } = render(SelectionBubbleModeSection, {
      props: makeSectionProps({ s: { bubbleMode: 'always' as const } }),
    });
    const checked = container.querySelector(
      '[role="radiogroup"] [role="radio"][data-state="checked"]',
    );
    expect(checked?.getAttribute('data-value')).toBe('always');
  });

  it('Smart copy matches the code: short selections are hidden regardless of language', () => {
    // should-show-bubble.ts length-gates BEFORE the language checks, so the
    // description must not claim short text is hidden only for English.
    const { container } = render(SelectionBubbleModeSection, { props: makeSectionProps() });
    const text = container.textContent;
    expect(text).toContain('short selections');
    expect(text).not.toContain('short English text');
    expect(text).toMatch(/non-English text or transliterations/i);
  });

  it('fires onPatch when a new mode is selected', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(SelectionBubbleModeSection, {
      props: makeSectionProps({ s: { bubbleMode: 'smart' as const }, onPatch }),
    });
    const alwaysOpt = container.querySelector(
      '[role="radiogroup"] [role="radio"][data-value="always"]',
    );
    if (!alwaysOpt) throw new Error('always radio not rendered');
    await fireEvent.click(alwaysOpt);
    expect(onPatch).toHaveBeenCalledWith({ bubbleMode: 'always' });
  });
});
