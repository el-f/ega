// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import {
  IMAGE_DATA_URL_MAX_CHARS,
  IMAGE_TURN_PLACEHOLDER,
  MAX_SELECTION_CHARS,
} from '@/shared/constants';
import type { Msg } from '@/shared/messages';
import { drainAsync } from '@tests/_helpers/async';

const sendMessage = chrome.runtime.sendMessage as Mock;

function translateStarts(): Msg[] {
  return (sendMessage.mock.calls as Array<[unknown]>)
    .map(([m]) => m as Msg)
    .filter((m) => m.kind === 'translate:start');
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel — an image tooltip handoff whose image was too large', () => {
  it('shows the OCR answer the tooltip already had instead of sending the placeholder as a new request', async () => {
    await writePendingPopupHandoff({
      sourceText: IMAGE_TURN_PLACEHOLDER,
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      imageDataUrl: `data:image/png;base64,${'A'.repeat(IMAGE_DATA_URL_MAX_CHARS)}`,
      ocrText: 'Exit only',
    });

    const { container } = render(SidePanel);

    await waitFor(() => expect(container.textContent).toContain('Exit only'));
    expect(translateStarts()).toHaveLength(0);
  });

  it('offers no Regenerate on that answer, since a replay would send the placeholder as text', async () => {
    await writePendingPopupHandoff({
      sourceText: IMAGE_TURN_PLACEHOLDER,
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      imageDataUrl: `data:image/png;base64,${'A'.repeat(IMAGE_DATA_URL_MAX_CHARS)}`,
      ocrText: 'Exit only',
    });

    const { container } = render(SidePanel);

    await waitFor(() => expect(container.textContent).toContain('Exit only'));
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
  });

  it('still offers Regenerate on a finished text handoff', async () => {
    await writePendingPopupHandoff({
      sourceText: 'Sortie',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      response: 'Exit only',
    });

    const { container } = render(SidePanel);

    await waitFor(() => expect(container.textContent).toContain('Exit only'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeNull(),
    );
  });

  it('adds no turn and sends nothing when the image was dropped and no answer came with it', async () => {
    await writePendingPopupHandoff({
      sourceText: IMAGE_TURN_PLACEHOLDER,
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      imageDataUrl: `data:image/png;base64,${'A'.repeat(IMAGE_DATA_URL_MAX_CHARS)}`,
    });

    const { container } = render(SidePanel);

    await waitFor(async () => {
      const left = await chrome.storage.session.get('ega.pendingPopupHandoff');
      expect(left['ega.pendingPopupHandoff']).toBeUndefined();
    });
    // The handoff is decided right after that read, so a send would be out after the drain.
    await drainAsync();
    expect(translateStarts()).toHaveLength(0);
    // No empty exchange either: an '[image]' turn with a blank answer tells the user nothing.
    expect(container.querySelectorAll('[data-turn-id]')).toHaveLength(0);
  });
});

describe('SidePanel — a handoff whose task is gone or off', () => {
  it.each([
    ['a task id no task has', 'c-deleted', {}],
    ['a task the user turned off', 'summarize', { disabledTasks: ['summarize'] }],
  ])('runs %s as Translate and keeps the text', async (_, task, settings) => {
    await chrome.storage.local.set({ 'ega.settings': settings });
    await writePendingPopupHandoff({
      sourceText: 'Bonjour',
      sourceLang: 'auto',
      targetLang: 'en',
      task,
      tone: 'neutral',
    });
    render(SidePanel);
    await waitFor(() => expect(translateStarts()).toHaveLength(1));
    const start = translateStarts()[0] as Extract<Msg, { kind: 'translate:start' }>;
    expect(start.text).toBe('Bonjour');
    expect(start.options.task).toBeUndefined();
  });
});

describe('SidePanel — a handoff whose text was cut to the selection cap', () => {
  const long = 'x'.repeat(MAX_SELECTION_CHARS + 50);

  it('marks the user turn it sends, so the cut is visible after the toast fades', async () => {
    await writePendingPopupHandoff({
      sourceText: long,
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });
    const { container } = render(SidePanel);
    await waitFor(() => expect(translateStarts()).toHaveLength(1));
    await waitFor(() =>
      expect(container.querySelector('.ega-user-trimmed')?.textContent).toContain(
        String(MAX_SELECTION_CHARS),
      ),
    );
  });

  it('marks a delivered answer too', async () => {
    await writePendingPopupHandoff({
      sourceText: long,
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      response: 'done already',
    });
    const { container } = render(SidePanel);
    await waitFor(() => expect(container.textContent).toContain('done already'));
    expect(container.querySelector('.ega-user-trimmed')).not.toBeNull();
  });

  it('leaves a whole handoff unmarked', async () => {
    await writePendingPopupHandoff({
      sourceText: 'short',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      response: 'fine',
    });
    const { container } = render(SidePanel);
    await waitFor(() => expect(container.textContent).toContain('fine'));
    expect(container.querySelector('.ega-user-trimmed')).toBeNull();
  });
});
