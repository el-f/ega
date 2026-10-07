// @vitest-environment jsdom
// The side panel reads custom task rows, offers them in the Next message popover, and sends one as kind translate + its id.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { STORAGE_KEYS } from '@/shared/constants';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import { chromeMock } from '@tests/mocks/chrome';
import type { Msg } from '@/shared/messages';
import { flushAsync } from '@tests/_helpers/async';
import { openModePopover } from './_composer';

const sendMessage = chrome.runtime.sendMessage as Mock;
const row = (id: string, label: string, createdAt: number) => ({
  id,
  label,
  system: '',
  user: '{{text}}',
  output: 'plain',
  pageContext: false,
  image: false,
  glossary: false,
  createdAt,
});

function starts(): Extract<Msg, { kind: 'translate:start' }>[] {
  return (sendMessage.mock.calls as Array<[unknown]>)
    .map(([m]) => m as Msg)
    .filter((m): m is Extract<Msg, { kind: 'translate:start' }> => m.kind === 'translate:start');
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
  await chrome.storage.local.set({
    [STORAGE_KEYS.customTasks]: [row('c-tweet', 'Tweet summary', 1)],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel custom tasks', () => {
  it('lists a custom task, and a new row appears when ega.customTasks changes', async () => {
    const { container } = render(SidePanel);
    await openModePopover(container);
    await waitFor(() =>
      expect(container.querySelector('[data-ega-task="c-tweet"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-ega-task="c-tweet"]')?.textContent).toContain(
      'Tweet summary',
    );
    const next = [row('c-tweet', 'Tweet summary', 1), row('c-haiku', 'Haiku', 2)];
    await chrome.storage.local.set({ [STORAGE_KEYS.customTasks]: next });
    // The panel registers its storage listener late in mount, so the change repeats until it is heard.
    await waitFor(() => {
      chromeMock.storage.local._fire({
        [STORAGE_KEYS.customTasks]: { oldValue: [], newValue: next },
      });
      expect(container.querySelector('[data-ega-task="c-haiku"]')).not.toBeNull();
    });
  });

  it('sends a custom task as kind translate with its id, and the user turn carries it', async () => {
    const { container } = render(SidePanel);
    await waitFor(async () => {
      await openModePopover(container);
      const chip = container.querySelector<HTMLElement>('[data-ega-task="c-tweet"]');
      if (!chip) throw new Error('no chip');
      await fireEvent.click(chip);
      await flushAsync();
      expect(chip.getAttribute('aria-checked')).toBe('true');
    });
    const text = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!text) throw new Error('no composer');
    await fireEvent.input(text, { target: { value: 'a long thread' } });
    await tick();
    expect(container.querySelector('[data-ega-mode-chip]')?.textContent).toContain('Tweet summary');
    const send = container.querySelector<HTMLButtonElement>('.ega-send');
    if (!send) throw new Error('no send');
    await fireEvent.click(send);
    await waitFor(() => expect(starts()).toHaveLength(1));
    expect(starts()[0]?.options.task).toBe('c-tweet');
    await waitFor(() => expect(container.textContent).toContain('Tweet summary'));
  });

  it('runs a handoff for a task that is on as that task', async () => {
    await writePendingPopupHandoff({
      sourceText: 'Bonjour',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'summarize',
      tone: 'neutral',
    });
    render(SidePanel);
    await waitFor(() => expect(starts()).toHaveLength(1));
    expect(starts()[0]?.options.task).toBe('summarize');
  });
});

describe('SidePanel custom task with an image', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('takes no images: the task cannot be picked while an image waits, and the image goes to Translate', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.customTasks]: [{ ...row('c-img', 'Describe', 1), image: false }],
    });
    const { writeComposerDraftImage } = await import('@/sidepanel/state/composer-draft');
    await writeComposerDraftImage(PNG);
    const { container } = render(SidePanel);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    await openModePopover(container);
    const chip = await waitFor(() => {
      const c = container.querySelector<HTMLElement>('[data-ega-task="c-img"]');
      if (!c) throw new Error('no chip');
      return c;
    });
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(chip);
    await flushAsync();
    expect(chip.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(container.querySelector('.ega-send') as HTMLElement);
    await waitFor(() => expect(starts()).toHaveLength(1));
    expect(starts()[0]?.options.task).toBeUndefined();
    expect(starts()[0]?.options.imageUrl).toBeDefined();
  });

  it.each([['takes images: sends its own task with the image', true, 'c-img']])(
    '%s',
    async (_, image, expectedTask) => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.customTasks]: [{ ...row('c-img', 'Describe', 1), image }],
      });
      const { writeComposerDraftImage } = await import('@/sidepanel/state/composer-draft');
      await writeComposerDraftImage(PNG);
      const { container } = render(SidePanel);
      await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
      await waitFor(async () => {
        await openModePopover(container);
        const chip = container.querySelector<HTMLElement>('[data-ega-task="c-img"]');
        if (!chip) throw new Error('no chip');
        await fireEvent.click(chip);
        await flushAsync();
        expect(chip.getAttribute('aria-checked')).toBe('true');
      });
      const send = container.querySelector<HTMLButtonElement>('.ega-send');
      if (!send) throw new Error('no send');
      await fireEvent.click(send);
      await waitFor(() => expect(starts()).toHaveLength(1));
      expect(starts()[0]?.options.task).toBe(expectedTask);
      expect(starts()[0]?.options.imageUrl).toBeDefined();
    },
  );
});

