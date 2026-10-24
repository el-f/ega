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
    const failed = await failedReply(container);
    const retry = failed.querySelector<HTMLButtonElement>('[data-ega-retry]') as HTMLElement;
    retry.focus();

    await fireEvent.click(retry);
    await settled();

    expectNewReplyFocused(failed);
  });

  it('`r` on the failed reply keeps focus on the new pending reply', async () => {
    const { container } = render(SidePanel);
    const failed = await failedReply(container);
    failed.focus();

    await fireEvent.keyDown(failed, { key: 'r' });
    await settled();

    expectNewReplyFocused(failed);
  });
});

/** Mounts, sends 'hola' and fails it; returns the failed reply's article. */
async function failedReply(container: HTMLElement): Promise<HTMLElement> {
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
  return await waitFor(() => {
    const el = container.querySelector<HTMLElement>('[data-ega-retry]')?.closest('article');
    if (!el) throw new Error('Retry not shown');
    return el;
  });
}

/** Past the panel's deferred focus moves (a tick, then a timer). */
async function settled(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function expectNewReplyFocused(failed: Element | null): void {
  const card = document.activeElement;
  expect(card?.hasAttribute('data-ega-reply')).toBe(true);
  expect(card?.getAttribute('data-turn-id')).not.toBe(failed?.getAttribute('data-turn-id'));
  expect(card?.isConnected).toBe(true);
}
