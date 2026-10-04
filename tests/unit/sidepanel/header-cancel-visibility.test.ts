// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { openHeaderMenu } from './_header-menu';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('SidePanel header — Cancel all requests', () => {
  it('has no header stop button, and the More menu offers no cancel while idle', async () => {
    const { container } = render(SidePanel);
    await tick();
    expect(container.querySelector('.sp-header [data-ega-cancel-all]')).toBeNull();
    await openHeaderMenu(container);
    expect(document.querySelector('[data-ega-cancel-all]')).toBeNull();
  });

  it('offers Cancel all requests in the More menu while a turn is in flight, and it sends the global cancel', async () => {
    const { container } = render(SidePanel);
    await tick();

    const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!textarea) throw new Error('source textarea not mounted');
    await fireEvent.input(textarea, { target: { value: 'hello' } });
    await tick();
    const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
    if (!sendBtn) throw new Error('send button not mounted');
    sendBtn.click();
    // send() sets inflightId before awaiting the dispatch, so the composer flips to Stop.
    await waitFor(() => {
      if (sendBtn.getAttribute('aria-label') !== 'Stop') throw new Error('not in flight yet');
    });
    // The composer's Stop is the one stop control in the header row's place.
    expect(container.querySelector('.sp-header [data-ega-cancel-all]')).toBeNull();

    await openHeaderMenu(container);
    const item = document.querySelector<HTMLElement>('[data-ega-cancel-all]');
    if (!item) throw new Error('cancel-all item missing while in flight');
    expect(item.textContent).toContain('Cancel all requests');
    await fireEvent.click(item);
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'translate:cancel-all' }),
    );
  });
});
