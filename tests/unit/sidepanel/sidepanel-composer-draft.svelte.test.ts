// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import type { Msg } from '@/shared/messages';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn().mockResolvedValue(true),
}));

const confirmMock = confirmDialog as unknown as Mock;

const sendMessage = chrome.runtime.sendMessage as Mock;
// The key carries the panel's window id now, so a second window cannot share the draft.
const DRAFT_PREFIX = 'ega.sidepanelDraft';
async function draftEntry(): Promise<{ text?: string } | undefined> {
  const all = (await chrome.storage.session.get(null)) as Record<string, unknown>;
  const key = Object.keys(all).find((k) => k === DRAFT_PREFIX || k.startsWith(`${DRAFT_PREFIX}:`));
  return key === undefined ? undefined : (all[key] as { text?: string });
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
  confirmMock.mockClear();
  confirmMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

function composer(container: HTMLElement): HTMLTextAreaElement {
  const el = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!el) throw new Error('composer not found');
  return el;
}

async function sendAndDrain(container: HTMLElement, text: string): Promise<void> {
  await fireEvent.input(composer(container), { target: { value: text } });
  await tick();
  const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
  if (!sendBtn) throw new Error('send button not found');
  await fireEvent.click(sendBtn);
  await tick();
  const start = [...(sendMessage.mock.calls as Array<[unknown]>)]
    .reverse()
    .find(([m]) => (m as Msg | null)?.kind === 'translate:start');
  const requestId = (start?.[0] as { requestId?: string } | null)?.requestId;
  if (!requestId) throw new Error('translate:start not dispatched');
  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    { kind: 'translate:chunk', chunk: { type: 'done', requestId, confidence: 0.9 } } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await tick();
  await tick();
}

describe('SidePanel — an unsent draft survives', () => {
  it('writes the composer text to session storage and restores it on the next mount', async () => {
    const first = render(SidePanel);
    await tick();
    await fireEvent.input(composer(first.container), { target: { value: 'unsent thought' } });
    await waitFor(async () => {
      const stored = await draftEntry();
      if (stored?.text !== 'unsent thought') throw new Error('draft not stored yet');
    });
    first.unmount();

    const second = render(SidePanel);
    await waitFor(() => {
      if (composer(second.container).value !== 'unsent thought') {
        throw new Error('draft not restored');
      }
    });
  });

  it('clears the stored draft once the turn is sent', async () => {
    const { container } = render(SidePanel);
    await tick();
    await fireEvent.input(composer(container), { target: { value: 'goes' } });
    await waitFor(async () => {
      if ((await draftEntry()) === undefined) {
        throw new Error('draft not stored yet');
      }
    });

    await sendAndDrain(container, 'goes out');
    // The row goes, not an empty one: a leftover key is a draft the next mount has to reason about.
    await waitFor(async () => {
      if ((await draftEntry()) !== undefined) {
        throw new Error('draft row still in session storage');
      }
    });
  });
});

describe('SidePanel — e and Escape do not discard a draft', () => {
  it('refuses to overwrite a non-empty draft and says why', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');

    await fireEvent.input(composer(container), { target: { value: 'half-written reply' } });
    await tick();
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();

    expect(composer(container).value).toBe('half-written reply');
    expect(container.querySelector('[data-ega-editing-banner]')).toBeNull();
    await waitFor(() => {
      if (!document.body.textContent.includes('Clear the message box')) {
        throw new Error('no toast explaining the refusal');
      }
    });
  });

  it('Escape restores the draft the edit replaced', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');

    // Draft typed after the send, then edit-last pulls the sent turn over it.
    await fireEvent.input(composer(container), { target: { value: '' } });
    await tick();
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();
    expect(composer(container).value).toBe('original');

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();
    expect(composer(container).value).toBe('');
  });

  it('Escape asks before throwing away what the user typed into the edit', async () => {
    confirmMock.mockResolvedValue(false);
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');

    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();
    await fireEvent.input(composer(container), {
      target: { value: 'original, rewritten at length' },
    });
    await tick();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      if (confirmMock.mock.calls.length === 0) throw new Error('no confirm shown');
    });
    // Dismissed: the edit and its banner stay.
    expect(composer(container).value).toBe('original, rewritten at length');
    expect(container.querySelector('[data-ega-editing-banner]')).not.toBeNull();

    confirmMock.mockResolvedValue(true);
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      if (container.querySelector('[data-ega-editing-banner]')) throw new Error('still editing');
    });
    expect(composer(container).value).toBe('');
  });

  it('Escape gives back a draft that happened to match the turn it edited', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');

    // Same text as the last turn, so the overwrite guard lets the edit through.
    await fireEvent.input(composer(container), { target: { value: 'original' } });
    await tick();
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();
    expect(container.querySelector('[data-ega-editing-banner]')).not.toBeNull();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(composer(container).value).toBe('original');
  });

  it('the pencil on the last turn refuses the same draft the way e does', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');

    await fireEvent.input(composer(container), { target: { value: 'half-written reply' } });
    await tick();
    const edit = container.querySelector<HTMLButtonElement>('[data-ega-edit]');
    if (!edit) throw new Error('edit button not found');
    await fireEvent.click(edit);
    await tick();

    expect(composer(container).value).toBe('half-written reply');
    expect(container.querySelector('[data-ega-editing-banner]')).toBeNull();
  });
});
