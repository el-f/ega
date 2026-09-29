// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { openHeaderMenu, pickHeaderMenuItem } from './_header-menu';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel header — retry budget popover', () => {
  it('retry slider stays out of the page until its menu item is picked', async () => {
    const { container } = render(SidePanel);
    await tick();
    expect(document.querySelector('[data-ega-retry-budget]')).toBeNull();
    await openHeaderMenu(container);
    const item = document.querySelector('[data-ega-retry-budget-trigger]');
    expect(item?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(item?.textContent).toMatch(/Fallback backends: 1/);
  });

  it('picking the menu item opens a popover with the range slider', async () => {
    const { container } = render(SidePanel);
    await tick();
    await pickHeaderMenuItem(container, '[data-ega-retry-budget-trigger]');
    await waitFor(() => {
      const slider = document.body.querySelector<HTMLInputElement>('[data-ega-retry-budget]');
      if (!slider) throw new Error('retry slider not yet rendered');
      expect(slider.tagName).toBe('INPUT');
      expect(slider.type).toBe('range');
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('3');
    });
  });

  it('releasing the slider commits the new fallback budget via settings-bus', async () => {
    // The chrome mock does not persist, so assert the settings:update message instead.
    const sendMessage = vi.spyOn(chrome.runtime, 'sendMessage');
    const { container } = render(SidePanel);
    await tick();
    await pickHeaderMenuItem(container, '[data-ega-retry-budget-trigger]');
    const slider = await waitFor(() => {
      const s = document.body.querySelector<HTMLInputElement>('[data-ega-retry-budget]');
      if (!s) throw new Error('retry slider not yet rendered');
      return s;
    });
    sendMessage.mockClear();
    slider.value = '2';
    await fireEvent.change(slider);
    await waitFor(() => {
      const patchCall = sendMessage.mock.calls.find((args) => {
        const env = args[0] as unknown;
        if (env === null || typeof env !== 'object') return false;
        return (env as Record<string, unknown>)['kind'] === 'settings:update';
      });
      if (!patchCall) throw new Error('settings:update not dispatched');
      const env = patchCall[0] as { patch?: { advanced?: { retryCount?: number } } };
      expect(env.patch?.advanced?.retryCount).toBe(2);
    });
    sendMessage.mockRestore();
  });
});
