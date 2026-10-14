// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { tick } from 'svelte';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import SettingsSearch from '@/options/components/SettingsSearch.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

let spy: MockInstance<Element['scrollIntoView']>;

beforeEach(() => {
  try {
    localStorage.removeItem('ega.settings-search.recent');
  } catch {
    // ignore
  }
  spy = vi.spyOn(Element.prototype, 'scrollIntoView');
});
afterEach(() => {
  spy.mockRestore();
});

describe('SettingsSearch — keyboard selection stays on screen', () => {
  it('scrolls the selected result into view on ArrowDown', async () => {
    const { container, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: vi.fn(),
        onJump: vi.fn(),
      },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'e' } });

    const options = Array.from(container.querySelectorAll('[role="option"]'));
    expect(options.length).toBeGreaterThan(1);
    spy.mockClear();

    await fireEvent.keyDown(input, { key: 'ArrowDown' });

    const second = options[1] as HTMLElement;
    expect(second.getAttribute('aria-selected')).toBe('true');
    const scrolledIds = spy.mock.instances
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .map((el) => el.id);
    expect(scrolledIds).toContain(second.id);
    expect(spy.mock.calls.at(-1)?.[0]).toEqual({ block: 'nearest' });
  });

  function renderSearch() {
    const utils = render(SettingsSearch, {
      props: { open: true, settings: DEFAULT_SETTINGS, onClose: vi.fn(), onJump: vi.fn() },
    });
    const input = utils.getByPlaceholderText('Search settings…') as HTMLInputElement;
    return { ...utils, input };
  }
  function scrolledIds(): string[] {
    return spy.mock.instances
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .map((el) => el.id);
  }

  it('scrolls the first result into view when ArrowDown wraps from the last one', async () => {
    const { container, input } = renderSearch();
    await fireEvent.input(input, { target: { value: 'e' } });
    const options = Array.from(container.querySelectorAll('[role="option"]'));
    expect(options.length).toBeGreaterThan(1);

    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    spy.mockClear();
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await tick();

    const first = options[0] as HTMLElement;
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(scrolledIds()).toContain(first.id);
  });

  it('scrolls the first result into view when ArrowUp returns to it', async () => {
    const { container, input } = renderSearch();
    await fireEvent.input(input, { target: { value: 'e' } });
    const first = container.querySelector('[role="option"]') as HTMLElement;

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    spy.mockClear();
    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    await tick();

    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(scrolledIds()).toContain(first.id);
  });

  it('scrolls the first Popular row, not just its heading, when leaving Recently used', async () => {
    localStorage.setItem('ega.settings-search.recent', JSON.stringify(['display.theme']));
    const { getByRole, input } = renderSearch();
    const combobox = getByRole('combobox');
    const popular = within(getByRole('listbox', { name: 'Suggested settings' })).getByRole(
      'group',
      { name: 'Popular settings' },
    );
    const firstPopular = within(popular).getAllByRole('option')[0] as HTMLElement;
    await waitFor(() =>
      expect(combobox.getAttribute('aria-activedescendant')).toMatch(/^slv-opt-recent-/),
    );

    spy.mockClear();
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await tick();

    expect(combobox.getAttribute('aria-activedescendant')).toBe(firstPopular.id);
    expect(scrolledIds()).toContain(firstPopular.id);
  });

  it('scrolls the new first result into view when the query changes after scrolling down', async () => {
    const { container, getByRole, input } = renderSearch();
    await fireEvent.input(input, { target: { value: 'e' } });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    const combobox = getByRole('combobox');

    spy.mockClear();
    await fireEvent.input(input, { target: { value: 'ca' } });
    await tick();

    const first = container.querySelector('[role="option"]') as HTMLElement;
    await waitFor(() => expect(combobox.getAttribute('aria-activedescendant')).toBe(first.id));
    expect(scrolledIds()).toContain(first.id);
  });
});
