// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { createRawSnippet, tick } from 'svelte';
import { render, fireEvent } from '@testing-library/svelte';
import CommandPicker from '@/shared/ui/CommandPicker.svelte';

// Bits selects the first item a few microtasks after the popover opens.
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const ITEMS: { id: string; label: string; group?: string }[] = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
  { id: 'gamma', label: 'Gamma', group: 'More' },
];

let scrolled: MockInstance;
beforeEach(() => {
  scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
});
afterEach(() => {
  scrolled.mockRestore();
});

async function openPicker(): Promise<{ input: HTMLElement; onSelect: ReturnType<typeof vi.fn> }> {
  const onSelect = vi.fn();
  render(CommandPicker, {
    props: {
      open: true,
      items: ITEMS,
      onSelect,
      label: 'Pick one',
      trigger: createRawSnippet(() => ({ render: () => '<span>Open</span>' })),
      footer: createRawSnippet(() => ({
        render: () => '<button type="button" data-test-footer>Add new</button>',
      })),
    },
  });
  await settle();
  return { input: document.querySelector('input[role="combobox"]') as HTMLElement, onSelect };
}

const option = (id: string): HTMLElement =>
  document.querySelector(
    `[data-value="${id}"][role="option"], [data-value="${id}"] [role="option"]`,
  ) as HTMLElement;

describe('CommandPicker keeps bits-ui Command defaults out of the way', () => {
  it('the root that wraps the footer is not an application region', async () => {
    await openPicker();
    expect(document.querySelector('[data-command-root]')?.getAttribute('role')).toBeNull();
    expect(document.querySelector('[role="application"]')).toBeNull();
  });

  it('Home and End move the caret, not the selection', async () => {
    const { input } = await openPicker();
    const home = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
    input.dispatchEvent(home);
    const end = new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
    input.dispatchEvent(end);
    expect(home.defaultPrevented).toBe(false);
    expect(end.defaultPrevented).toBe(false);
  });

  it('Ctrl+N and Ctrl+J do not move the selection', async () => {
    const { input } = await openPicker();
    const before = input.getAttribute('aria-activedescendant');
    await fireEvent.keyDown(input, { key: 'n', ctrlKey: true });
    await fireEvent.keyDown(input, { key: 'j', ctrlKey: true });
    await tick();
    expect(input.getAttribute('aria-activedescendant')).toBe(before);
  });

  it('Enter on the footer button does not pick the selected item', async () => {
    const { onSelect } = await openPicker();
    const footer = document.querySelector('[data-test-footer]') as HTMLElement;
    await fireEvent.keyDown(footer, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a wrap back to the first row of a group with no heading scrolls it into view', async () => {
    const { input } = await openPicker();
    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    await tick();
    await settle();
    scrolled.mockClear();
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await tick();
    await settle();

    const first = option('alpha');
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(scrolled.mock.instances).toContain(first);
  });

  it('still picks the selected item on Enter in the search field', async () => {
    const { input, onSelect } = await openPicker();
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('alpha');
  });
});
