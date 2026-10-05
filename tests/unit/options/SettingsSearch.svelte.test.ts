// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tick } from 'svelte';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import SettingsSearch from '@/options/components/SettingsSearch.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { SettingsTab } from '@/shared/settings-spec';

const RECENT_KEY = 'ega.settings-search.recent';

describe('SettingsSearch — recently-used list', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
  });

  it('renders Popular settings only when no recents exist', () => {
    const { container } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    expect(container.querySelector('[data-ega-recent-list]')).toBeNull();
    const headers = container.querySelectorAll('.ss-popular-header');
    expect(headers.length).toBeGreaterThan(0);
  });

  it('mounts shared SettingsListView primitive for results', async () => {
    const { container, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'temperature' } });
    expect(container.querySelector('[data-ega-settings-list-item]')).not.toBeNull();
  });

  it('renders Recently used when localStorage has entries', () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(['advanced.temperature', 'display.theme']));
    const { container } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    expect(container.querySelector('[data-ega-recent-list]')).not.toBeNull();
    expect(container.querySelector('[data-ega-recent-header]')).not.toBeNull();
  });

  it('pushes jumped entry id to localStorage (most-recent-first, dedup)', async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(['advanced.temperature', 'display.theme']));
    const { container } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const theme = container.querySelector(
      '[data-ega-recent-list] [data-ega-settings-list-item="display.theme"]',
    );
    expect(theme).not.toBeNull();
    await fireEvent.click(theme as HTMLElement);
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as readonly string[];
    expect(stored).toEqual(['display.theme', 'advanced.temperature']);
  });
});

describe('SettingsSearch — deep-link routing', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
  });

  async function searchAndClickFirst(query: string): Promise<SettingsTab> {
    const onJump = vi.fn<(tab: SettingsTab, id: string) => void>();
    const { container, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump,
      },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: query } });
    const firstResult = container.querySelector(
      '[data-ega-settings-list-item]',
    ) as HTMLButtonElement | null;
    if (!firstResult) throw new Error(`no results for "${query}"`);
    await fireEvent.click(firstResult);
    expect(onJump).toHaveBeenCalledTimes(1);
    const call = onJump.mock.calls[0];
    if (!call) throw new Error('onJump never called');
    return call[0];
  }

  it('searching "smart bubble" deep-links to selection-bubble tab', async () => {
    const tab = await searchAndClickFirst('smart bubble');
    expect(tab).toBe('selection-bubble');
  });

  it('searching "streaming" deep-links to translate tab', async () => {
    const tab = await searchAndClickFirst('streaming');
    expect(tab).toBe('translate');
  });

  it('searching "cache settings" deep-links to translate tab', async () => {
    const tab = await searchAndClickFirst('cache settings');
    expect(tab).toBe('translate');
  });

  it('searching "selection bubble" deep-links to selection-bubble tab', async () => {
    const tab = await searchAndClickFirst('selection bubble');
    expect(tab).toBe('selection-bubble');
  });

  it('searching "tooltip" deep-links to translate tab', async () => {
    const tab = await searchAndClickFirst('tooltip');
    expect(tab).toBe('translate');
  });
});

