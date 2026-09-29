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

async function sendAndDrain(container: HTMLElement, text: string): Promise<void> {
  const sendMessage = chrome.runtime.sendMessage as Mock;
  const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!textarea) throw new Error('sp-text not found');
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
  if (!requestId) throw new Error('requestId not found');
  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    { kind: 'translate:chunk', chunk: { type: 'done', requestId, confidence: 0.9 } } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await tick();
  await tick();
}

describe('SidePanel — editing banner (edit-last)', () => {
  it('no banner at rest', async () => {
    const { container } = render(SidePanel);
    await tick();
    expect(container.querySelector('[data-ega-editing-banner]')).toBeNull();
  });

  it("pressing 'e' shows the banner; Esc cancels and clears the composer", async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');

    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();

    const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
    expect(textarea?.value).toBe('original');
    expect(container.querySelector('[data-ega-editing-banner]')).not.toBeNull();
    // Sending keeps the old answer as a variant, so the banner must not promise a replacement.
    const bannerText = container.querySelector('.sp-editing-text')?.textContent ?? '';
    expect(bannerText).not.toMatch(/replaces/);
    expect(bannerText).toMatch(/variant/);

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();

    expect(container.querySelector('[data-ega-editing-banner]')).toBeNull();
    expect(textarea?.value).toBe('');
    // The exchange is untouched — cancel does not drop anything.
    expect(container.querySelectorAll('.ega-user-turn')).toHaveLength(1);
  });

  it('the banner X button cancels the edit', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');

    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();
    const cancelBtn = container.querySelector<HTMLButtonElement>('[data-ega-editing-cancel]');
    if (!cancelBtn) throw new Error('banner cancel button not found');
    await fireEvent.click(cancelBtn);
    await tick();

    expect(container.querySelector('[data-ega-editing-banner]')).toBeNull();
  });

  it('sending while editing hides the banner and replaces the exchange', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');

    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();
    expect(container.querySelector('[data-ega-editing-banner]')).not.toBeNull();

    await sendAndDrain(container, 'edited');
    expect(container.querySelector('[data-ega-editing-banner]')).toBeNull();
    const userTurns = [...container.querySelectorAll('.ega-user-turn')];
    expect(userTurns).toHaveLength(1);
    expect(userTurns[0]?.textContent).toContain('edited');
  });
});
