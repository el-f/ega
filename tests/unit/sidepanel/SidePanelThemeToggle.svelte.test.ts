// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { getSettings } from '@/shared/storage';
import { openHeaderMenu, pickHeaderMenuItem } from './_header-menu';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel — theme in the More menu', () => {
  it('lists System, Light and Dark as radio items with the current theme checked', async () => {
    const { container } = render(SidePanel);
    await tick();
    expect(container.querySelector('.sp-header [data-ega-theme-toggle]')).toBeNull();
    const current = (await getSettings()).theme;
    await openHeaderMenu(container);
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-ega-theme]'));
    expect(items.map((i) => i.dataset['egaTheme'])).toEqual(['system', 'light', 'dark']);
    for (const item of items) {
      expect(item.getAttribute('role')).toBe('menuitemradio');
      expect(item.getAttribute('aria-checked')).toBe(String(item.dataset['egaTheme'] === current));
    }
  });

  it('picking a theme applies and saves it', async () => {
    const { container } = render(SidePanel);
    await tick();
    const pick = (await getSettings()).theme === 'dark' ? 'light' : 'dark';
    await pickHeaderMenuItem(container, `[data-ega-theme="${pick}"]`);
    await waitFor(async () => expect((await getSettings()).theme).toBe(pick));
    expect(document.documentElement.dataset['theme']).toBe(pick);
  });
});
