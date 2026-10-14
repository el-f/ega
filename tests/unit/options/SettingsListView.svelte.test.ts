// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SettingsListView from '@/options/components/SettingsListView.svelte';
import type { SettingsListItem } from '@/options/components/SettingsListView.types';

function item(overrides: Partial<SettingsListItem> = {}): SettingsListItem {
  return {
    id: 'a',
    label: 'Cache enabled',
    description: 'Stops caching when off',
    tab: 'advanced',
    tabLabel: 'Adv',
    ...overrides,
  };
}

describe('SettingsListView', () => {
  it('renders one row carrying the settings-list hook', () => {
    const { container } = render(SettingsListView, {
      props: { item: item(), optionProps: {} },
    });
    const rows = container.querySelectorAll('[data-ega-settings-list-item]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('data-ega-settings-list-item')).toBe('a');
  });

  it('puts the option props from Command on the row', () => {
    const { container } = render(SettingsListView, {
      props: {
        item: item(),
        optionProps: {
          id: 'slv-opt-result-a',
          role: 'option',
          'aria-selected': 'true',
          'data-selected': '',
        },
      },
    });
    const row = container.querySelector('[data-ega-settings-list-item="a"]');
    expect(row?.getAttribute('id')).toBe('slv-opt-result-a');
    expect(row?.getAttribute('role')).toBe('option');
    expect(row?.getAttribute('aria-selected')).toBe('true');
    expect(row?.hasAttribute('data-selected')).toBe(true);
    expect(row?.classList.contains('slv-item')).toBe(true);
  });

  it('clicking the row runs the click handler from the option props', async () => {
    const onclick = vi.fn();
    const { container } = render(SettingsListView, {
      props: { item: item(), optionProps: { onclick } },
    });
    const row = container.querySelector('[data-ega-settings-list-item="a"]') as HTMLElement;
    await fireEvent.click(row);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('shows modified badge only when modified=true', () => {
    const on = render(SettingsListView, {
      props: { item: item({ modified: true }), optionProps: {} },
    });
    expect(on.container.querySelector('.slv-modified-badge')).not.toBeNull();
    const off = render(SettingsListView, {
      props: { item: item({ id: 'b', modified: false }), optionProps: {} },
    });
    expect(off.container.querySelector('.slv-modified-badge')).toBeNull();
  });

  it('renders <mark> around highlight query slice in label', () => {
    const { container } = render(SettingsListView, {
      props: { item: item({ highlightQuery: 'cache' }), optionProps: {} },
    });
    const mark = container.querySelector('[data-ega-settings-list-item="a"] mark');
    expect((mark?.textContent ?? '').toLowerCase()).toBe('cache');
  });

  it('renders no tab badge when item.tabLabel absent', () => {
    const { container } = render(SettingsListView, {
      props: {
        item: { id: 'x', label: 'No badge', description: '', tab: 'advanced' },
        optionProps: {},
      },
    });
    expect(container.querySelector('.slv-tab-badge')).toBeNull();
  });
});
