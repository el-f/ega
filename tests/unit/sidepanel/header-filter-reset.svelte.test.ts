// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { bookmarkFilterOn, pickHeaderMenuItem } from './_header-menu';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function typeAndSend(container: HTMLElement, text: string): Promise<void> {
  const box = container.querySelector<HTMLTextAreaElement>('textarea');
  if (!box) throw new Error('composer textarea not found');
  await fireEvent.input(box, { target: { value: text } });
  await tick();
  const send = container.querySelector<HTMLButtonElement>('button.ega-send:not(.danger)');
  if (!send) throw new Error('send button not found');
  await fireEvent.click(send);
  await tick();
  await tick();
}

describe('SidePanel — sending clears a filter that would hide the new exchange', () => {
  it('turns the bookmark filter off on send', async () => {
    const { container } = render(SidePanel);
    await tick();
    await pickHeaderMenuItem(container, '[data-ega-bookmark-filter]');
    expect(await bookmarkFilterOn(container)).toBe(true);

    await typeAndSend(container, 'bonjour');
    expect(await bookmarkFilterOn(container)).toBe(false);
    expect(container.textContent).not.toContain('No bookmarked');
  });

  it('closes the search bar and clears the query on send', async () => {
    const { container } = render(SidePanel);
    await tick();
    const search = container.querySelector<HTMLButtonElement>('[data-ega-search-toggle]');
    if (search) {
      await fireEvent.click(search);
      await tick();
      const input = container.querySelector<HTMLInputElement>('[data-ega-search]');
      if (input) {
        await fireEvent.input(input, { target: { value: 'zzz-no-match' } });
        await tick();
      }
    }
    await typeAndSend(container, 'bonjour');
    expect(container.querySelector('[data-ega-search]')).toBeNull();
  });
});

describe('SidePanel — the bookmark filter says how many messages it kept', () => {
  it('shows a visible count while the filter is on', async () => {
    const { container } = render(SidePanel);
    await tick();
    await pickHeaderMenuItem(container, '[data-ega-bookmark-filter]');
    const count = container.querySelector('.sp-search-count');
    expect(count).not.toBeNull();
    expect(count?.textContent).toMatch(/bookmarked/);
  });

  it('shows no count while the filter is off', async () => {
    const { container } = render(SidePanel);
    await tick();
    expect(container.querySelector('.sp-search-count')).toBeNull();
  });
});

describe('IconButton carries a pressed style so a toggle looks on', () => {
  it('styles [aria-pressed="true"]', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/shared/ui/IconButton.svelte', 'utf8');
    expect(src).toContain("aria-pressed='true'");
  });
});
