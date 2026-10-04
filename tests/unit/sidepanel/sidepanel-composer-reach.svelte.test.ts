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

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await tick();
}

describe('reaching the message box without Tabbing the whole thread', () => {
  it('the skip link is the first element and moves focus to the composer', async () => {
    const { container } = render(SidePanel);
    await settle();
    const link = container.querySelector<HTMLElement>('[data-ega-skip-to-composer]');
    if (!link) throw new Error('skip link not found');
    // First in the DOM, so it is the first tab stop.
    const focusables = container.querySelectorAll('a[href], button, textarea, input, select');
    expect(focusables[0]).toBe(link);

    await fireEvent.click(link);
    await tick();
    expect(document.activeElement?.id).toBe('sp-text');
  });

  it('c jumps to the composer from the thread, and never from inside a text box', async () => {
    const { container } = render(SidePanel);
    await settle();
    await fireEvent.keyDown(window, { key: 'c', target: document.body });
    await tick();
    expect(document.activeElement?.id).toBe('sp-text');

    const ta = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!ta) throw new Error('composer not found');
    ta.blur();
    await fireEvent.keyDown(ta, { key: 'c' });
    await tick();
    expect(document.activeElement?.id).not.toBe('sp-text');
  });

  it('leaves Ctrl+C alone', async () => {
    render(SidePanel);
    await settle();
    const evt = await fireEvent.keyDown(window, {
      key: 'c',
      ctrlKey: true,
      target: document.body,
    });
    expect(evt).toBe(true);
    expect(document.activeElement?.id).not.toBe('sp-text');
  });
});