describe('SettingsSearch — combobox ARIA on input element', () => {
  it('role="combobox" is on the <input>, not a container div', () => {
    const { getByRole } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const combobox = getByRole('combobox');
    expect(combobox.tagName.toLowerCase()).toBe('input');
  });

  it('the wrapper around the hint and messages is not role="application" and not focusable', () => {
    const { container } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const root = container.querySelector('[data-command-root]');
    expect(root?.querySelector('.ss-hint')).not.toBeNull();
    expect(root?.hasAttribute('role')).toBe(false);
    expect(root?.hasAttribute('tabindex')).toBe(false);
  });

  it('an example in the hint is a button that runs that search', async () => {
    const { getByRole } = render(SettingsSearch, {
      props: { open: true, settings: DEFAULT_SETTINGS, onClose: () => {}, onJump: () => {} },
    });
    const example = getByRole('button', { name: 'temperature' });
    example.focus();
    await fireEvent.click(example);
    await waitFor(() =>
      expect((getByRole('combobox') as HTMLInputElement).value).toBe('temperature'),
    );
    // The example unmounts with the hint, so focus must not fall to the page.
    expect(example.isConnected).toBe(false);
    expect(document.activeElement).toBe(getByRole('combobox'));
  });

  it('input has an accessible name (aria-label)', () => {
    const { getByRole } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    expect(getByRole('combobox', { name: 'Search settings' })).toBeTruthy();
  });

  it('aria-expanded is true while a list renders (suggestions or results), false on no match', async () => {
    const { container, getByRole, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const combobox = getByRole('combobox');
    const input = getByPlaceholderText('Search settings…');
    expect(combobox.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#ega-settings-search-list')).not.toBeNull();
    await fireEvent.input(input, { target: { value: 'temperature' } });
    expect(combobox.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.input(input, { target: { value: 'zzqqxx' } });
    expect(combobox.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#ega-settings-search-list')).toBeNull();
  });

  it('aria-controls resolves to the rendered results listbox', async () => {
    const { container, getByRole, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    await fireEvent.input(getByPlaceholderText('Search settings…'), {
      target: { value: 'temperature' },
    });
    const controls = getByRole('combobox').getAttribute('aria-controls');
    expect(controls).toBe('ega-settings-search-list');
    expect(container.querySelector(`#${controls}`)).not.toBeNull();
  });

  it('aria-activedescendant points at the selected option id when results show', async () => {
    const { container, getByRole, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'temperature' } });
    const firstOption = container.querySelector(
      '[data-ega-settings-list-item]',
    ) as HTMLButtonElement;
    expect(firstOption.id).toMatch(/^slv-opt-/);
    expect(getByRole('combobox').getAttribute('aria-activedescendant')).toBe(firstOption.id);
  });

  it('before a query, aria-activedescendant points at the first suggestion', async () => {
    const { getByRole } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const first = getByRole('listbox', { name: 'Suggested settings' }).querySelector(
      '[role="option"]',
    );
    expect(first?.id).toMatch(/^slv-opt-/);
    await waitFor(() =>
      expect(getByRole('combobox').getAttribute('aria-activedescendant')).toBe(first?.id),
    );
  });

  it('has no aria-activedescendant when nothing matches', async () => {
    const { getByRole, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const combobox = getByRole('combobox');
    const input = getByPlaceholderText('Search settings…');
    await fireEvent.input(input, { target: { value: 'temperature' } });
    await waitFor(() => expect(combobox.getAttribute('aria-activedescendant')).not.toBeNull());
    await fireEvent.input(input, { target: { value: 'zzqqxx' } });
    await tick();
    expect(combobox.getAttribute('aria-activedescendant')).toBeNull();
  });
});

describe('SettingsSearch — listbox semantics', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
  });

  it('results are options of the "Settings results" listbox and are not Tab stops', async () => {
    const { container, getByRole, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    await fireEvent.input(getByPlaceholderText('Search settings…'), {
      target: { value: 'timeout' },
    });
    const listbox = getByRole('listbox', { name: 'Settings results' });
    const rows = Array.from(container.querySelectorAll('[data-ega-settings-list-item]'));
    expect(rows.length).toBeGreaterThan(1);
    expect(within(listbox).getAllByRole('option')).toEqual(rows);
    for (const row of rows) {
      expect(row.hasAttribute('tabindex')).toBe(false);
      expect((row as HTMLElement).tabIndex).toBe(-1);
    }
  });

  it('suggestions are options grouped under "Recently used" and "Popular settings"', () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(['display.theme']));
    const { getByRole } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const listbox = getByRole('listbox', { name: 'Suggested settings' });
    const recent = within(listbox).getByRole('group', { name: 'Recently used' });
    const popular = within(listbox).getByRole('group', { name: 'Popular settings' });
    const recentRows = within(recent).getAllByRole('option');
    expect(recentRows.map((r) => r.getAttribute('data-ega-settings-list-item'))).toEqual([
      'display.theme',
    ]);
    expect(within(popular).getAllByRole('option').length).toBeGreaterThan(0);
  });
});

