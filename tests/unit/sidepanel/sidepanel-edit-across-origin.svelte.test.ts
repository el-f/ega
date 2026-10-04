// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import type { Msg } from '@/shared/messages';

const tabsQuery = chrome.tabs.query as unknown as Mock;
const sendMessage = chrome.runtime.sendMessage as Mock;

function turn(id: string, role: 'user' | 'assistant', content: string): Turn {
  return {
    createdAt: 1,
    id,
    role,
    kind: 'translate',
    status: role === 'user' ? 'idle' : 'done',
    content,
    ...(role === 'assistant' ? { attachedToTurnId: 'b-user' } : {}),
  } as Turn;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  await tick();
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
  tabsQuery.mockResolvedValue([{ id: 1, url: 'https://a.test/page' }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function sendText(container: HTMLElement, text: string): Promise<void> {
  const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!textarea) throw new Error('source textarea not found');
  await fireEvent.input(textarea, { target: { value: text } });
  await tick();
  const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
  if (!sendBtn) throw new Error('send button not found');
  await fireEvent.click(sendBtn);
  await settle();
  const start = (sendMessage.mock.calls as Array<[unknown]>)
    .map(([m]) => m as { kind?: string; requestId?: string } | null)
    .filter((m) => m?.kind === 'translate:start')
    .pop();
  if (!start?.requestId) throw new Error('no translate:start dispatched');
  (chrome.runtime.onMessage as unknown as { emit: (...a: unknown[]) => void }).emit(
    {
      kind: 'translate:chunk',
      chunk: { type: 'done', requestId: start.requestId, confidence: 0.9 },
    } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await settle();
}

describe('SidePanel — a pending edit does not follow the panel to another site', () => {
  it('sending after a tab switch keeps the new site thread intact', async () => {
    await saveThread('https://b.test', [
      turn('b-user', 'user', 'beta'),
      turn('b-assistant', 'assistant', 'beta reply'),
    ]);

    const { container } = render(SidePanel);
    await settle();
    await sendText(container, 'alpha');

    // 'e' pulls the last user turn into the composer without removing it yet.
    await fireEvent.keyDown(window, { key: 'e', target: document.body });
    await settle();
    const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
    expect(textarea?.value).toBe('alpha');

    tabsQuery.mockResolvedValue([{ id: 2, url: 'https://b.test/other' }]);
    (chrome.tabs.onActivated as unknown as { emit: (i: unknown) => void }).emit({
      tabId: 2,
      windowId: 1,
    });
    // The follower debounces the tab switch, then the panel loads the other site's thread.
    await waitFor(() => expect(container.textContent).toContain('beta'));
    await settle();

    await sendText(container, 'gamma');

    expect(container.textContent).toContain('beta');
  });
});
