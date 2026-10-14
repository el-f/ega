// @vitest-environment jsdom
// The panel hears worker messages from the start of mount, before it knows the tab's site.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread, loadThreadResult, GENERAL_ORIGIN } from '@/sidepanel/state/conversation-store';
import { chromeMock } from '@tests/mocks/chrome';
import type { Turn } from '@/sidepanel/state/conversation';

const tabsQuery = chrome.tabs.query as unknown as Mock;
const sendMessage = chrome.runtime.sendMessage as Mock;
const WORKER = { id: chrome.runtime.id } as chrome.runtime.MessageSender;

const user = (id: string, content: string): Turn =>
  ({ id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content }) as Turn;

function fromWorker(msg: unknown): void {
  chromeMock.runtime.onMessage.emit(msg, WORKER, () => {});
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
  await saveThread('https://a.test', [user('a1', 'hola')]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SidePanel — an image click heard before the first follow of the tab', () => {
  it("lands in the tab site's conversation, on screen, with its reply", async () => {
    // The follow waits on the tab query, so everything below arrives before the panel knows the site.
    let answerTabs: () => void = () => {};
    const tabsAnswered = new Promise<void>((resolve) => (answerTabs = resolve));
    tabsQuery.mockImplementation(async () => {
      await tabsAnswered;
      return [{ id: 1, url: 'https://a.test/page' }];
    });
    const { container } = render(SidePanel);
    await waitFor(() => expect(tabsQuery).toHaveBeenCalled());

    fromWorker({
      kind: 'sidepanel:seed-image-translate',
      requestId: 'r1',
      imageUrl: 'https://example.com/a.png',
    });
    fromWorker({
      kind: 'translate:chunk',
      chunk: { type: 'delta', requestId: 'r1', text: 'hello from the image' },
    });
    fromWorker({ kind: 'translate:chunk', chunk: { type: 'done', requestId: 'r1' } });
    answerTabs();

    // The follow is over once the header names the tab's site; the click must be on screen there.
    await waitFor(() =>
      expect(container.querySelector('[data-ega-header-site]')?.textContent).toContain('a.test'),
    );
    // The thread itself, not the live region, which can still read out a reply from a thread it left.
    const replies = (): string[] =>
      Array.from(container.querySelectorAll<HTMLElement>('[data-ega-reply] .ega-answer')).map(
        (a) => a.textContent,
      );
    await waitFor(() => expect(replies()).toContain('hello from the image'));
    expect(container.querySelector('[data-ega-user-turn]')?.textContent).toContain('hola');
    expect(container.querySelector('[data-ega-user-turn] img')).not.toBeNull();

    window.dispatchEvent(new Event('pagehide'));
    await waitFor(async () =>
      expect((await loadThreadResult('https://a.test')).turns).toHaveLength(3),
    );
    expect((await loadThreadResult(GENERAL_ORIGIN)).turns).toHaveLength(0);
  });
});