describe('SettingsSearch — keyboard and pointer reach every option', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
  });

  function renderSearch(settings = DEFAULT_SETTINGS) {
    const onJump = vi.fn<(tab: SettingsTab, id: string) => void>();
    const onClose = vi.fn();
    const utils = render(SettingsSearch, {
      props: { open: true, settings, onClose, onJump },
    });
    const input = utils.getByPlaceholderText('Search settings…') as HTMLInputElement;
    const combobox = utils.getByRole('combobox');
    const rowIds = (): string[] =>
      Array.from(utils.container.querySelectorAll('[data-ega-settings-list-item]')).map(
        (el) => el.id,
      );
    return { ...utils, input, combobox, onJump, onClose, rowIds };
  }

  it('Enter on the active result jumps to it, records it as recent, and closes', async () => {
    const { input, combobox, container, onJump, onClose } = renderSearch();
    await fireEvent.input(input, { target: { value: 'timeout' } });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    const rows = container.querySelectorAll('[data-ega-settings-list-item]');
    const second = rows[1];
    expect(combobox.getAttribute('aria-activedescendant')).toBe(second?.id);
    const secondId = second?.getAttribute('data-ega-settings-list-item');

    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]?.[1]).toBe(secondId);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')).toEqual([secondId]);
  });

  it('ArrowUp on the top result wraps to the last one', async () => {
    const { input, combobox, rowIds } = renderSearch();
    await fireEvent.input(input, { target: { value: 'timeout' } });
    const ids = rowIds();
    expect(ids.length).toBeGreaterThan(2);
    expect(combobox.getAttribute('aria-activedescendant')).toBe(ids[0]);
    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe(ids.at(-1));
  });

  it('arrow keys walk from Recently used into Popular settings, and Enter jumps', async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(['display.theme']));
    const { input, combobox, getByRole, onJump, onClose } = renderSearch();
    const popular = within(getByRole('listbox', { name: 'Suggested settings' })).getByRole(
      'group',
      { name: 'Popular settings' },
    );
    const firstPopular = within(popular).getAllByRole('option')[0];
    await waitFor(() =>
      expect(combobox.getAttribute('aria-activedescendant')).toMatch(/^slv-opt-recent-/),
    );

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe(firstPopular?.id);
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]?.[1]).toBe(
      firstPopular?.getAttribute('data-ega-settings-list-item'),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Enter on the Clear button or the Modified only box is left to that control', async () => {
    const { input, combobox, container, getByLabelText, onJump } = renderSearch();
    await fireEvent.input(input, { target: { value: 'timeout' } });
    expect(combobox.getAttribute('aria-activedescendant')).not.toBeNull();

    const clear = container.querySelector('.ega-input-clear');
    if (!clear) throw new Error('clear button missing');
    expect(await fireEvent.keyDown(clear, { key: 'Enter' })).toBe(true);
    expect(await fireEvent.keyDown(getByLabelText('Modified only'), { key: 'Enter' })).toBe(true);
    expect(onJump).not.toHaveBeenCalled();
  });

  it('Home and End move the input caret, not the active option', async () => {
    const { input, combobox, rowIds } = renderSearch();
    await fireEvent.input(input, { target: { value: 'timeout' } });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = rowIds()[1];
    expect(combobox.getAttribute('aria-activedescendant')).toBe(second);

    expect(await fireEvent.keyDown(input, { key: 'End' })).toBe(true);
    expect(await fireEvent.keyDown(input, { key: 'Home' })).toBe(true);
    expect(combobox.getAttribute('aria-activedescendant')).toBe(second);
  });

  it('hovering an option makes it the active one', async () => {
    const { input, combobox, container } = renderSearch();
    await fireEvent.input(input, { target: { value: 'timeout' } });
    const third = container.querySelectorAll('[data-ega-settings-list-item]')[2];
    if (!third) throw new Error('fewer than three results');
    await fireEvent.pointerMove(third);
    expect(third.getAttribute('aria-selected')).toBe('true');
    expect(combobox.getAttribute('aria-activedescendant')).toBe(third.id);
  });
});

