// @vitest-environment jsdom
// An edit reads the page before it sends; the conversation can move on meanwhile.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Msg } from '@/shared/messages';
import type { Turn } from '@/sidepanel/state/conversation';
import { doneReply } from './_reply';

const sendMessage = chrome.runtime.sendMessage as Mock;
const tabsSend = chrome.tabs.sendMessage as unknown as Mock;

const starts = (): Msg[] =>
  (sendMessage.mock.calls as Array<[Msg]>)
    .map(([m]) => m)
    .filter((m) => m.kind === 'translate:start');

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
  (chrome.tabs.query as unknown as Mock).mockResolvedValue([{ id: 1, url: 'https://a.test/x' }]);
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, contextEnabled: true },
  });
  const asked = {
    id: 'u1',
    role: 'user',
    kind: 'explain',
    status: 'idle',
    createdAt: 1,
    content: 'first',
  } as Turn;
  await saveThread('https://a.test', [asked, doneReply({ kind: 'explain' }) as Turn]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SidePanel — an edit that stops being one while the page is read', () => {
  it('sends nothing with the old message setup; the text waits for the next Send', async () => {
    const { container } = render(SidePanel);
    const edit = await waitFor(() => {
      const b = container.querySelector<HTMLElement>('[data-ega-user-turn] [data-ega-edit]');
      if (!b) throw new Error('Edit not shown');
      return b;
    });
    await fireEvent.click(edit);
    await waitFor(() => expect(container.querySelector('[data-ega-mode-banner]')).not.toBeNull());
    const box = container.querySelector<HTMLTextAreaElement>('#sp-text') as HTMLTextAreaElement;
    await fireEvent.input(box, { target: { value: 'first, edited' } });
    await tick();

    // The page answers only when the test says so.
    let answer: (v: unknown) => void = () => {};
    tabsSend.mockImplementation(() => new Promise((r) => (answer = r)));
    sendMessage.mockClear();
    sendMessage.mockResolvedValue({ ok: true });
    await fireEvent.click(container.querySelector('.ega-send') as HTMLElement);
    await waitFor(() => expect(tabsSend).toHaveBeenCalled());

    // A tooltip answer lands meanwhile, so the edited message is no longer the newest.
    await writePendingPopupHandoff({
      sourceText: 'from the page',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      response: 'answer',
    });
    await waitFor(() => expect(container.querySelector('[data-ega-mode-banner]')).toBeNull());
    answer({ context: null });
    await waitFor(() => expect(tabsSend).toHaveBeenCalledTimes(1));
    await tick();
    await tick();

    expect(starts()).toHaveLength(0);
    expect(box.value).toBe('first, edited');
  });
});
