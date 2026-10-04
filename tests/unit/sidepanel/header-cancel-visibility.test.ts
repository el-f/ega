// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel header — Cancel-all gating', () => {
  it('keeps the cancel-all slot in the layout but hidden when idle', async () => {
    const { container } = render(SidePanel);
    await tick();
    // Reserved slot: hidden via visibility so the header never reflows when it appears.
    const cancel = container.querySelector('[data-ega-cancel-all]');
    expect(cancel).not.toBeNull();
    const slot = cancel?.closest('.sp-cancel-slot');
    expect(slot).not.toBeNull();
    expect(slot?.classList.contains('visible')).toBe(false);
  });

  it('reveals the cancel-all button while a turn is in-flight', async () => {
    // send() sets inflightId before awaiting the dispatch, so one round trip flips the gate.
    const { container } = render(SidePanel);
    await tick();

    const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!textarea) throw new Error('source textarea not mounted');
    await fireEvent.input(textarea, { target: { value: 'hello' } });
    await tick();

    const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
    if (!sendBtn) throw new Error('send button not mounted');
    sendBtn.click();
    await tick();

    await waitFor(() => {
      const slot = container.querySelector('[data-ega-cancel-all]')?.closest('.sp-cancel-slot');
      if (!slot?.classList.contains('visible')) throw new Error('cancel-all not yet visible');
      expect(slot.classList.contains('visible')).toBe(true);
    });
  });
});
