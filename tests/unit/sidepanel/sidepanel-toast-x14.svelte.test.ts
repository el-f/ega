// @vitest-environment jsdom
// X14: a new action closes the toasts that wait for the user, and the first send ends the New-conversation Undo.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { toastStore } from '@/shared/components/toastStore';
import type { Turn } from '@/sidepanel/state/conversation';
import type { Msg } from '@/shared/messages';

const tabsQuery = chrome.tabs.query as unknown as Mock;
const sendMessage = chrome.runtime.sendMessage as Mock;

const user = (id: string, content: string): Turn =>
  ({ id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content }) as Turn;
const reply = (id: string, parent: string): Turn =>
  ({
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt: 2,
    content: 'hello',
    attachedToTurnId: parent,
  }) as Turn;

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  await tick();
}

function emit(msg: Msg): void {
  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    msg,
    { id: chrome.runtime.id },
    () => {},
  );
}

function lastRequestId(): string {
  const id = (sendMessage.mock.calls as Array<[Record<string, unknown>]>)
    .map(([m]) => m)
    .filter((m) => m['kind'] === 'translate:start')
    .at(-1)?.['requestId'];
  if (typeof id !== 'string') throw new Error('no translate:start sent');
  return id;
}

async function mounted(): Promise<HTMLElement> {
  const { container } = render(SidePanel);
  await waitFor(() => {
    if (!container.querySelector('[data-ega-backend-chip]')) throw new Error('mount not settled');
  });
  await settle();
  return container;
}

async function send(container: HTMLElement, text: string): Promise<void> {
  const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!textarea) throw new Error('sp-text missing');
  await fireEvent.input(textarea, { target: { value: text } });
  await tick();
  await fireEvent.click(container.querySelector<HTMLButtonElement>('.ega-send') as HTMLElement);
  await settle();
}

async function button(container: HTMLElement, selector: string): Promise<HTMLElement> {
  return waitFor(() => {
    const el = container.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`${selector} not shown`);
    return el;
  });
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
  document.body.innerHTML = '';
});

describe('SidePanel — X14 toast lifetimes', () => {
  it('names the New conversation Undo, and the first send closes it and the sticky toasts', async () => {
    await saveThread('https://a.test', [user('u1', 'hola'), reply('a1', 'u1')]);
    const push = vi.spyOn(toastStore, 'push');
    const close = vi.spyOn(toastStore, 'close');
    const sticky = vi.spyOn(toastStore, 'closeSticky');
    const container = await mounted();

    await fireEvent.click(await button(container, '[data-ega-new-conversation]'));
    await waitFor(() =>
      expect(
        push.mock.calls.map(([m]) => m).find((m) => m.message === 'Started a new conversation')
          ?.key,
      ).toBe('new-conversation'),
    );
    expect(close).not.toHaveBeenCalledWith('new-conversation');
    sticky.mockClear();

    await send(container, 'adios');

    expect(close).toHaveBeenCalledWith('new-conversation');
    expect(sticky).toHaveBeenCalled();
  });

  it('Try again and Regenerate close the sticky toasts', async () => {
    const sticky = vi.spyOn(toastStore, 'closeSticky');
    const container = await mounted();
    await send(container, 'hola');
    emit({
      kind: 'translate:chunk',
      chunk: { type: 'error', requestId: lastRequestId(), code: 'NETWORK', message: 'offline' },
    } as Msg);
    const retry = await button(container, '[data-ega-retry]');
    sticky.mockClear();

    await fireEvent.click(retry);
    expect(sticky).toHaveBeenCalledTimes(1);

    await settle();
    emit({
      kind: 'translate:chunk',
      chunk: { type: 'done', requestId: lastRequestId(), confidence: 0.9 },
    } as Msg);
    const regenerate = await button(container, '[data-ega-regenerate]');
    sticky.mockClear();

    await fireEvent.click(regenerate);
    expect(sticky).toHaveBeenCalledTimes(1);
  });

  it('a conversation opened from the list closes the sticky toasts', async () => {
    await saveThread('https://a.test', [user('u1', 'hola'), reply('a1', 'u1')]);
    await saveThread('https://b.test', [user('u2', 'beta'), reply('a2', 'u2')]);
    const sticky = vi.spyOn(toastStore, 'closeSticky');
    const container = await mounted();
    await fireEvent.click(await button(container, '[data-ega-header-site]'));
    const open = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-ega-conv-row="https://b.test"] [data-ega-conv-open]',
      );
      if (!el) throw new Error('row not shown');
      return el;
    });
    sticky.mockClear();

    await fireEvent.click(open);
    await waitFor(() => expect(container.textContent).toContain('beta'));
    expect(sticky).toHaveBeenCalledTimes(1);
  });

  it('a tab on another site closes the sticky toasts, and one on the same site keeps them', async () => {
    await saveThread('https://b.test', [user('u2', 'beta'), reply('a2', 'u2')]);
    const sticky = vi.spyOn(toastStore, 'closeSticky');
    const container = await mounted();
    const activated = chrome.tabs.onActivated as unknown as { emit: (i: unknown) => void };
    sticky.mockClear();

    const queried = tabsQuery.mock.calls.length;
    tabsQuery.mockResolvedValue([{ id: 3, url: 'https://a.test/other' }]);
    activated.emit({ tabId: 3, windowId: 1 });
    // The follower debounces, then reads the tab: wait for that read, so the absence below is not vacuous.
    await waitFor(() => expect(tabsQuery.mock.calls.length).toBeGreaterThan(queried));
    await settle();
    expect(sticky).not.toHaveBeenCalled();

    tabsQuery.mockResolvedValue([{ id: 2, url: 'https://b.test/page' }]);
    activated.emit({ tabId: 2, windowId: 1 });
    await waitFor(() => expect(container.textContent).toContain('beta'));
    expect(sticky).toHaveBeenCalledTimes(1);
  });
});
