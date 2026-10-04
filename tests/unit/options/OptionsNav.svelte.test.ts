// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import OptionsNav from '@/options/OptionsNav.svelte';
import Monitor from '@lucide/svelte/icons/monitor';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import Wrench from '@lucide/svelte/icons/wrench';

// The icon only satisfies NavItem's required prop; assertions target the button's accessible name, not the glyph.
const items = [
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'defaults', label: 'Defaults', icon: SlidersHorizontal },
  { id: 'advanced', label: 'Advanced', icon: Wrench },
];

describe('OptionsNav', () => {
  it('renders a tab per item', () => {
    const { getAllByRole } = render(OptionsNav, {
      props: { items, active: 'display', onSelect: vi.fn() },
    });
    const tabs = getAllByRole('tab');
    expect(tabs.length).toBe(items.length);
  });

  it('marks active item with aria-selected="true"', () => {
    const { getByRole } = render(OptionsNav, {
      props: { items, active: 'defaults', onSelect: vi.fn() },
    });
    const activeBtn = getByRole('tab', { name: 'Defaults' });
    expect(activeBtn.getAttribute('aria-selected')).toBe('true');
  });

  it('click on an item fires onSelect', async () => {
    const onSelect = vi.fn();
    const { getByRole } = render(OptionsNav, {
      props: { items, active: 'display', onSelect },
    });
    await fireEvent.click(getByRole('tab', { name: 'Advanced' }));
    expect(onSelect).toHaveBeenCalledWith('advanced', 'pointer');
  });

  it('arrow-down moves selection to the next tab (roving tabindex)', async () => {
    const onSelect = vi.fn();
    const { getByRole } = render(OptionsNav, {
      props: { items, active: 'display', onSelect },
    });
    await fireEvent.keyDown(getByRole('tab', { name: 'Display' }), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith('defaults', 'keyboard');
  });

  it('does not emit aria-controls (manual-activation tablist — no dangling tabpanel ids)', () => {
    const { getAllByRole } = render(OptionsNav, {
      props: { items, active: 'display', onSelect: vi.fn() },
    });
    const tabs = getAllByRole('tab');
    for (const t of tabs) {
      expect(t.hasAttribute('aria-controls')).toBe(false);
    }
  });

  it('focuses the freshly-selected tab after ArrowDown (roving tabindex)', async () => {
    const onSelect = vi.fn();
    const { getByRole, container } = render(OptionsNav, {
      props: { items, active: 'display', onSelect },
    });
    const first = getByRole('tab', { name: 'Display' }) as HTMLButtonElement;
    first.focus();
    expect(document.activeElement).toBe(first);
    await fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith('defaults', 'keyboard');
    // queueMicrotask flush: focus moves to #tab-defaults after render.
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const next = container.querySelector<HTMLButtonElement>('#tab-defaults');
    expect(document.activeElement).toBe(next);
  });

  it('stamps aria-label on every tab button (icon-only mode safety net)', () => {
    // Below 880px the label is display:none, so aria-label keeps the accessible name.
    const { getAllByRole } = render(OptionsNav, {
      props: { items, active: 'display', onSelect: vi.fn() },
    });
    const tabs = getAllByRole('tab');
    expect(tabs.length).toBe(items.length);
    for (const [i, t] of tabs.entries()) {
      expect(t.getAttribute('aria-label')).toBe(items[i]?.label);
    }
  });
});
