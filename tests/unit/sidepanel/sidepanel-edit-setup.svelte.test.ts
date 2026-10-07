// @vitest-environment jsdom
// An edit hides the mode chip, so it must go out with the setup its message was sent with, not the chip's.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import type { Msg } from '@/shared/messages';
import { openModePopover } from './_composer';

const sendMessage = chrome.runtime.sendMessage as Mock;

interface Start {
  kind: string;
  requestId: string;
  text: string;
  targetLang?: string;
  options: { task?: string };
}

function starts(): Start[] {
  return (sendMessage.mock.calls as Array<[Start]>)
    .map(([m]) => m)
    .filter((m) => m.kind === 'translate:start');
}

function composer(container: HTMLElement): HTMLTextAreaElement {
  const el = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!el) throw new Error('composer not found');
  return el;
}

async function send(container: HTMLElement, text: string): Promise<void> {
  await fireEvent.input(composer(container), { target: { value: text } });
  await tick();
  await fireEvent.click(container.querySelector('.ega-send') as HTMLElement);
  await waitFor(() => expect(starts().at(-1)?.text).toBe(text));
  const requestId = starts().at(-1)?.requestId ?? '';
  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    { kind: 'translate:chunk', chunk: { type: 'done', requestId, confidence: 0.9 } } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await tick();
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SidePanel — an edit keeps its own setup', () => {
  it('goes out as Translate into English after the chip moved to Summarize into French', async () => {
    const { container } = render(SidePanel);
    await tick();
    await send(container, 'hola amigo');
    expect(starts().at(-1)?.options.task).toBeUndefined();
    expect(starts().at(-1)?.targetLang).toBe('en');

    await openModePopover(container);
    const popover = document.querySelector('[data-ega-mode-popover]') as HTMLElement;
    await fireEvent.click(popover.querySelector('[data-ega-task="summarize"]') as HTMLElement);
    await fireEvent.change(popover.querySelector('#sp-conv-target') as HTMLSelectElement, {
      target: { value: 'fr' },
    });
    await fireEvent.keyDown(document.activeElement ?? popover, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[data-ega-mode-popover]')).toBeNull());

    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await waitFor(() => expect(composer(container).value).toBe('hola amigo'));
    await send(container, 'hola amigos');

    expect(starts().at(-1)?.options.task).toBeUndefined();
    expect(starts().at(-1)?.targetLang).toBe('en');
  });
});
