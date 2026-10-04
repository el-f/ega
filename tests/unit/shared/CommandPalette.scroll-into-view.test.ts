// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CommandPalette from '@/shared/components/CommandPalette.svelte';
import type { Command } from '@/shared/command-registry';

const many: readonly Command[] = Array.from({ length: 30 }, (_, i) => ({
  id: `a.${i}`,
  group: 'actions' as const,
  label: `Command ${i}`,
  run: vi.fn(),
}));

// Bits UI selects (and scrolls to) the first option a few microtasks after mount.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let spy: MockInstance<Element['scrollIntoView']>;

beforeEach(() => {
  spy = vi.spyOn(Element.prototype, 'scrollIntoView');
});
afterEach(() => {
  spy.mockRestore();
});

describe('CommandPalette — keyboard selection stays on screen', () => {
  it('scrolls the newly selected option into view on ArrowDown', async () => {
    const { getByRole } = render(CommandPalette, {
      props: { open: true, commands: many, onClose: vi.fn() },
    });
    await settle();
    spy.mockClear();

    await fireEvent.keyDown(getByRole('combobox'), { key: 'ArrowDown' });

    const scrolled = spy.mock.instances.filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.id === 'ega-cmd-opt-a.1',
    );
    expect(scrolled.length).toBeGreaterThan(0);
    expect(spy.mock.calls.at(-1)?.[0]).toEqual({ block: 'nearest' });
  });

  it('scrolls the last option into view when ArrowUp wraps', async () => {
    const { getByRole } = render(CommandPalette, {
      props: { open: true, commands: many, onClose: vi.fn() },
    });
    await settle();
    spy.mockClear();

    await fireEvent.keyDown(getByRole('combobox'), { key: 'ArrowUp' });

    const ids = spy.mock.instances
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .map((el) => el.id);
    expect(ids).toContain('ega-cmd-opt-a.29');
  });

  it('scrolls the first option of the next group into view, not only its heading', async () => {
    const commands: readonly Command[] = [
      ...many,
      { id: 's.0', group: 'settings', label: 'Setting 0', run: vi.fn() },
      { id: 's.1', group: 'settings', label: 'Setting 1', run: vi.fn() },
    ];
    const { getByRole } = render(CommandPalette, {
      props: { open: true, commands, onClose: vi.fn() },
    });
    const combobox = getByRole('combobox');
    await settle();
    for (let i = 0; i < 3; i++) await fireEvent.keyDown(combobox, { key: 'ArrowUp' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe('ega-cmd-opt-a.29');
    await settle();
    spy.mockClear();

    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    await settle();

    const ids = spy.mock.instances
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .map((el) => el.id);
    expect(ids).toContain('ega-cmd-opt-s.0');
  });
});
