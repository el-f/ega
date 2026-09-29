import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';

type Container = ReturnType<typeof createConversation>;
type Changes = Record<string, chrome.storage.StorageChange>;

const EN = asLangIdUnsafe('en');
const ORIGIN = 'https://two-windows.test';

/** The message the router would answer; the last `translate:start` is the one whose chunks route. */
function requestIdOf(content: string): string {
  const starts = (chrome.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start' && m['text'] === content);
  const last = starts[starts.length - 1];
  if (!last) throw new Error(`no translate:start for ${content}`);
  return last['requestId'] as string;
}

async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** One side-panel window: its own container on the storage both windows share. */
async function openWindow(opts: Parameters<typeof createConversation>[0] = {}): Promise<Container> {
  const c = createConversation(opts);
  const listener = (changes: Changes, area: string): void => {
    if (area === 'local') c.onStorageChanged(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  listeners.push(listener);
  await c.setActiveOrigin(ORIGIN);
  return c;
}

const listeners: Array<(changes: Changes, area: string) => void> = [];

async function sendAndFinish(c: Container, content: string, answer: string): Promise<string> {
  const assistantId = await c.send({
    content,
    kind: 'translate',
    sourceLang: 'auto',
    targetLang: EN,
    stream: true,
  });
  const requestId = requestIdOf(content);
  c.applyChunk({ type: 'delta', requestId, text: `{"translation":"${answer}"}` });
  c.applyChunk({ type: 'done', requestId, confidence: 1 });
  await c.flush();
  await drain();
  return assistantId;
}

function byId(c: Container, id: string): Turn | undefined {
  return c.turns.find((t) => t.id === id);
}

beforeEach(() => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  for (const l of listeners) chrome.storage.onChanged.removeListener(l);
  listeners.length = 0;
});

describe('two side-panel windows on one origin', () => {
  it('a finished answer in window A appears in window B without a reload', async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'hola', 'hello');

    expect(b.turns.map((t) => t.content)).toEqual(['hola', 'hello']);
    expect(byId(b, assistantId)?.status).toBe('done');
    // B now knows the turns, so its next save carries them instead of dropping them as foreign.
    b.toggleBookmark(assistantId);
    await drain();
    expect(
      (await loadThreadResult(ORIGIN)).turns.map((t) => [t.content, t.bookmarked ?? false]),
    ).toEqual([
      ['hola', false],
      ['hello', true],
    ]);
  });

  it("window A's own save does not double its turns", async () => {
    const a = await openWindow();
    await sendAndFinish(a, 'uno', 'one');
    expect(a.turns).toHaveLength(2);
  });

  it('A finishes a turn while B is mid-stream on another: B keeps its stream and gains the answer', async () => {
    const a = await openWindow();
    const b = await openWindow();
    const bAssistant = await b.send({
      content: 'b-q',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    const bRequest = requestIdOf('b-q');
    b.applyChunk({ type: 'delta', requestId: bRequest, text: '{"translation":"b-half' });
    await b.flush();

    const aAssistant = await sendAndFinish(a, 'a-q', 'a-done');

    expect(b.inflightId).toBe(bAssistant);
    expect(byId(b, bAssistant)?.status).toBe('streaming');
    expect(byId(b, bAssistant)?.content).toBe('b-half');
    expect(byId(b, aAssistant)?.status).toBe('done');
    expect(byId(b, aAssistant)?.content).toBe('a-done');

    b.applyChunk({ type: 'delta', requestId: bRequest, text: '"}' });
    b.applyChunk({ type: 'done', requestId: bRequest, confidence: 1 });
    await drain();
    const stored = (await loadThreadResult(ORIGIN)).turns;
    expect(stored.find((t) => t.id === aAssistant)?.status).toBe('done');
    expect(stored.find((t) => t.id === bAssistant)?.status).toBe('done');
    expect(stored.find((t) => t.id === bAssistant)?.content).toBe('b-half');
  });

  it("B's stale interrupted copy is replaced by A's finished answer, and B's next save keeps it", async () => {
    const a = await openWindow();
    const assistantId = await a.send({
      content: 'slow',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    await a.flush();
    // B opens on the pending copy and stamps it interrupted.
    const b = await openWindow();
    expect(byId(b, assistantId)?.error?.code).toBe('interrupted');

    const requestId = requestIdOf('slow');
    a.applyChunk({ type: 'delta', requestId, text: '{"translation":"finished"}' });
    a.applyChunk({ type: 'done', requestId, confidence: 1 });
    await drain();

    expect(byId(b, assistantId)?.status).toBe('done');
    expect(byId(b, assistantId)?.content).toBe('finished');
    b.toggleBookmark(assistantId);
    await drain();
    expect((await loadThreadResult(ORIGIN)).turns.find((t) => t.id === assistantId)?.status).toBe(
      'done',
    );
  });

  it("A's delete removes the pair from B", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'gone', 'answer');
    expect(b.turns).toHaveLength(2);

    a.deleteTurn(assistantId);
    await drain();

    expect(b.turns).toHaveLength(0);
    // B's next save must not write the pair back.
    await sendAndFinish(b, 'after', 'later');
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.content)).toEqual([
      'after',
      'later',
    ]);
  });

  it('a write for another origin is ignored', async () => {
    const b = await openWindow();
    await saveThread('https://elsewhere.test', [
      { id: 'x', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'other' },
    ]);
    await drain();
    expect(b.turns).toHaveLength(0);
  });

  it('a write that lands while B switches origin does not reach the new thread', async () => {
    const a = await openWindow();
    const b = await openWindow();
    let release = (): void => {};
    const gate = new Promise<void>((r) => (release = r));
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const stalled = vi.spyOn(chrome.storage.local, 'get').mockImplementation((async (
      arg: unknown,
    ) => {
      if (arg === 'ega:conv:t:https://next.test') await gate;
      return await (original as (a: unknown) => Promise<Record<string, unknown>>)(arg);
    }) as typeof chrome.storage.local.get);
    const switching = b.setActiveOrigin('https://next.test');
    await vi.waitFor(() => expect(stalled).toHaveBeenCalled());

    await sendAndFinish(a, 'while-switching', 'landed');
    release();
    await switching;
    await drain();
    stalled.mockRestore();

    expect(b.activeOrigin).toBe('https://next.test');
    expect(b.turns).toEqual([]);
  });
});

