// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { openModePopover } from './_composer';
import type { Msg } from '@/shared/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

function startCalls(): Array<Record<string, unknown>> {
  return (sendMessage.mock.calls as Array<[unknown]>)
    .map(([m]) => m as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
}

async function sendAndDrain(container: HTMLElement, text: string): Promise<void> {
  const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!textarea) throw new Error('sp-text textarea not found');
  await fireEvent.input(textarea, { target: { value: text } });
  await tick();
  const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
  if (!sendBtn) throw new Error('send button not found');
  await fireEvent.click(sendBtn);
  await tick();
  const requestId = startCalls().at(-1)?.['requestId'] as string | undefined;
  if (!requestId) throw new Error('no translate:start requestId found');
  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    { kind: 'translate:chunk', chunk: { type: 'done', requestId, confidence: 0.9 } } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await tick();
  await tick();
}

async function pickTarget(container: HTMLElement, value: string): Promise<void> {
  await openModePopover(container);
  const picker = container.querySelector<HTMLSelectElement>('#sp-conv-target');
  if (!picker) throw new Error('#sp-conv-target picker not found');
  await fireEvent.change(picker, { target: { value } });
  await tick();
  if (picker.value !== value) throw new Error(`target picker did not take "${value}"`);
}

/** onMount reads settings + varieties asynchronously and rewrites the pickers when it lands. */
async function settleMount(container: HTMLElement): Promise<void> {
  await openModePopover(container);
  await waitFor(() => {
    if (!container.querySelector('#sp-conv-source optgroup')) throw new Error('mount not settled');
  });
  await fireEvent.keyDown(document.querySelector('[data-ega-mode-popover]') as HTMLElement, {
    key: 'Escape',
  });
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// D-a: the composer target applies to the next send only; a reply re-runs in another language from its own menu.
describe('SidePanel — the target picker never re-answers', () => {
  it('a pick after an answer sends nothing, and the next send uses it', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    const before = startCalls().length;

    vi.useFakeTimers();
    await pickTarget(container, 'fr');
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    expect(startCalls().length).toBe(before);

    await sendAndDrain(container, 'adios');
    expect(startCalls().at(-1)?.['targetLang']).toBe('fr');
  });
});
