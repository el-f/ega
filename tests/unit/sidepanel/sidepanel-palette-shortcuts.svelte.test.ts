// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => vi.clearAllMocks());

async function openPalette(): Promise<void> {
  await fireEvent.keyDown(window, { key: 'k', ctrlKey: true, target: document.body });
  for (let i = 0; i < 6; i++) await tick();
}

describe('the shortcuts panel is reachable from inside the palette', () => {
  it('a command opens it, because the ? key cannot fire while the palette holds focus', async () => {
    const { container } = render(SidePanel);
    await tick();
    await openPalette();

    const item = Array.from(container.querySelectorAll<HTMLElement>('.ega-palette-item')).find(
      (el) => el.textContent.trim() === 'Keyboard shortcuts',
    );
    if (!item) throw new Error('no Keyboard shortcuts command in the palette');

    await fireEvent.click(item);
    await tick();
    expect(document.querySelector('[data-ega-shortcut-xref]')).not.toBeNull();
  });

  it('typing ? into the palette filter never opens it', async () => {
    const { container } = render(SidePanel);
    await tick();
    await openPalette();

    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]');
    if (!input) throw new Error('palette input not found');
    await fireEvent.keyDown(input, { key: '?', bubbles: true });
    await tick();

    expect(document.querySelector('[data-ega-shortcut-xref]')).toBeNull();
  });

  it('offers the header actions the header itself offers, and no more', async () => {
    const { container } = render(SidePanel);
    await tick();
    await openPalette();

    const labels = Array.from(container.querySelectorAll<HTMLElement>('.ega-palette-item')).map(
      (el) => el.textContent.trim(),
    );
    expect(labels).toContain('Show bookmarked only');
    // Empty thread: New, Search, export and cancel-all are not in the header, so they stay out.
    expect(labels).not.toContain('Search conversation');
    expect(labels).not.toContain('New conversation');
    expect(labels).not.toContain('Copy conversation as Markdown');
    expect(labels).not.toContain('Cancel all requests');
  });
});