/** Every `translate:cancel` this test file has seen, for asserting a stream really was stopped. */
function cancelledRequests(): string[] {
  return (chrome.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:cancel')
    .map((m) => m['requestId'] as string);
}

async function sendAndFail(c: Container, content: string): Promise<string> {
  const assistantId = await c.send({
    content,
    kind: 'translate',
    sourceLang: 'auto',
    targetLang: EN,
    stream: true,
  });
  c.applyChunk({
    type: 'error',
    requestId: requestIdOf(content),
    code: 'NETWORK',
    message: 'fetch failed',
  });
  await drain();
  return assistantId;
}

describe('two windows re-reading each other over one storage', () => {
  it('a pending turn adopted from A is replaced by the answer A finishes', async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await a.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    await a.flush();
    await drain();
    expect(byId(b, assistantId)?.status).toBe('pending');

    const requestId = requestIdOf('hola');
    a.applyChunk({ type: 'delta', requestId, text: '{"translation":"hello"}' });
    a.applyChunk({ type: 'done', requestId, confidence: 1 });
    await drain();

    expect(byId(b, assistantId)?.status).toBe('done');
    expect(byId(b, assistantId)?.content).toBe('hello');
  });

  it("B's delete then B's undo survives A's next save", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'gone', 'answer');
    await drain();
    expect(b.turns).toHaveLength(2);

    const slice = b.deleteTurn(assistantId);
    await drain();
    expect(a.turns).toHaveLength(0);

    if (slice === null) throw new Error('deleteTurn returned no slice');
    expect(b.restoreTurns(slice)).toBe(true);
    await drain();
    expect(a.turns.map((t) => t.content)).toEqual(['gone', 'answer']);

    a.toggleBookmark(assistantId);
    await drain();
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.content)).toEqual([
      'gone',
      'answer',
    ]);
  }, 20_000);

  it("B's delete of the turn A streams into cancels A's request", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await a.send({
      content: 'slow',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    const requestId = requestIdOf('slow');
    await a.flush();
    await drain();
    expect(byId(b, assistantId)).toBeDefined();

    b.deleteTurn(assistantId);
    await drain();

    expect(byId(a, assistantId)).toBeUndefined();
    expect(a.inflightId).toBeNull();
    expect(cancelledRequests()).toContain(requestId);
  });

  it("A's retry buries the failed turn, so B does not resurrect it", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFail(a, 'boom');
    expect(byId(b, assistantId)?.status).toBe('error');

    await a.retry(assistantId);
    await a.flush();
    await drain();

    expect(b.turns.map((t) => t.id)).not.toContain(assistantId);
    expect(b.turns).toHaveLength(2);

    b.toggleBookmark(b.turns[0]?.id ?? '');
    await drain();
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.id)).not.toContain(assistantId);
  }, 20_000);

  it('a stored pending copy does not replace a settled turn in this window', async () => {
    const a = await openWindow();
    const assistantId = await sendAndFail(a, 'fails');
    expect(byId(a, assistantId)?.status).toBe('error');

    // The other window still holds the mid-stream copy and saves it over the settled one.
    const stored = (await loadThreadResult(ORIGIN)).turns;
    await saveThread(
      ORIGIN,
      stored.map((t) =>
        t.id === assistantId ? { ...t, status: 'pending' as const, content: '' } : t,
      ),
      { knownIds: new Set(stored.map((t) => t.id)), writer: 'other-window' },
    );
    await drain();

    expect(byId(a, assistantId)?.status).toBe('error');
    expect(byId(a, assistantId)?.error?.code).toBe('NETWORK');
  });

  it("B's undo of its own delete does not shield the turn from A's later delete", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'gone', 'answer');
    await drain();

    const slice = b.deleteTurn(assistantId);
    await drain();
    if (slice === null) throw new Error('deleteTurn returned no slice');
    expect(b.restoreTurns(slice)).toBe(true);
    await drain();
    expect(a.turns).toHaveLength(2);

    a.deleteTurn(assistantId);
    await drain();

    expect(b.turns).toHaveLength(0);
    // B's next save must not write the pair back over A's fresh tombstones.
    await sendAndFinish(b, 'after', 'later');
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.content)).toEqual([
      'after',
      'later',
    ]);
  }, 20_000);

  it("B's undo answers only B's own delete, so A's separate delete of the same pair stands", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'gone', 'answer');
    await drain();
    expect(b.turns).toHaveLength(2);

    // Distinct stamps for two clicks the same millisecond would otherwise share.
    let clock = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10));
    // Neither delete has been written yet, so B still holds the pair when it deletes.
    a.deleteTurn(assistantId);
    const slice = b.deleteTurn(assistantId);
    if (slice === null) throw new Error('deleteTurn returned no slice');
    expect(b.restoreTurns(slice)).toBe(true);
    await drain();
    nowSpy.mockRestore();

    expect((await loadThreadResult(ORIGIN)).turns).toEqual([]);
    // B's next save must not carry the pair back in either.
    await sendAndFinish(b, 'after', 'later');
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.content)).toEqual([
      'after',
      'later',
    ]);
  }, 20_000);

  it('an Undo the tombstones refuse takes the pair off the screen too', async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'gone', 'answer');
    await drain();
    expect(b.turns).toHaveLength(2);

    // Distinct stamps for two clicks the same millisecond would otherwise share.
    let clock = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10));
    const slice = b.deleteTurn(assistantId);
    if (slice === null) throw new Error('deleteTurn returned no slice');
    a.deleteTurn(assistantId);
    // B takes A's delete first, so only A's stamp is left when B undoes its own.
    await drain();
    expect(b.restoreTurns(slice)).toBe(true);
    await drain();
    nowSpy.mockRestore();

    expect((await loadThreadResult(ORIGIN)).turns).toEqual([]);
    expect(b.turns).toHaveLength(0);
  }, 20_000);

  it("a refused Undo lets the other window's Undo bring the pair back", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'gone', 'answer');
    await drain();

    let clock = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10));
    const bSlice = b.deleteTurn(assistantId);
    if (bSlice === null) throw new Error('deleteTurn returned no slice');
    const aSlice = a.deleteTurn(assistantId);
    if (aSlice === null) throw new Error('deleteTurn returned no slice');
    await drain();
    expect(b.restoreTurns(bSlice)).toBe(true);
    await drain();
    expect(a.restoreTurns(aSlice)).toBe(true);
    await drain();
    nowSpy.mockRestore();

    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.content)).toEqual([
      'gone',
      'answer',
    ]);
    expect(b.turns.map((t) => t.content)).toEqual(['gone', 'answer']);
  });

  it('an Undo taken while the delete still waits for the write lock restores the pair in storage', async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'keep', 'answer');
    await drain();
    expect(b.turns).toHaveLength(2);

    // A holds the shared write lock, so B's delete cannot stamp anything until it is released.
    let release = (): void => {};
    const gate = new Promise<void>((r) => (release = r));
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const stalled = vi.spyOn(chrome.storage.local, 'get').mockImplementation((async (
      arg: unknown,
    ) => {
      if (arg === `ega:conv:t:${ORIGIN}`) await gate;
      return await (original as (a: unknown) => Promise<Record<string, unknown>>)(arg);
    }) as typeof chrome.storage.local.get);
    a.toggleBookmark(assistantId);
    await vi.waitFor(() => expect(stalled).toHaveBeenCalled());

    const slice = b.deleteTurn(assistantId);
    if (slice === null) throw new Error('deleteTurn returned no slice');
    expect(b.restoreTurns(slice)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    release();
    stalled.mockRestore();
    await b.flush();
    await drain();

    expect(b.turns).toHaveLength(2);
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.content)).toEqual([
      'keep',
      'answer',
    ]);
  }, 20_000);

  it('a delete that lands while B switches origin does not follow B to the new thread', async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await sendAndFinish(a, 'here', 'answer');
    await drain();
    expect(b.turns).toHaveLength(2);

    let release = (): void => {};
    const gate = new Promise<void>((r) => (release = r));
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const stalled = vi.spyOn(chrome.storage.local, 'get').mockImplementation((async (
      arg: unknown,
    ) => {
      if (arg === 'ega:conv:t:https://after.test') await gate;
      return await (original as (a: unknown) => Promise<Record<string, unknown>>)(arg);
    }) as typeof chrome.storage.local.get);
    const switching = b.setActiveOrigin('https://after.test');
    await vi.waitFor(() => expect(stalled).toHaveBeenCalled());

    a.deleteTurn(assistantId);
    await drain();
    release();
    await switching;
    await drain();
    stalled.mockRestore();

    await sendAndFinish(b, 'fresh', 'reply');
    expect((await loadThreadResult('https://after.test')).turns.map((t) => t.content)).toEqual([
      'fresh',
      'reply',
    ]);
  });
});