describe('SettingsSearch — arrow-key selection', () => {
  it('ArrowDown advances the active option; a new keystroke pins it back to the top match', async () => {
    const { container, getByRole, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    const combobox = getByRole('combobox');

    await fireEvent.input(input, { target: { value: 'cache' } });
    const options = container.querySelectorAll('[data-ega-settings-list-item]');
    expect(options.length).toBeGreaterThan(1);
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[0]?.id);

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[1]?.id);

    await fireEvent.input(input, { target: { value: 'cache s' } });
    const narrowed = container.querySelectorAll('[data-ega-settings-list-item]');
    expect(narrowed.length).toBeGreaterThan(0);
    expect(combobox.getAttribute('aria-activedescendant')).toBe(narrowed[0]?.id);
  });

  it('toggling Modified only pins the active option back to the top match', async () => {
    const { container, getByLabelText, getByRole, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    const combobox = getByRole('combobox');
    await fireEvent.input(input, { target: { value: 'cache' } });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    const options = container.querySelectorAll('[data-ega-settings-list-item]');
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[1]?.id);

    // Nothing is modified at defaults, so the filter empties the list.
    const toggle = getByLabelText('Modified only');
    await fireEvent.click(toggle);
    expect(container.querySelector('[data-ega-settings-list-item]')).toBeNull();
    await tick();
    expect(combobox.getAttribute('aria-activedescendant')).toBeNull();
    await fireEvent.click(toggle);

    const restored = container.querySelectorAll('[data-ega-settings-list-item]');
    expect(restored.length).toBeGreaterThan(1);
    expect(combobox.getAttribute('aria-activedescendant')).toBe(restored[0]?.id);
  });

  it('Modified only re-pins to the top match whether the active row stays or drops out', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      translateTimeoutMs: 123_000,
      imageTranslateTimeoutMs: 123_000,
    };
    const { container, getByLabelText, getByRole, getByPlaceholderText } = render(SettingsSearch, {
      props: { open: true, settings, onClose: () => {}, onJump: () => {} },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    const combobox = getByRole('combobox');
    await fireEvent.input(input, { target: { value: 'timeout' } });
    const ids = (): (string | null)[] =>
      Array.from(container.querySelectorAll('[data-ega-settings-list-item]')).map((el) =>
        el.getAttribute('data-ega-settings-list-item'),
      );
    expect(ids()).toEqual([
      'advanced.imageTranslateTimeoutMs',
      'backends.localBackendTimeoutMs',
      'advanced.translateTimeoutMs',
    ]);
    const active = (): string | null => combobox.getAttribute('aria-activedescendant');
    const toggle = getByLabelText('Modified only');

    // The active row survives the filter but is no longer the top match.
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(active()).toBe('slv-opt-result-advanced.translateTimeoutMs');
    await fireEvent.click(toggle);
    expect(ids()).toEqual(['advanced.imageTranslateTimeoutMs', 'advanced.translateTimeoutMs']);
    await waitFor(() => expect(active()).toBe('slv-opt-result-advanced.imageTranslateTimeoutMs'));

    // The active row drops out.
    await fireEvent.click(toggle);
    await waitFor(() => expect(active()).toBe('slv-opt-result-advanced.imageTranslateTimeoutMs'));
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(active()).toBe('slv-opt-result-backends.localBackendTimeoutMs');
    await fireEvent.click(toggle);
    await waitFor(() => expect(active()).toBe('slv-opt-result-advanced.imageTranslateTimeoutMs'));
    expect(
      container
        .querySelector('[data-ega-settings-list-item="advanced.imageTranslateTimeoutMs"]')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
  });
});

describe('SettingsSearch — Modified-only empty state', () => {
  it('shows the filter-specific message when the query matches but nothing is modified', async () => {
    const { container, getByLabelText, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'temperature' } });
    expect(container.querySelector('[data-ega-settings-list-item]')).not.toBeNull();
    await fireEvent.click(getByLabelText('Modified only'));
    const empty = container.querySelector('.ss-empty');
    expect(empty?.textContent).toContain('No modified settings match');
    expect(empty?.textContent).toContain('Modified only');
  });
});

describe('SettingsSearch — keyboard hint', () => {
  function keysShown(container: HTMLElement): string[] {
    return [...container.querySelectorAll('.ss-keys kbd')].map((k) => k.textContent.trim());
  }

  it('names the list keys under the suggestions and the results, not under an empty search', async () => {
    const { container, getByPlaceholderText } = render(SettingsSearch, {
      props: { open: true, settings: DEFAULT_SETTINGS, onClose: () => {}, onJump: () => {} },
    });
    expect(keysShown(container)).toEqual(['↑↓', 'Enter', 'Esc']);
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'temperature' } });
    expect(keysShown(container)).toEqual(['↑↓', 'Enter', 'Esc']);
    await fireEvent.input(input, { target: { value: 'zzqqxxnothing' } });
    expect(keysShown(container)).toEqual([]);
  });
});
