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

    const preview = await screen.findByAltText('Attached image');
    expect(preview.getAttribute('src')).toBe(PNG);
    await waitFor(() => expect(document.activeElement?.id).toBe('sp-text'));
    await drained();
    expect(translateStarts()).toHaveLength(0);
    expect(container.querySelectorAll('[data-turn-id]')).toHaveLength(0);
  });

  it('keeps an http image the page served', async () => {
    await attachHandoff('https://example.com/sign.png');

    render(SidePanel);

    const preview = await screen.findByAltText('Attached image');
    expect(preview.getAttribute('src')).toBe('https://example.com/sign.png');
  });

  it('keeps an http image when the panel closes and opens again', async () => {
    await attachHandoff(HTTP_IMAGE);
    const first = render(SidePanel);
    await screen.findByAltText('Attached image');
    await draftImageSaved(HTTP_IMAGE);
    first.unmount();

    render(SidePanel);

    const preview = await screen.findByAltText('Attached image');
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
    expect(screen.getByAltText('Attached image').getAttribute('src')).toBe(PNG);

    await fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

    await waitFor(() =>
      expect(screen.getByAltText('Attached image').getAttribute('src')).toBe(HTTP_IMAGE),
    );
  });

  it('does not attach into a message being edited', async () => {
    const { container } = render(SidePanel);
    await tick();
    await sendText(container, 'original');
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await tick();
    expect(container.querySelector('[data-ega-editing-banner]')).not.toBeNull();

    await attachHandoff(HTTP_IMAGE);

    await waitFor(() =>
      expect(container.textContent).toContain(
        'The page image was not attached because you are editing a message.',
      ),
    );
    expect(screen.queryByAltText('Attached image')).toBeNull();
    expect(container.querySelector('[data-ega-editing-banner]')).not.toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('#sp-text')?.value).toBe('original');
  });

  it('attaches nothing for an image the panel must not render', async () => {
    await attachHandoff('data:image/svg+xml;base64,PHN2Zz4=');

    render(SidePanel);

    await drained();
    expect(screen.queryByAltText('Attached image')).toBeNull();
  });

  it('says so when the image was too large to carry', async () => {
    await attachHandoff(`data:image/png;base64,${'A'.repeat(IMAGE_DATA_URL_MAX_CHARS)}`);

    const { container } = render(SidePanel);

    await waitFor(() =>
      expect(container.textContent).toContain('The image was too large to open in the side panel.'),
    );
    expect(screen.queryByAltText('Attached image')).toBeNull();
    expect(translateStarts()).toHaveLength(0);
  });
});
