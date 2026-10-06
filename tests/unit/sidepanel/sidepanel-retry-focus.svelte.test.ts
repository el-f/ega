// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import type { Msg } from '@/shared/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

function lastRequestId(): string {
  const id = (sendMessage.mock.calls as Array<[Record<string, unknown>]>)
    .map(([m]) => m)
    .filter((m) => m['kind'] === 'translate:start')
    .at(-1)?.['requestId'];
  if (typeof id !== 'string') throw new Error('no translate:start sent');
  return id;
}

function emit(msg: Msg): void {
  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    msg,
    { id: chrome.runtime.id },
    () => {},
  );
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel — Retry on a failed first answer', () => {
  it('moves focus to the new pending reply instead of dropping it to the page', async () => {
    const { container } = render(SidePanel);
    await waitFor(() => {
      if (!container.querySelector('[data-ega-backend-chip]')) throw new Error('mount not settled');
    });
    const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!textarea) throw new Error('sp-text missing');
    await fireEvent.input(textarea, { target: { value: 'hola' } });
    await tick();
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.ega-send') as HTMLElement);
    await tick();
    emit({
      kind: 'translate:chunk',
      chunk: { type: 'error', requestId: lastRequestId(), code: 'NETWORK', message: 'offline' },
    } as Msg);
    const retry = await waitFor(() => {
      const btn = container.querySelector<HTMLButtonElement>('.ega-retry-btn');
      if (!btn) throw new Error('Retry not shown');
      return btn;
    });
    const failed = retry.closest('article');
    retry.focus();

    await fireEvent.click(retry);

    await waitFor(() => {
      const card = document.activeElement;
      expect(card?.tagName).toBe('ARTICLE');
      expect(card).not.toBe(failed);
      expect(card?.isConnected).toBe(true);
    });
  });
});
