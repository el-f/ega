// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import { IMAGE_DATA_URL_MAX_CHARS } from '@/shared/constants';
import type { Msg } from '@/shared/messages';
import { drainAsync } from '@tests/_helpers/async';

const sendMessage = chrome.runtime.sendMessage as Mock;
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

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
