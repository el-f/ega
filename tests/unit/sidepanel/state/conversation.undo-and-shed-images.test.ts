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

  describe('where a slice goes back', () => {
    const reply = (id: string, of: string, createdAt: number): Turn => ({
      id,
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      createdAt,
      content: id,
      attachedToTurnId: of,
    });
    const ids = (c: ReturnType<typeof createConversation>): string[] => c.turns.map((t) => t.id);

    it('after the reply it asks about, when the reply was undone first', async () => {
      const o = 'https://undo-order.com';
      await saveThread(o, [
        userTurn('u1', 'one', 10),
        reply('a1', 'u1', 11),
        userTurn('u2', 'two', 20),
        reply('a2', 'u2', 21),
      ]);
      const c = createConversation();
      await c.openConversation(o);
      const first = c.deleteTurn('u1');
      const second = c.deleteTurn('u2');
      expect(c.restoreTurns(first as NonNullable<typeof first>)).toBe(true);
      expect(c.restoreTurns(second as NonNullable<typeof second>)).toBe(true);
      expect(ids(c)).toEqual(['u1', 'a1', 'u2', 'a2']);
    });

    it('in its place next to a retried reply, which is newer than the messages after it', async () => {
      const o = 'https://undo-retried.com';
      await saveThread(o, [
        userTurn('u1', 'one', 10),
        reply('a1-retried', 'u1', 50),
        userTurn('u2', 'two', 20),
        reply('a2', 'u2', 21),
      ]);
      const c = createConversation();
      await c.openConversation(o);
      const slice = c.deleteTurn('u2');
      expect(c.restoreTurns(slice as NonNullable<typeof slice>)).toBe(true);
      expect(ids(c)).toEqual(['u1', 'a1-retried', 'u2', 'a2']);
    });
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

  it('a same-site reload still knows a reply is deleted: a question undone after it gets no copy back', async () => {
    const o = 'https://same-site-undo-about.com';
    const about = {
      turnId: 'a1',
      task: 'Translate',
      original: 'secret-original',
      result: 'secret-result',
    };
    await saveThread(o, [
      userTurn('u1', 'secret-original', 10),
      {
        id: 'a1',
        role: 'assistant',
        kind: 'translate',
        status: 'done',
        createdAt: 11,
        content: 'secret-result',
        attachedToTurnId: 'u1',
      },
      {
        id: 'q',
        role: 'user',
        kind: 'ask',
        status: 'idle',
        createdAt: 20,
        content: 'why?',
        about,
        dispatch: { sourceLang: 'auto', targetLang: asLangIdUnsafe('en'), stream: false },
      },
      {
        id: 'qa',
        role: 'assistant',
        kind: 'ask',
        status: 'done',
        createdAt: 21,
        content: 'because',
        attachedToTurnId: 'q',
      },
    ]);
    const c = createConversation();
    await c.openConversation(o);
    const question = c.deleteTurn('q');
    c.deleteTurn('a1');
    await c.flush();
    await c.openConversation(o);

    expect(c.restoreTurns(question as NonNullable<typeof question>)).toBe(true);
    const q = c.turns.find((t) => t.id === 'q');
    expect(q).not.toHaveProperty('about');
    expect(q?.aboutRemoved).toBe(true);
    expect(await c.regenerateVariant('qa')).toBe(true);
    expect(JSON.stringify(startCalls().at(-1))).not.toContain('secret-result');
  });
});
