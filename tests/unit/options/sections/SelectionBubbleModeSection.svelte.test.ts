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

  it('each choice has one short line, and the (i) says how Smart decides', () => {
    const { container, getByRole } = render(SelectionBubbleModeSection, {
      props: makeSectionProps(),
    });
    const text = container.textContent;
    expect(text).toContain('Shows it on longer text that is not in English');
    expect(text).toContain('Shows it on every selection');
    expect(text).toContain('Use the shortcut or the right-click menu instead');
    // should-show-bubble.ts length-gates before the language checks, so the (i) does not say only English is hidden.
    const info = getByRole('button', { name: 'About Smart' });
    expect(document.getElementById(info.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Smart hides the bubble on short selections and on text that reads as English. Scripts other than Latin need only two letters.',
    );
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

describe('SelectionBubbleModeSection — the smart minimum length', () => {
  const slider = '[data-ega-setting="advanced.smartBubbleMinLength"]';

  it('sits under the Smart choice, before Always, reading in letters', () => {
    const { container } = render(SelectionBubbleModeSection, {
      props: makeSectionProps({ s: { bubbleMode: 'smart' as const, smartBubbleMinLength: 4 } }),
    });
    const box = container.querySelector(slider) as HTMLElement;
    const always = container.querySelector('[role="radio"][data-value="always"]') as HTMLElement;
    expect(box.compareDocumentPosition(always) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(box.textContent).toContain('Shortest selection');
    expect(box.querySelector('[role="slider"]')?.getAttribute('aria-valuetext')).toBe('4 letters');
    // No hint: the (i) covers it.
    expect(box.querySelector('[data-ega-hint]')).toBeNull();
  });

  it('writes on release, and arrows on the slider do not change the choice', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(SelectionBubbleModeSection, {
      props: makeSectionProps({
        s: { bubbleMode: 'smart' as const, smartBubbleMinLength: 4 },
        onPatch,
      }),
    });
    const thumb = container.querySelector(`${slider} [role="slider"]`) as HTMLElement;
    thumb.focus();
    await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    await fireEvent.keyUp(thumb, { key: 'ArrowRight' });
    expect(onPatch).toHaveBeenCalledWith({ smartBubbleMinLength: 5 });
    expect(onPatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ bubbleMode: expect.anything() }),
    );
  });

  it.each(['always', 'never'] as const)('hides the slider when the mode is %s', (mode) => {
    const { container } = render(SelectionBubbleModeSection, {
      props: makeSectionProps({ s: { bubbleMode: mode } }),
    });
    expect(container.querySelector(slider)).toBeNull();
  });
});
