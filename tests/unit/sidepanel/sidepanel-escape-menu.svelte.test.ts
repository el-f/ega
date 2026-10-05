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
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.clearAllMocks();
});

/** Sends and leaves the reply streaming: no done chunk arrives. */
async function sendAndLeaveOpen(container: HTMLElement): Promise<void> {
  const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!textarea) throw new Error('sp-text not found');
  await fireEvent.input(textarea, { target: { value: 'hola' } });
  await tick();
  const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
  if (!sendBtn) throw new Error('send button not found');
  await fireEvent.click(sendBtn);
  await tick();
  textarea.blur();
}

function cancelsSent(): number {
  const calls = (chrome.runtime.sendMessage as Mock).mock.calls as Array<[Msg | null]>;
  return calls.filter(([msg]) => msg?.kind === 'translate:cancel').length;
}

function escapeOnWindow(handled: boolean): void {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  if (handled) e.preventDefault();
  window.dispatchEvent(e);
}

describe('SidePanel — Escape that closed a menu does not cancel the reply', () => {
  it('keeps the streaming reply when a menu already handled the Escape', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndLeaveOpen(container);
    escapeOnWindow(true);
    await tick();
    expect(cancelsSent()).toBe(0);
  });

  it('a plain Escape still cancels the streaming reply', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndLeaveOpen(container);
    escapeOnWindow(false);
    await tick();
    expect(cancelsSent()).toBe(1);
  });
});