describe('SidePanel handoff with a custom task', () => {
  it('a known custom task sends its id', async () => {
    await writePendingPopupHandoff({
      sourceText: 'a long thread',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'c-tweet',
      tone: 'neutral',
    });
    render(SidePanel);
    await waitFor(() => expect(starts()).toHaveLength(1));
    expect(starts()[0]?.options.task).toBe('c-tweet');
  });

  it('a delivered answer for a custom task keeps the task name on its turn', async () => {
    await writePendingPopupHandoff({
      sourceText: 'a long thread',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'c-tweet',
      tone: 'neutral',
      response: 'Short tweet',
    });
    const { container } = render(SidePanel);
    await waitFor(() => expect(container.textContent).toContain('Short tweet'));
    await waitFor(() =>
      expect(container.querySelector('.ega-user-turn')?.textContent).toContain('Tweet summary'),
    );
    expect(starts()).toHaveLength(0);
  });
});

describe('SidePanel page context follows the task switch at send time', () => {
  const contextAsks = (): number =>
    (chrome.tabs.sendMessage as Mock).mock.calls.filter(
      ([, m]) => (m as { kind?: string }).kind === 'ega:get-page-context',
    ).length;

  it('a task with page context off does not read the page, and its turn says nothing was sent', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7, url: 'https://x.test/a' }]);
    (chrome.tabs.sendMessage as Mock).mockResolvedValue({
      context: { pageUrl: 'https://x.test/a', pageTitle: 'X' },
    });
    const { container } = render(SidePanel);
    await waitFor(async () => {
      await openModePopover(container);
      const chip = container.querySelector<HTMLElement>('[data-ega-task="c-tweet"]');
      if (!chip) throw new Error('no chip');
      await fireEvent.click(chip);
      await flushAsync();
      expect(chip.getAttribute('aria-checked')).toBe('true');
    });
    const text = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!text) throw new Error('no composer');
    await fireEvent.input(text, { target: { value: 'a long thread' } });
    await tick();
    container.querySelector<HTMLButtonElement>('.ega-send')?.click();
    await waitFor(() => expect(starts()).toHaveLength(1));
    expect(starts()[0]?.context).toBeUndefined();
    expect(contextAsks()).toBe(0);
  });
});

describe('SidePanel page context for an image read by the OCR arm', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('reads no page and records none, since the OCR prompt never uses it', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7, url: 'https://x.test/a' }]);
    (chrome.tabs.sendMessage as Mock).mockResolvedValue({
      context: { pageUrl: 'https://x.test/a', pageTitle: 'X' },
    });
    const { writeComposerDraftImage } = await import('@/sidepanel/state/composer-draft');
    await writeComposerDraftImage(PNG);
    const { container } = render(SidePanel);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    // A send before the tab's thread loads bails on the origin change, so it repeats until one lands.
    await waitFor(() => {
      if (starts().length === 0) container.querySelector<HTMLButtonElement>('.ega-send')?.click();
      expect(starts()).toHaveLength(1);
    });
    expect(starts()[0]?.options.imageUrl).toBeDefined();
    expect(starts()[0]?.context).toBeUndefined();
    expect(
      (chrome.tabs.sendMessage as Mock).mock.calls.filter(
        ([, m]) => (m as { kind?: string }).kind === 'ega:get-page-context',
      ),
    ).toHaveLength(0);
  });
});

describe('SidePanel page context, positive control', () => {
  it('Translate, which sends page context, reads the page once and ships it', async () => {
    (chrome.tabs.query as Mock).mockResolvedValue([{ id: 7, url: 'https://x.test/a' }]);
    (chrome.tabs.sendMessage as Mock).mockResolvedValue({
      context: { pageUrl: 'https://x.test/a', pageTitle: 'X' },
    });
    const { container } = render(SidePanel);
    const text = await waitFor(() => {
      const el = container.querySelector<HTMLTextAreaElement>('#sp-text');
      if (!el) throw new Error('no composer');
      return el;
    });
    await fireEvent.input(text, { target: { value: 'hola' } });
    await tick();
    container.querySelector<HTMLButtonElement>('.ega-send')?.click();
    await waitFor(() => expect(starts()).toHaveLength(1));
    expect(starts()[0]?.context).toEqual({ pageUrl: 'https://x.test/a', pageTitle: 'X' });
  });
});
