// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { openModePopover } from './_composer';
import { GENERAL_ORIGIN, saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';
import type { Msg } from '@/shared/messages';
import { openTaskMenu, swapItem } from './_task-menu';

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

/** The swap item in the reply's Re-run as menu; opens the menu when it is closed. */
async function swapButton(container: HTMLElement): Promise<HTMLElement> {
  if (!document.querySelector('[data-ega-swap-item]')) await openTaskMenu(container);
  return swapItem();
}

async function setSourceLang(container: HTMLElement, value: string): Promise<void> {
  await openModePopover(container);
  const picker = container.querySelector<HTMLSelectElement>('#sp-conv-source');
  if (!picker) throw new Error('#sp-conv-source picker not found');
  await fireEvent.change(picker, { target: { value } });
  await tick();
  if (picker.value !== value) throw new Error(`source picker did not take "${value}"`);
}

/** onMount reads settings + varieties asynchronously and rewrites the pickers when it lands. */
async function settleMount(container: HTMLElement): Promise<void> {
  await waitFor(() => {
    if (!container.querySelector('[data-ega-backend-chip]')) throw new Error('mount not settled');
  });
}

function storedPair(): Turn[] {
  return [
    {
      createdAt: 1,
      id: 'u1',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: 'hola',
      dispatch: {
        sourceLang: asLangIdUnsafe('es'),
        targetLang: asLangIdUnsafe('en'),
        stream: true,
      },
    },
    {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      attachedToTurnId: 'u1',
      variants: [{ id: 'a1:v1', status: 'done', content: 'hello' }],
      activeVariantIdx: 0,
    },
  ];
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel — the swap item mirrors what swapVariant can do', () => {
  it('stays disabled after an auto-source send when the picker moves to a variety', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');

    await setSourceLang(container, 'es');

    // The turn went out with sourceLang 'auto', so swapVariant cannot replay it.
    expect((await swapButton(container)).getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('is live on a thread restored from storage, because the turn carries its dispatch', async () => {
    await saveThread(GENERAL_ORIGIN, storedPair());
    const { container } = render(SidePanel);
    await waitFor(() => {
      if (!container.querySelector('[data-ega-task-switch]'))
        throw new Error('thread not restored yet');
    });

    await setSourceLang(container, 'es');

    expect((await swapButton(container)).getAttribute('aria-disabled') === 'true').toBe(false);
  });

  it('stays enabled when the picker moves to auto after a variety-source send', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await setSourceLang(container, 'es');
    await sendAndDrain(container, 'hola');
    expect(startCalls().at(-1)?.['sourceLang']).toBe('es');

    await setSourceLang(container, 'auto');
    expect((await swapButton(container)).getAttribute('aria-disabled') === 'true').toBe(false);

    // The item names the run it starts: the old target becomes the source.
    expect((await swapButton(container)).textContent.trim()).toBe(
      'Swap languages (English → Spanish)',
    );
    const before = startCalls().length;
    await fireEvent.click(await swapButton(container));
    await tick();

    expect(startCalls().length).toBe(before + 1);
    const last = startCalls().at(-1);
    expect(last?.['sourceLang']).toBe('en');
    expect(last?.['targetLang']).toBe('es');
  });
});
