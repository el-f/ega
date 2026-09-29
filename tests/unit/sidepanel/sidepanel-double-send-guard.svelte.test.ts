// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import type { Msg } from '@/shared/messages';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
});
afterEach(() => {
  vi.clearAllMocks();
});

// Two sends before sourceText clears must dispatch once, or the first turn never gets its terminal chunk.
describe('SidePanel — double-send guard', () => {
  it('rapid double send dispatches exactly one translate:start', async () => {
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockResolvedValue({ ok: true });

    const { container } = render(SidePanel);
    await tick();

    const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!textarea) throw new Error('source textarea not found');
    await fireEvent.input(textarea, { target: { value: 'hola' } });
    await tick();

    const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
    if (!sendBtn) throw new Error('send btn not found');
    // Both clicks land before any await in sendTurn resolves — same window
    // a fast double Cmd+Enter hits.
    const first = fireEvent.click(sendBtn);
    const second = fireEvent.click(sendBtn);
    await Promise.all([first, second]);
    await tick();
    await tick();

    const starts = (sendMessage.mock.calls as Array<[unknown]>).filter(
      ([msg]) => (msg as Msg | null)?.kind === 'translate:start',
    );
    expect(starts).toHaveLength(1);
  });
});
