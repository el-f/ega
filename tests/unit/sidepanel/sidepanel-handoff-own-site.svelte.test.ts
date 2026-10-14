// @vitest-environment jsdom
// A handoff from the tab belongs to the tab's site, even while the panel shows another site's conversation.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread, loadThreadResult } from '@/sidepanel/state/conversation-store';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import type { Turn } from '@/sidepanel/state/conversation';
import { toastStore } from '@/shared/components/toastStore';

const tabsQuery = chrome.tabs.query as unknown as Mock;
const sendMessage = chrome.runtime.sendMessage as Mock;

const user = (id: string, content: string): Turn =>
  ({ id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content }) as Turn;

const userTexts = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-ega-user-turn]')).map((t) => t.textContent);

async function storedUserTexts(id: string): Promise<string[]> {
  const { turns } = await loadThreadResult(id);
  return turns.filter((t) => t.role === 'user').map((t) => t.content);
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
  tabsQuery.mockResolvedValue([{ id: 1, url: 'https://a.test/page' }]);
  await saveThread('https://other.test', [user('o1', 'bonjour')]);
  await saveThread('https://a.test', [user('a1', 'hola')]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe("SidePanel — a handoff lands in the tab's site conversation", () => {
  it("goes back to the tab's site from another site's conversation, and says so", async () => {
    const { container } = render(SidePanel);
    const header = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-ega-header-site]');
      if (!el) throw new Error('header not mounted');
      return el;
    });
    await waitFor(() => expect(container.querySelector('[data-turn-id]')).not.toBeNull());
    await fireEvent.click(header);
    const openOther = await waitFor(() => {
      const b = document.querySelector<HTMLElement>(
        '[data-ega-conv-row="https://other.test"] [data-ega-conv-open]',
      );
      if (!b) throw new Error('row not shown');
      return b;
    });
    await fireEvent.click(openOther);
    await waitFor(() => expect(header.textContent).toContain('other.test'));
    const push = vi.spyOn(toastStore, 'push');

    // Pin from the tab on a.test: the panel sends the selection again.
    await writePendingPopupHandoff({
      sourceText: 'texto de a.test',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });

    await waitFor(() => expect(userTexts(container).join('|')).toContain('texto de a.test'));
    expect(header.textContent).toContain('a.test');
    expect(header.textContent).not.toContain('other.test');
    expect(userTexts(container).join('|')).toContain('hola');
    expect(push).toHaveBeenCalledWith({
      message: 'Switched to the conversation for this tab: a.test.',
      variant: 'info',
    });

    window.dispatchEvent(new Event('pagehide'));
    await waitFor(async () =>
      expect(await storedUserTexts('https://a.test')).toEqual(['hola', 'texto de a.test']),
    );
    expect(await storedUserTexts('https://other.test')).toEqual(['bonjour']);
  });
});
