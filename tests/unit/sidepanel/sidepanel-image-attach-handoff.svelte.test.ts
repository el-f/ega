// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import { IMAGE_DATA_URL_MAX_CHARS } from '@/shared/constants';
import type { Msg } from '@/shared/messages';
import { drainAsync } from '@tests/_helpers/async';
import { writeComposerDraftImage } from '@/sidepanel/state/composer-draft';
import { openMenu } from './_reply';

const sendMessage = chrome.runtime.sendMessage as Mock;
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const HTTP_IMAGE = 'https://example.com/sign.png';

async function draftImageSaved(src: string): Promise<void> {
  await waitFor(async () => {
    const all = await chrome.storage.session.get(null);
    const rows = Object.entries(all).filter(([k]) => k.startsWith('ega.sidepanelDraftImage'));
    expect(rows.map(([, v]) => (v as { src?: string }).src)).toContain(src);
  });
}

async function sendText(container: HTMLElement, text: string): Promise<void> {
  const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!textarea) throw new Error('sp-text not found');
  await fireEvent.input(textarea, { target: { value: text } });
  const send = container.querySelector<HTMLButtonElement>('.ega-send');
  if (!send) throw new Error('send button not found');
  await fireEvent.click(send);
  await waitFor(() => expect(translateStarts()).toHaveLength(1));
  const start = translateStarts()[0] as Extract<Msg, { kind: 'translate:start' }>;
  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    {
      kind: 'translate:chunk',
      chunk: { type: 'done', requestId: start.requestId, confidence: 0.9 },
    } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await tick();
  await tick();
}

function translateStarts(): Msg[] {
  return (sendMessage.mock.calls as Array<[unknown]>)
    .map(([m]) => m as Msg)
    .filter((m) => m.kind === 'translate:start');
}

function attachHandoff(imageDataUrl: string): Promise<void> {
  return writePendingPopupHandoff({
    sourceText: '',
    sourceLang: 'auto',
    targetLang: 'en',
    task: 'translate',
    tone: 'neutral',
    imageDataUrl,
    attachImage: true,
  });
}

