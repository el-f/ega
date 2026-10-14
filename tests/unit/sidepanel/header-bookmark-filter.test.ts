// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { bookmarkFilterOn, openHeaderMenu, pickHeaderMenuItem } from './_header-menu';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel header — bookmark filter', () => {
  it('lives in the More menu as an unchecked checkbox item, not in the header row', async () => {
    const { container } = render(SidePanel);
    await tick();
    expect(container.querySelector('.sp-header [data-ega-bookmark-filter]')).toBeNull();
    await openHeaderMenu(container);
    const item = document.querySelector('[data-ega-bookmark-filter]');
    expect(item?.getAttribute('role')).toBe('menuitemcheckbox');
    expect(item?.getAttribute('aria-checked')).toBe('false');
  });

  it('turns on from the menu and off again from the menu', async () => {
    const { container } = render(SidePanel);
    await tick();
    await pickHeaderMenuItem(container, '[data-ega-bookmark-filter]');
    expect(await bookmarkFilterOn(container)).toBe(true);
    await pickHeaderMenuItem(container, '[data-ega-bookmark-filter]');
    expect(await bookmarkFilterOn(container)).toBe(false);
  });

  it('shows the empty-bookmark message when the filter is on and nothing is bookmarked', async () => {
    const { container } = render(SidePanel);
    await tick();
    await pickHeaderMenuItem(container, '[data-ega-bookmark-filter]');
    expect(container.textContent).toContain('No bookmarked');
  });

  it('offers one way back when nothing is bookmarked: the empty state, not a second bar button', async () => {
    const { container, getByRole } = render(SidePanel);
    await tick();
    await pickHeaderMenuItem(container, '[data-ega-bookmark-filter]');
    expect(container.querySelector('[data-ega-bookmark-clear]')).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Show all messages' }));
    await tick();
    expect(container.textContent).not.toContain('No bookmarked');
    expect(await bookmarkFilterOn(container)).toBe(false);
  });
});
