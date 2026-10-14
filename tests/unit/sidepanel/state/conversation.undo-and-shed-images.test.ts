import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import { toastStore } from '@/shared/components/toastStore';
import type { Turn } from '@/sidepanel/state/conversation';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

function userTurn(id: string, content: string, createdAt: number): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt, content };
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
  vi.restoreAllMocks();
});

describe('Undo after the thread in memory was replaced', () => {
  it('does not restore into the empty thread New conversation opened', async () => {
    const o = 'https://undo-after-clear.com';
    await saveThread(o, [userTurn('t1', 'one', 10), userTurn('t2', 'two', 20)]);
    const c = createConversation();
    await c.openConversation(o);

    const slice = c.deleteTurn('t1');
    expect(slice?.removed.map((t) => t.id)).toEqual(['t1']);
    await c.startNewConversation();

    expect(c.restoreTurns(slice as NonNullable<typeof slice>)).toBe(false);
    expect(c.turns).toEqual([]);
  });

  it('does not restore into the thread a storage purge dropped', async () => {
    const o = 'https://undo-after-purge.com';
    await saveThread(o, [userTurn('t1', 'one', 10)]);
    const c = createConversation();
    await c.openConversation(o);

    const slice = c.deleteTurn('t1');
    c.resetAfterPurge();

    expect(c.restoreTurns(slice as NonNullable<typeof slice>)).toBe(false);
    expect(c.turns).toEqual([]);
  });

  it('does not restore into the same origin after it was reloaded', async () => {
    const o = 'https://undo-after-reload.com';
    await saveThread(o, [userTurn('t1', 'one', 10), userTurn('t2', 'two', 20)]);
    const c = createConversation();
    await c.openConversation(o);
    const slice = c.deleteTurn('t1');
    await c.flush();

    // The panel followed the tab away and back: the thread is re-read from storage.
    await c.openConversation('https://elsewhere.com');
    await c.openConversation(o);

    expect(c.restoreTurns(slice as NonNullable<typeof slice>)).toBe(false);
    expect(c.turns.map((t) => t.id)).toEqual(['t2']);
  });

  it('still restores while the thread is the one the delete came from', async () => {
    const o = 'https://undo-ok.com';
    await saveThread(o, [userTurn('t1', 'one', 10), userTurn('t2', 'two', 20)]);
    const c = createConversation();
    await c.openConversation(o);
    const slice = c.deleteTurn('t1');
    expect(c.restoreTurns(slice as NonNullable<typeof slice>)).toBe(true);
    expect(c.turns.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

describe('a save that only fit without images', () => {
  it('drops the images from memory too and says so once', async () => {
    const o = 'https://shed-memory.com';
    const img = 'data:image/png;base64,' + 'A'.repeat(1024);
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const c = createConversation();
    await c.openConversation(o);
    c.seedDeliveredTurn({
      kind: 'image-translate',
      sourceText: '[image]',
      response: 'hello',
      imageDataUrl: img,
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: false,
    });
    expect(c.turns[0]?.imageDataUrl).toBe(img);

    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      const keys = Object.keys(items as Record<string, unknown>);
      // A write that still holds the image never fits; a text-only one always does.
      if (keys.some((k) => k.startsWith('ega:conv:t:')) && JSON.stringify(items).includes(img)) {
        return Promise.reject(new Error('QUOTA_BYTES exceeded'));
      }
      return originalSet(items as Record<string, unknown>);
    });

    await c.flush();
    expect(c.turns[0]?.imageDataUrl).toBeUndefined();
    expect(c.turns[0]?.content).toBe('[image]');
    expect(c.saveFailed).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0]).toMatchObject({ variant: 'warning' });

    // The next save is text-only and fits first time: no second toast, no second shed.
    await c.flush();
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('retry keeps the explanation the seed carried', () => {
  it('the replacement assistant turn still has explain after a retryable failure', async () => {
    const c = createConversation();
    const assistantId = await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
      explain: 'A greeting.',
    });
    expect(c.turns.find((t) => t.id === assistantId)?.explain).toBe('A greeting.');
    const requestId = startCalls()[0]?.['requestId'] as string;
    c.applyChunk({ type: 'error', requestId, code: 'SERVER', message: 'boom' } as never);

    await c.retry(assistantId);

    const replacement = c.turns.find((t) => t.role === 'assistant');
    expect(replacement?.id).not.toBe(assistantId);
    expect(replacement?.explain).toBe('A greeting.');
  });
});

describe('a shed image drops its dispatch, a reload keeps Undo', () => {
  it('a shed image takes the dispatch with it, so nothing can replay the bare placeholder', async () => {
    const o = 'https://shed-dispatch.com';
    const img = 'data:image/png;base64,' + 'A'.repeat(1024);
    vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const c = createConversation();
    await c.openConversation(o);
    c.seedDeliveredTurn({
      kind: 'image-translate',
      sourceText: '[image]',
      response: 'hello',
      imageDataUrl: img,
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: false,
    });
    expect(c.turns[0]?.dispatch).toBeDefined();
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      const keys = Object.keys(items as Record<string, unknown>);
      if (keys.some((k) => k.startsWith('ega:conv:t:')) && JSON.stringify(items).includes(img)) {
        return Promise.reject(new Error('QUOTA_BYTES exceeded'));
      }
      return originalSet(items as Record<string, unknown>);
    });
    await c.flush();
    expect(c.turns[0]?.imageDataUrl).toBeUndefined();
    expect(c.turns[0]?.dispatch).toBeUndefined();
  });

  it('a same-site reload keeps Undo for a delete that emptied the thread', async () => {
    const o = 'https://same-site-undo.com';
    await saveThread(o, [userTurn('t1', 'only', 10)]);
    const c = createConversation();
    await c.openConversation(o);
    const slice = c.deleteTurn('t1');
    expect(c.turns).toEqual([]);
    // The tab follower re-fires the same origin after an in-site navigation; the thread is empty, so it reloads.
    await c.openConversation(o);

    expect(c.restoreTurns(slice as NonNullable<typeof slice>)).toBe(true);
    expect(c.turns.map((t) => t.id)).toEqual(['t1']);
  });
});
