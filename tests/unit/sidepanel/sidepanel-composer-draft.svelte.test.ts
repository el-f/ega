// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import type { Msg } from '@/shared/messages';
import { openMenu } from './_reply';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';

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
    expect(container.querySelector('[data-ega-mode-banner]')).toBeNull();
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
    expect(container.querySelector('[data-ega-mode-banner]')).not.toBeNull();

    confirmMock.mockResolvedValue(true);
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      if (container.querySelector('[data-ega-mode-banner]')) throw new Error('still editing');
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
    expect(container.querySelector('[data-ega-mode-banner]')).not.toBeNull();

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
    expect(container.querySelector('[data-ega-mode-banner]')).toBeNull();
  });
});

/** A few macrotask turns: enough for a draft write the panel started to land in session storage. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

async function describeChange(container: HTMLElement): Promise<void> {
  const menu = await openMenu(container, 'refine');
  const item = menu.querySelector<HTMLElement>('[data-ega-describe-change]');
  if (!item) throw new Error('Describe a change missing');
  await fireEvent.click(item);
  await waitFor(() => {
    if (!container.querySelector('[data-ega-mode-banner]')?.textContent.includes('Changing')) {
      throw new Error('not in refine mode');
    }
  });
}

describe('SidePanel — Describe a change keeps the draft', () => {
  it('the stored draft stays the text from before the mode, whatever the change box holds', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');
    await fireEvent.input(composer(container), { target: { value: 'my draft' } });
    await waitFor(async () => {
      if ((await draftEntry())?.text !== 'my draft') throw new Error('draft not stored yet');
    });

    await describeChange(container);
    await fireEvent.input(composer(container), { target: { value: 'make it shorter' } });
    // Closing the panel flushes any draft save still waiting; nothing may be waiting in this mode.
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    expect((await draftEntry())?.text).toBe('my draft');
  });

  it('from an edit, it asks before throwing the edited text away', async () => {
    confirmMock.mockResolvedValue(false);
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();
    await fireEvent.input(composer(container), { target: { value: 'original, rewritten' } });
    await tick();

    const menu = await openMenu(container, 'refine');
    await fireEvent.click(menu.querySelector('[data-ega-describe-change]') as HTMLElement);
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    // Kept editing: the rewrite and the edit banner stay.
    expect(composer(container).value).toBe('original, rewritten');
    expect(container.querySelector('[data-ega-mode-banner]')?.textContent).toContain('Editing');
  });

  it('while a change is described, e says why it waits and leaves the change alone', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'original');
    await describeChange(container);
    await fireEvent.input(composer(container), { target: { value: 'make it shorter' } });
    await tick();

    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await waitFor(() =>
      expect(document.body.textContent).toContain('Send or cancel the change first.'),
    );
    expect(composer(container).value).toBe('make it shorter');
    expect(container.querySelector('[data-ega-mode-banner]')?.textContent).toContain('Changing');
  });
});

describe('SidePanel — Edit from here never overwrites a draft', () => {
  it('refuses over a different draft and says why, before any confirm', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'first');
    await sendAndDrain(container, 'second');
    await fireEvent.input(composer(container), { target: { value: 'half-written' } });
    await tick();

    const older = container.querySelector<HTMLElement>('.ega-user-turn [data-ega-edit]');
    if (!older) throw new Error('older Edit missing');
    await fireEvent.click(older);
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'Clear the message box first to edit this message.',
      ),
    );
    expect(confirmMock).not.toHaveBeenCalled();
    expect(composer(container).value).toBe('half-written');
  });
});

describe('SidePanel — an edit sends words only', () => {
  it('an image waiting in the composer is not sent with the edit, and still waits after it', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendAndDrain(container, 'first');

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' });
    const item = { type: 'image/png', kind: 'file', getAsFile: () => file };
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { items: [item], files: [file], getData: () => '' },
      configurable: true,
    });
    composer(container).dispatchEvent(paste);
    await waitFor(() => expect(container.querySelector('[data-ega-chip-remove]')).not.toBeNull());

    const edit = container.querySelector<HTMLButtonElement>('[data-ega-edit]');
    if (!edit) throw new Error('edit button not found');
    await fireEvent.click(edit);
    await waitFor(() => expect(container.querySelector('[data-ega-mode-banner]')).not.toBeNull());
    sendMessage.mockClear();
    sendMessage.mockResolvedValue({ ok: true });
    await fireEvent.input(composer(container), { target: { value: 'first, edited' } });
    await tick();
    await fireEvent.click(container.querySelector('.ega-send') as HTMLElement);

    const starts = (): Extract<Msg, { kind: 'translate:start' }>[] =>
      (sendMessage.mock.calls as Array<[Msg]>)
        .map(([m]) => m)
        .filter(
          (m): m is Extract<Msg, { kind: 'translate:start' }> => m.kind === 'translate:start',
        );
    await waitFor(() => expect(starts()).toHaveLength(1));
    expect(starts()[0]?.options.imageUrl).toBeUndefined();
    expect(starts()[0]?.text).toBe('first, edited');
    await waitFor(() => expect(container.querySelector('[data-ega-chip-remove]')).not.toBeNull());
  });
});

describe('SidePanel — Edit from here removes nothing until the edit is sent (F11)', () => {
  const bubbles = (c: HTMLElement): string[] =>
    Array.from(c.querySelectorAll<HTMLElement>('[data-ega-user-bubble]')).map((b) =>
      b.textContent.trim(),
    );

  async function editOlder(container: HTMLElement): Promise<void> {
    await sendAndDrain(container, 'first');
    await sendAndDrain(container, 'second');
    const older = container.querySelector<HTMLElement>('.ega-user-turn [data-ega-edit]');
    if (!older) throw new Error('older Edit missing');
    await fireEvent.click(older);
    await waitFor(() => expect(container.querySelector('[data-ega-mode-banner]')).not.toBeNull());
  }

  it('enters edit mode with every message kept, and Cancel editing leaves them all', async () => {
    const { container } = render(SidePanel);
    await tick();
    await editOlder(container);

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Edit from here?',
        body: 'Sending your edit removes the 3 messages after it.',
      }),
    );
    expect(container.querySelector('[data-ega-mode-banner]')?.textContent).toContain(
      'Editing your message',
    );
    expect(composer(container).value).toBe('first');
    expect(bubbles(container)).toEqual(['first', 'second']);
    expect(container.querySelectorAll('[data-ega-user-bubble].editing')).toHaveLength(1);
    expect(container.querySelector('[data-ega-user-bubble].editing')?.textContent).toContain(
      'first',
    );

    const cancel = container.querySelector<HTMLElement>('[aria-label="Cancel editing"]');
    if (!cancel) throw new Error('Cancel editing missing');
    await fireEvent.click(cancel);
    await waitFor(() => expect(container.querySelector('[data-ega-mode-banner]')).toBeNull());
    expect(composer(container).value).toBe('');
    expect(bubbles(container)).toEqual(['first', 'second']);
  });

  it('Esc after a change asks first, then leaves every message in place', async () => {
    const { container } = render(SidePanel);
    await tick();
    await editOlder(container);
    await fireEvent.input(composer(container), { target: { value: 'first, changed' } });
    await tick();
    confirmMock.mockClear();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(container.querySelector('[data-ega-mode-banner]')).toBeNull());
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Discard your edit?' }),
    );
    expect(composer(container).value).toBe('');
    expect(bubbles(container)).toEqual(['first', 'second']);
  });

  it('sending the edit replaces that message and everything after it', async () => {
    const { container } = render(SidePanel);
    await tick();
    await editOlder(container);
    sendMessage.mockClear();
    sendMessage.mockResolvedValue({ ok: true });

    await fireEvent.input(composer(container), { target: { value: 'first, edited' } });
    await tick();
    await fireEvent.click(container.querySelector('.ega-send') as HTMLElement);

    await waitFor(() => expect(bubbles(container)).toEqual(['first, edited']));
    const starts = (sendMessage.mock.calls as Array<[Msg]>).filter(
      ([m]) => m.kind === 'translate:start',
    );
    expect(starts).toHaveLength(1);
    expect(container.querySelector('[data-ega-mode-banner]')).toBeNull();
    expect(composer(container).value).toBe('');
  });

  it('a message that lands during the edit ends it, so the send removes nothing', async () => {
    const { container } = render(SidePanel);
    await tick();
    await editOlder(container);
    await fireEvent.input(composer(container), { target: { value: 'first, edited' } });
    await tick();

    // A tooltip answer handed to the panel while the edit is open.
    await writePendingPopupHandoff({
      sourceText: 'from the page',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      response: 'answer',
    });
    await waitFor(() => expect(bubbles(container)).toEqual(['first', 'second', 'from the page']));
    await waitFor(() => expect(container.querySelector('[data-ega-mode-banner]')).toBeNull());
    expect(composer(container).value).toBe('first, edited');

    await fireEvent.click(container.querySelector('.ega-send') as HTMLElement);
    await waitFor(() =>
      expect(bubbles(container)).toEqual(['first', 'second', 'from the page', 'first, edited']),
    );
  });
});
