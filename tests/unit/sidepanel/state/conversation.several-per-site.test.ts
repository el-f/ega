import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import {
  INDEX_KEY,
  forgetPendingDeletes,
  listConversations,
  pendingDeleteIds,
  readIndex,
  siteOf,
  threadKey,
} from '@/shared/saved-conversations';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';

const sendMessage = chrome.runtime.sendMessage as unknown as Mock;

function userTurn(turnId: string, content: string, createdAt = 1): Turn {
  return { id: turnId, role: 'user', kind: 'translate', status: 'idle', createdAt, content };
}

function lastRequestId(): string {
  const starts = sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
  const last = starts.at(-1);
  if (!last) throw new Error('no translate:start');
  return last['requestId'] as string;
}

async function sendOne(c: ReturnType<typeof createConversation>, text: string): Promise<void> {
  await c.send({
    content: text,
    kind: 'translate',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    stream: false,
  });
  c.applyChunk({ type: 'done', requestId: lastRequestId() });
  await c.flush();
}

beforeEach(() => {
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  forgetPendingDeletes();
  vi.useRealTimers();
});

describe('a thread saved before several conversations per site (C1)', () => {
  it('opens as that site’s current conversation, turns unchanged', async () => {
    const site = 'https://legacy.example';
    const turns = [userTurn('u1', 'hola', 5)];
    await saveThread(site, turns);
    const c = createConversation();
    await c.followSite(site);
    expect(c.activeId).toBe(site);
    expect(c.turns).toEqual(turns);
  });
});

describe('New conversation (C3)', () => {
  it('keeps the old one, stores nothing until the first send, then lists both', async () => {
    const site = 'https://new.example';
    await saveThread(site, [userTurn('old', 'first chat', 5)]);
    const c = createConversation();
    await c.followSite(site);
    const set = vi.spyOn(chrome.storage.local, 'set');

    const previous = await c.startNewConversation();

    expect(previous).toBe(site);
    expect(c.turns).toEqual([]);
    expect(siteOf(c.activeId)).toBe(site);
    expect(c.activeId).not.toBe(site);
    expect(JSON.stringify(set.mock.calls)).not.toContain(c.activeId);
    expect((await loadThreadResult(site)).turns.map((t) => t.id)).toEqual(['old']);

    await sendOne(c, 'second chat');
    const ids = (await readIndex()).threads.map((t) => t.origin);
    expect(ids).toContain(site);
    expect(ids).toContain(c.activeId);
  });

  it('Undo is opening the previous id again', async () => {
    const site = 'https://undo-new.example';
    await saveThread(site, [userTurn('old', 'keep me', 5)]);
    const c = createConversation();
    await c.followSite(site);
    const previous = await c.startNewConversation();
    await c.openConversation(previous);
    expect(c.turns.map((t) => t.id)).toEqual(['old']);
  });

  it('a follower event for the same site does not reload over the empty new conversation', async () => {
    const site = 'https://same-site.example';
    await saveThread(site, [userTurn('old', 'keep me', 5)]);
    const c = createConversation();
    await c.followSite(site);
    await c.startNewConversation();
    await c.followSite(site);
    expect(c.turns).toEqual([]);
  });
});

describe('which conversation a site opens (C4)', () => {
  it('opening an older one makes it current; another site opens its own', async () => {
    const site = 'https://two.example';
    const other = 'https://other.example';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
    await saveThread(other, [userTurn('o1', 'other site', 3)]);
    const c = createConversation();
    await c.followSite(site);
    await sendOne(c, 'first');
    const first = c.activeId;
    await c.startNewConversation();
    await sendOne(c, 'second');
    const second = c.activeId;
    expect(second).not.toBe(first);

    vi.setSystemTime(2_000);
    await c.openConversation(first);
    await vi.waitFor(async () => {
      const entry = (await readIndex()).threads.find((t) => t.origin === first);
      expect(entry?.openedAt).toBeDefined();
    });
    vi.setSystemTime(3_000);

    await c.followSite(other);
    expect(c.activeId).toBe(other);
    expect(c.tabSite).toBe(other);
    await c.followSite(site);
    expect(c.activeId).toBe(first);
  });

  it('a site with nothing stored opens a fresh id for that site', async () => {
    const c = createConversation();
    await c.followSite('https://empty.example');
    expect(siteOf(c.activeId)).toBe('https://empty.example');
    expect(c.turns).toEqual([]);
  });

  it('reading another site’s conversation keeps the tab site for the next send', async () => {
    const other = 'https://elsewhere.example';
    await saveThread(other, [userTurn('o1', 'over there', 3)]);
    const c = createConversation();
    await c.followSite('https://here.example');
    await c.openConversation(other);
    expect(c.activeSite).toBe(other);
    expect(c.tabSite).toBe('https://here.example');
  });
});

