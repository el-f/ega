// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';
import type { Msg } from '@/shared/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;
const tabsQuery = chrome.tabs.query as unknown as Mock;

/** A finished exchange another site's thread holds — replayable, so a stray re-translate would show up as a dispatch. */
function otherSitePair(): Turn[] {
  return [
    {
      createdAt: 1,
      id: 'b-user',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: 'beta',
      dispatch: {
        sourceLang: asLangIdUnsafe('es'),
        targetLang: asLangIdUnsafe('en'),
        stream: true,
      },
    },
    {
      createdAt: 1,
      id: 'b-assistant',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'beta reply',
      attachedToTurnId: 'b-user',
      variants: [{ id: 'b-assistant:v1', status: 'done', content: 'beta reply' }],
      activeVariantIdx: 0,
    },
  ];
}

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
  const picker = container.querySelector<HTMLSelectElement>('#sp-conv-target');
  if (!picker) throw new Error('#sp-conv-target picker not found');
  await fireEvent.change(picker, { target: { value } });
  await tick();
  if (picker.value !== value) throw new Error(`target picker did not take "${value}"`);
}

/** onMount reads settings + varieties asynchronously and rewrites the pickers when it lands. */
async function settleMount(container: HTMLElement): Promise<void> {
  await waitFor(() => {
    if (!container.querySelector('#sp-conv-source optgroup')) throw new Error('mount not settled');
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

describe('SidePanel — target picker re-translates the last answer', () => {
  it('dispatches once, in the last language picked, after the debounce settles', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    const before = startCalls().length;

    vi.useFakeTimers();
    await pickTarget(container, 'fr');
    await pickTarget(container, 'de');
    await vi.advanceTimersByTimeAsync(400);
    expect(startCalls().length).toBe(before);
    await vi.advanceTimersByTimeAsync(200);

    expect(startCalls().length).toBe(before + 1);
    expect(startCalls().at(-1)?.['targetLang']).toBe('de');
    expect(container.querySelector('.ega-variant-counter')?.textContent).toContain('2/2');
  });

  it('does nothing before the first send', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);

    vi.useFakeTimers();
    await pickTarget(container, 'fr');
    await vi.advanceTimersByTimeAsync(700);

    expect(startCalls().length).toBe(0);
  });

  it('drops the pending re-translate when the panel follows the tab to another site', async () => {
    await saveThread('https://b.test', otherSitePair());
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    const before = startCalls().length;

    vi.useFakeTimers();
    await pickTarget(container, 'fr');
    tabsQuery.mockResolvedValue([{ id: 2, url: 'https://b.test/other' }]);
    (chrome.tabs.onActivated as unknown as { emit: (i: unknown) => void }).emit({
      tabId: 2,
      windowId: 1,
    });
    await vi.advanceTimersByTimeAsync(1500);

    expect(container.textContent).toContain('beta reply');
    expect(startCalls().length).toBe(before);
  });

  it('drops the pending re-translate when the panel unmounts', async () => {
    const { container, unmount } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    const before = startCalls().length;

    vi.useFakeTimers();
    await pickTarget(container, 'fr');
    unmount();
    await vi.advanceTimersByTimeAsync(700);

    expect(startCalls().length).toBe(before);
  });
});
