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

// A second 'e' while editing must not reset the draft to the original turn text.
describe('SidePanel — edit-last no-op guard', () => {
  it('second e-press is a no-op while an edit is pending', async () => {
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockResolvedValue({ ok: true });

    const { container } = render(SidePanel);
    await tick();

    const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!textarea) throw new Error('source textarea not found');

    // Send a turn
    await fireEvent.input(textarea, { target: { value: 'original' } });
    await tick();
    const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
    if (!sendBtn) throw new Error('send btn not found');
    await fireEvent.click(sendBtn);
    await tick();

    // Capture requestId from the translate:start sendMessage call
    const allCalls = sendMessage.mock.calls as Array<[unknown]>;
    const startCall = allCalls.find(([msg]) => (msg as Msg | null)?.kind === 'translate:start');
    const requestId = (startCall?.[0] as { requestId?: string } | null)?.requestId;
    if (!requestId) throw new Error('requestId not found in sendMessage calls');

    // Drain the inflight by emitting a done chunk via the onMessage emitter
    (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
      {
        kind: 'translate:chunk',
        chunk: { type: 'done', requestId, confidence: 0.9 },
      } satisfies Msg,
      { id: chrome.runtime.id },
      () => {},
    );
    await tick();
    await tick();

    // First 'e' press — should pull the user turn back
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();

    // textarea should now contain 'original'
    expect(textarea.value).toBe('original');

    // User edits
    await fireEvent.input(textarea, { target: { value: 'user edited' } });
    await tick();

    // Second 'e' press — guard fires (an edit is pending), no-op
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();

    expect(textarea.value).toBe('user edited');
  });
});