describe('deleteConversation (C8)', () => {
  it('waits out the Undo window, then asks the worker once', async () => {
    vi.useFakeTimers();
    const site = 'https://del.example';
    await saveThread(site, [userTurn('d1', 'bye', 3)]);
    const c = createConversation();
    await c.followSite('https://elsewhere.example');
    await c.deleteConversation(site);
    expect(pendingDeleteIds().has(site)).toBe(true);
    const deletes = (): unknown[] =>
      sendMessage.mock.calls
        .map((x) => x[0] as Record<string, unknown>)
        .filter((m) => m['kind'] === 'conversations:delete');
    expect(deletes()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(8000);
    expect(deletes()).toEqual([{ kind: 'conversations:delete', ids: [site] }]);
    expect(pendingDeleteIds().has(site)).toBe(false);
  });

  it('Undo sends nothing', async () => {
    vi.useFakeTimers();
    const c = createConversation();
    await c.followSite('https://elsewhere.example');
    const handle = await c.deleteConversation('https://keep.example');
    handle.undo();
    await vi.advanceTimersByTimeAsync(9000);
    expect(
      sendMessage.mock.calls.some(
        (x) => (x[0] as Record<string, unknown>)['kind'] === 'conversations:delete',
      ),
    ).toBe(false);
  });

  it('deleting the open conversation shows an empty one for the tab site at once', async () => {
    const site = 'https://open-del.example';
    await saveThread(site, [userTurn('d1', 'bye', 3)]);
    const c = createConversation();
    await c.followSite(site);
    await c.deleteConversation(site);
    expect(c.turns).toEqual([]);
    expect(c.activeId).not.toBe(site);
    expect(siteOf(c.activeId)).toBe(site);
  });

  it('a refused delete runs onFail and keeps the conversation', async () => {
    vi.useFakeTimers();
    sendMessage.mockImplementation((m: Record<string, unknown>) =>
      m['kind'] === 'conversations:delete'
        ? Promise.resolve({ ok: false })
        : Promise.resolve({ ok: true }),
    );
    const site = 'https://refused.example';
    await saveThread(site, [userTurn('r1', 'stay', 3)]);
    const c = createConversation();
    await c.followSite('https://elsewhere.example');
    const onFail = vi.fn();
    await c.deleteConversation(site, onFail);
    await vi.advanceTimersByTimeAsync(8000);
    expect(onFail).toHaveBeenCalledOnce();
    expect((await loadThreadResult(site)).turns.map((t) => t.id)).toEqual(['r1']);
  });
});

describe('the index lists titles (C2)', () => {
  it('backfills facts for old rows once, then writes nothing on the next list', async () => {
    const site = 'https://facts.example';
    await saveThread(site, [userTurn('f1', 'Hola, me llamo Ana\nsecond line', 7)]);
    // Simulate an index row written before the facts existed.
    const idx = await readIndex();
    await chrome.storage.local.set({
      [INDEX_KEY]: {
        version: 1,
        threads: idx.threads.map(({ origin, updatedAt, bytes }) => ({ origin, updatedAt, bytes })),
      },
    });
    const rows = await listConversations();
    expect(rows.find((r) => r.origin === site)).toMatchObject({
      title: 'Hola, me llamo Ana',
      messages: 1,
      createdAt: 7,
    });
    const set = vi.spyOn(chrome.storage.local, 'set');
    await listConversations();
    expect(set).not.toHaveBeenCalled();
    expect(await chrome.storage.local.get(threadKey(site))).toBeTruthy();
  });
});

describe('opening a conversation this build cannot read', () => {
  it('refuses it: the open conversation stays, and nothing is written over the stored one', async () => {
    const a = 'https://a.example';
    const v2 = 'https://v2.example';
    await saveThread(a, [userTurn('a1', 'hola')]);
    await saveThread(v2, [userTurn('v1', 'future chat')]);
    const key = threadKey(v2);
    const stored = (await chrome.storage.local.get(key))[key] as Record<string, unknown>;
    const newer = { ...stored, version: 99 };
    await chrome.storage.local.set({ [key]: newer });
    const c = createConversation();
    await c.followSite(a);

    expect(await c.openConversation(v2)).toBe(false);

    expect(c.activeId).toBe(a);
    expect(c.turns.map((t) => t.id)).toEqual(['a1']);
    await c.flush();
    expect((await chrome.storage.local.get(key))[key]).toEqual(newer);
  });

  it('refuses it before touching the reply that is still arriving', async () => {
    const a = 'https://a.example';
    const v2 = 'https://v2.example';
    await saveThread(a, [userTurn('a1', 'hola')]);
    await saveThread(v2, [userTurn('v1', 'future chat')]);
    const key = threadKey(v2);
    const stored = (await chrome.storage.local.get(key))[key] as Record<string, unknown>;
    await chrome.storage.local.set({ [key]: { ...stored, version: 99 } });
    const c = createConversation();
    await c.followSite(a);
    c.seedExternalImageTurn('req-live', 'https://img.example/p.png');
    const running = c.inflightId;
    expect(running).not.toBeNull();

    expect(await c.openConversation(v2)).toBe(false);

    // The reply is still this screen's: its next chunk lands here.
    expect(c.inflightId).toBe(running);
    c.applyChunk({ type: 'delta', requestId: 'req-live', text: '{"translation":"hi"}' });
    c.applyChunk({ type: 'done', requestId: 'req-live' });
    expect(c.turns.find((t) => t.id === running)?.status).toBe('done');
  });

  it('opens a readable one and says so', async () => {
    const a = 'https://a.example';
    const b = 'https://b.example';
    await saveThread(a, [userTurn('a1', 'hola')]);
    await saveThread(b, [userTurn('b1', 'salut')]);
    const c = createConversation();
    await c.followSite(a);

    expect(await c.openConversation(b)).toBe(true);
    expect(c.activeId).toBe(b);
  });
});