async function drained(): Promise<void> {
  await waitFor(async () => {
    const left = await chrome.storage.session.get('ega.pendingPopupHandoff');
    expect(left['ega.pendingPopupHandoff']).toBeUndefined();
  });
  await drainAsync();
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel — a failed tooltip image opened in the panel', () => {
  it('puts the image in the composer, focused and unsent', async () => {
    await attachHandoff(PNG);

    const { container } = render(SidePanel);

    const preview = await screen.findByAltText('Attachment');
    expect(preview.getAttribute('src')).toBe(PNG);
    await waitFor(() => expect(document.activeElement?.id).toBe('sp-text'));
    await drained();
    expect(translateStarts()).toHaveLength(0);
    expect(container.querySelectorAll('[data-turn-id]')).toHaveLength(0);
  });

  it('keeps an http image the page served', async () => {
    await attachHandoff('https://example.com/sign.png');

    render(SidePanel);

    const preview = await screen.findByAltText('Attachment');
    expect(preview.getAttribute('src')).toBe('https://example.com/sign.png');
  });

  it('keeps an http image when the panel closes and opens again', async () => {
    await attachHandoff(HTTP_IMAGE);
    const first = render(SidePanel);
    await screen.findByAltText('Attachment');
    await draftImageSaved(HTTP_IMAGE);
    first.unmount();

    render(SidePanel);

    const preview = await screen.findByAltText('Attachment');
    expect(preview.getAttribute('src')).toBe(HTTP_IMAGE);
  });

  it("keeps the user's own image and offers to replace it", async () => {
    await writeComposerDraftImage(PNG);
    await attachHandoff(HTTP_IMAGE);

    const { container } = render(SidePanel);

    await waitFor(() =>
      expect(container.textContent).toContain(
        'Replace the attached image with the one from the page?',
      ),
    );
    expect(screen.getByAltText('Attachment').getAttribute('src')).toBe(PNG);

    await fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

    await waitFor(() =>
      expect(screen.getByAltText('Attachment').getAttribute('src')).toBe(HTTP_IMAGE),
    );
  });

  // The offer holds the only copy of the page image (the handoff is already drained), so it must not expire.
  it('keeps the Replace offer until it is used, long past an Undo lifetime', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await writeComposerDraftImage(PNG);
      await attachHandoff(HTTP_IMAGE);
      const { container } = render(SidePanel);
      await waitFor(() =>
        expect(container.textContent).toContain(
          'Replace the attached image with the one from the page?',
        ),
      );

      await vi.advanceTimersByTimeAsync(30_000);
      await fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

      await waitFor(() =>
        expect(container.querySelector(`img[src="${HTTP_IMAGE}"]`)).not.toBeNull(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not attach into a message being edited', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendText(container, 'original');
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();
    expect(container.querySelector('[data-ega-mode-banner]')).not.toBeNull();

    await attachHandoff(HTTP_IMAGE);

    await waitFor(() =>
      expect(container.textContent).toContain(
        "The page image wasn't attached because you're editing a message.",
      ),
    );
    expect(screen.queryByAltText('Attachment')).toBeNull();
    expect(container.querySelector('[data-ega-mode-banner]')).not.toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('#sp-text')?.value).toBe('original');
  });

  it('while a change is described, says so in those words and attaches nothing', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendText(container, 'original');
    const menu = await openMenu(container, 'refine');
    await fireEvent.click(menu.querySelector('[data-ega-describe-change]') as HTMLElement);
    await waitFor(() =>
      expect(container.querySelector('[data-ega-mode-banner]')?.textContent).toContain('Changing'),
    );

    await attachHandoff(HTTP_IMAGE);

    await waitFor(() =>
      expect(container.textContent).toContain(
        "The page image wasn't attached because you're changing a reply.",
      ),
    );
    expect(screen.queryByAltText('Attachment')).toBeNull();
  });

  it('a Replace offer used after a change started attaches nothing', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendText(container, 'original');
    // The user's own image, pasted after the send, is what the page image would replace.
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{ type: 'image/png', kind: 'file', getAsFile: () => file }],
        files: [file],
        getData: () => '',
      },
      configurable: true,
    });
    container.querySelector('#sp-text')?.dispatchEvent(paste);
    await waitFor(() => expect(screen.getByAltText('Attachment')).not.toBeNull());
    await attachHandoff(HTTP_IMAGE);
    const replace = await waitFor(() => screen.getByRole('button', { name: 'Replace' }));
    const menu = await openMenu(container, 'refine');
    await fireEvent.click(menu.querySelector('[data-ega-describe-change]') as HTMLElement);
    await waitFor(() =>
      expect(container.querySelector('[data-ega-mode-banner]')?.textContent).toContain('Changing'),
    );

    await fireEvent.click(replace);

    await waitFor(() =>
      expect(container.textContent).toContain(
        "The page image wasn't attached because you're changing a reply.",
      ),
    );
    expect(container.querySelector(`img[src="${HTTP_IMAGE}"]`)).toBeNull();
  });

  it('attaches nothing for an image the panel must not render', async () => {
    await attachHandoff('data:image/svg+xml;base64,PHN2Zz4=');

    render(SidePanel);

    await drained();
    expect(screen.queryByAltText('Attachment')).toBeNull();
  });

  it('says so when the image was too large to carry', async () => {
    await attachHandoff(`data:image/png;base64,${'A'.repeat(IMAGE_DATA_URL_MAX_CHARS)}`);

    const { container } = render(SidePanel);

    await waitFor(() =>
      expect(container.textContent).toContain('The image was too large to open in the side panel.'),
    );
    expect(screen.queryByAltText('Attachment')).toBeNull();
    expect(translateStarts()).toHaveLength(0);
  });
});
