// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import type { Msg } from '@/shared/messages';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn().mockResolvedValue(true),
}));

async function sendAndDrain(container: HTMLElement, text: string): Promise<string> {
  const sendMessage = chrome.runtime.sendMessage as Mock;
  const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!textarea) throw new Error('sp-text textarea not found');
  await fireEvent.input(textarea, { target: { value: text } });
  await tick();
  const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
  if (!sendBtn) throw new Error('send button not found');
  await fireEvent.click(sendBtn);
  await tick();

  const allCalls = sendMessage.mock.calls as Array<[unknown]>;
  const startCall = [...allCalls]
    .reverse()
    .find(([msg]) => (msg as Msg | null)?.kind === 'translate:start');
  const requestId = (startCall?.[0] as { requestId?: string } | null)?.requestId;
  if (!requestId) throw new Error('requestId not found in sendMessage calls');

  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    { kind: 'translate:chunk', chunk: { type: 'done', requestId, confidence: 0.9 } } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await tick();
  await tick();
  return requestId;
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel — onEditTurn mid-history handler', () => {
  it('edit on first user turn (mid-history): prefills composer + removes later exchange', async () => {
    const { container } = render(SidePanel);
    await tick();

    // Build two exchanges
    await sendAndDrain(container, 'first message');
    await sendAndDrain(container, 'second message');

    // Verify two user turns are rendered
    const userTurns = container.querySelectorAll('.ega-user-turn');
    expect(userTurns.length).toBeGreaterThanOrEqual(2);

    // Click edit on the FIRST user turn (mid-history)
    const firstUserTurn = userTurns[0];
    const editBtn = firstUserTurn?.querySelector<HTMLButtonElement>('[data-ega-edit]');
    if (!editBtn) throw new Error('[data-ega-edit] not found on first user turn');

    await fireEvent.click(editBtn);
    await tick();
    await tick(); // confirmDialog is async

    const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!textarea) throw new Error('sp-text not found');

    // Composer should be prefilled with the first turn's text
    expect(textarea.value).toBe('first message');

    // Second exchange should be gone — only the first user turn visible
    const remainingUserTurns = container.querySelectorAll('.ega-user-turn');
    expect(remainingUserTurns.length).toBe(0);
  });
});
