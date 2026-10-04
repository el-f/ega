// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { tick } from 'svelte';
import { render, fireEvent } from '@testing-library/svelte';
import SlotPalette from '@/options/components/SlotPalette.svelte';
import type { PromptTemplate } from '@/shared/types';

// Bits selects the first item a few microtasks after the popover opens.
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let spy: MockInstance;
beforeEach(() => {
  spy = vi.spyOn(Element.prototype, 'scrollIntoView');
});
afterEach(() => {
  spy.mockRestore();
});

// jsdom never positions the popover, so it stays visibility-hidden and role queries skip it.
async function openPicker(): Promise<HTMLElement> {
  // An unknown {{myVar}} in the template is what fills the Custom group.
  const template: PromptTemplate = { system: '', user: '{{text}} {{myVar}}' };
  const { container } = render(SlotPalette, {
    props: {
      task: 'translate' as const,
      template,
      resolvedValues: {},
      onInsert: vi.fn(),
    },
  });
  await fireEvent.click(container.querySelector('[data-ega-slot-insert-picker]') as HTMLElement);
  await settle();
  return document.querySelector('input[role="combobox"]') as HTMLElement;
}

describe('SlotPalette Insert variable picker', () => {
  it('names the search field through the label it points at', async () => {
    const input = await openPicker();
    const labelId = input.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(labelId)?.textContent.trim()).toBe('Insert variable');
  });

  it('scrolls the first row of the next group into view, not only its heading', async () => {
    const input = await openPicker();
    const custom = document.querySelector('[data-value="myVar"] [role="option"]') as HTMLElement;

    spy.mockClear();
    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    await tick();
    await settle();

    expect(input.getAttribute('aria-activedescendant')).toBe(custom.id);
    expect(spy.mock.instances).toContain(custom);
  });
});
