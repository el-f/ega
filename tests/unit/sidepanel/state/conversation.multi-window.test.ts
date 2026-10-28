import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import {
  loadThreadResult,
  MAX_TURNS_PER_THREAD,
  saveThread,
} from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import { askedAboutFor, linkedQuote } from '@/sidepanel/state/thread-view';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
import type { Turn } from '@/sidepanel/state/conversation';
import { toastStore } from '@/shared/components/toastStore';

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
  await c.openConversation(ORIGIN);
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
  c.applyChunk({ type: 'delta', requestId, text: answer });
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
  vi.useRealTimers();
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
    b.applyChunk({ type: 'delta', requestId: bRequest, text: 'b-half' });
    await b.flush();

    const aAssistant = await sendAndFinish(a, 'a-q', 'a-done');

    expect(b.inflightId).toBe(bAssistant);
    expect(byId(b, bAssistant)?.status).toBe('streaming');
    expect(byId(b, bAssistant)?.content).toBe('b-half');
    expect(byId(b, aAssistant)?.status).toBe('done');
    expect(byId(b, aAssistant)?.content).toBe('a-done');

    b.applyChunk({ type: 'delta', requestId: bRequest, text: '' });
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
    a.applyChunk({ type: 'delta', requestId, text: 'finished' });
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
    const switching = b.openConversation('https://next.test');
    await vi.waitFor(() => expect(stalled).toHaveBeenCalled());

    await sendAndFinish(a, 'while-switching', 'landed');
    release();
    await switching;
    await drain();
    stalled.mockRestore();

    expect(b.activeId).toBe('https://next.test');
    expect(b.turns).toEqual([]);
  });
});

/** Every `translate:cancel` this test file has seen, for asserting a stream really was stopped. */
function startsSent(): number {
  return (chrome.runtime.sendMessage as Mock).mock.calls.filter(
    (c) => (c[0] as Record<string, unknown>)['kind'] === 'translate:start',
  ).length;
}

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
    a.applyChunk({ type: 'delta', requestId, text: 'hello' });
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

  it("A's retry of an old failed link, answered in the panel, also stays buried in B", async () => {
    const link = 'https://example.com/docs?id=42';
    await saveThread(ORIGIN, [
      {
        id: 'u1',
        role: 'user',
        kind: 'translate',
        status: 'idle',
        createdAt: 1,
        content: link,
        dispatch: { sourceLang: 'auto', targetLang: EN, stream: true },
      },
      {
        id: 'a1',
        role: 'assistant',
        kind: 'translate',
        status: 'error',
        createdAt: 2,
        content: '',
        attachedToTurnId: 'u1',
        error: { code: 'NETWORK', message: 'offline' },
      },
    ]);
    const a = await openWindow();
    const b = await openWindow();
    expect(byId(b, 'a1')?.status).toBe('error');

    const started = await a.retry('a1');
    await a.flush();
    await drain();

    // Positive control: the local answer reached B, so the next save is B's merge, not a no-op.
    expect(started && byId(b, started.turnId)?.content).toBe(link);
    b.toggleBookmark('u1');
    await b.flush();
    await drain();
    expect(b.turns.map((t) => t.id)).not.toContain('a1');
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.id)).toEqual([
      'u1',
      started?.turnId,
    ]);
  }, 20_000);

  it("A's retry of an earlier answer keeps it under its question in B, and in B's save", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const first = await sendAndFail(a, 'one');
    await sendAndFinish(a, 'two', 'dos');
    // Another turn's stamp must differ from the retry's, or the order is right by chance.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 1000);

    const started = await a.retry(first);
    if (started === null) throw new Error('retry started nothing');
    a.applyChunk({ type: 'delta', requestId: requestIdOf('one'), text: 'RETRIED' });
    a.applyChunk({ type: 'done', requestId: requestIdOf('one'), confidence: 1 });
    await a.flush();
    await drain();

    const order = ['one', 'RETRIED', 'two', 'dos'];
    expect(a.turns.map((t) => t.content)).toEqual(order);
    expect(b.turns.map((t) => t.content)).toEqual(order);
    b.toggleBookmark(started.turnId);
    await drain();
    expect((await loadThreadResult(ORIGIN)).turns.map((t) => t.content)).toEqual(order);
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
        t.id === assistantId && t.role === 'assistant'
          ? { ...t, status: 'pending' as const, content: '' }
          : t,
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
    // Both writes are queued behind A's held lock before it opens.
    await drain();
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
    const switching = b.openConversation('https://after.test');
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

/** The first read of `key` takes its snapshot at once and answers only on release, so a write
 *  can land after the load read storage but before it applied what it read. */
function stallFirstReadAfterSnapshot(key: string): { release: () => void } {
  let release = (): void => {};
  const gate = new Promise<void>((r) => (release = r));
  const original = chrome.storage.local.get.bind(chrome.storage.local);
  let stalled = false;
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(chrome.storage.local, 'get').mockImplementation((async (arg: unknown) => {
    const read = (original as (a: unknown) => Promise<Record<string, unknown>>)(arg);
    if (arg === key && !stalled) {
      stalled = true;
      const snapshot = await read;
      await gate;
      return snapshot;
    }
    return await read;
  }) as typeof chrome.storage.local.get);
  return { release: () => release() };
}

describe('a write that lands while the panel loads the thread it is writing to', () => {
  afterEach(() => vi.restoreAllMocks());

  it("a same-origin reload still takes the other window's new turn", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const gate = stallFirstReadAfterSnapshot(`ega:conv:t:${ORIGIN}`);
    // B's thread is empty, so the tab follower's repeat of the same origin reloads it.
    const reloading = b.openConversation(ORIGIN);
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalled());

    await sendAndFinish(a, 'late', 'arrival');
    gate.release();
    await reloading;
    await drain();

    expect(b.turns.map((t) => t.content)).toEqual(['late', 'arrival']);
  });

  it('a switch to another origin still takes a write to that origin made mid-load', async () => {
    const next = 'https://next-site.test';
    const b = await openWindow();
    const gate = stallFirstReadAfterSnapshot(`ega:conv:t:${next}`);
    const switching = b.openConversation(next);
    await vi.waitFor(() =>
      expect(chrome.storage.local.get).toHaveBeenCalledWith(`ega:conv:t:${next}`),
    );

    await saveThread(
      next,
      [{ id: 'n1', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'hi' }],
      { knownIds: new Set(), writer: 'other-window' },
    );
    gate.release();
    await switching;
    await drain();

    expect(b.turns.map((t) => t.content)).toEqual(['hi']);
  });
});

describe('an answer adopted from a window that went away', () => {
  // The watcher is a timer against Date.now(), so a fake clock steps past each budget with no real wait.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  /** drain() on the fake clock: every queued save and storage event lands. */
  const settle = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(20);
  };

  it('turns retryable once the reply budget has passed with no answer', async () => {
    const a = await openWindow();
    // The watcher waits two budgets: a request parked behind a duplicate runs after its leader.
    const b = await openWindow({ stallMs: () => 500 });
    const assistantId = await a.send({
      content: 'orphan',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    await a.flush();
    await settle();
    expect(byId(b, assistantId)?.status).toBe('pending');

    // A's window closed: no chunk and no terminal save ever arrive.
    await vi.advanceTimersByTimeAsync(1300);

    expect(byId(b, assistantId)?.status).toBe('error');
    expect(byId(b, assistantId)?.error?.code).toBe('interrupted');
  });

  it('stays pending past one budget, so a request parked behind a duplicate is not stamped', async () => {
    const a = await openWindow();
    const b = await openWindow({ stallMs: () => 1000 });
    const assistantId = await a.send({
      content: 'alive',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    await a.flush();
    await settle();
    await vi.advanceTimersByTimeAsync(1100);
    expect(byId(b, assistantId)?.status).toBe('pending');

    const requestId = requestIdOf('alive');
    a.applyChunk({ type: 'delta', requestId, text: 'live' });
    a.applyChunk({ type: 'done', requestId, confidence: 1 });
    await settle();
    await vi.advanceTimersByTimeAsync(1000);

    expect(byId(b, assistantId)?.status).toBe('done');
    expect(byId(b, assistantId)?.content).toBe('live');
  });
});

describe('a reply that a question asks about, removed in another window or by the cap', () => {
  /** This window's last `translate:start` options: what its last re-run sent. */
  function lastStartOptions(): Record<string, unknown> {
    const starts = (chrome.runtime.sendMessage as Mock).mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((m) => m['kind'] === 'translate:start');
    return (starts.at(-1)?.['options'] ?? {}) as Record<string, unknown>;
  }
  const LABELS = { views: SHIPPED_TASK_VIEWS, varieties: [] };

  it('another window’s delete reaches the "Ask instead" version this window streams: its re-run sends nothing of the reply', async () => {
    const a = await openWindow();
    const b = await openWindow();
    const e = await sendAndFinish(a, 'secret-original', 'secret-result');
    const t = await sendAndFinish(a, 'what does it mean', 'what does it mean');
    expect(await a.taskVariant(t, 'ask', { turnId: e })).not.toBeNull();
    const requestId = (chrome.runtime.sendMessage as Mock).mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((m) => m['kind'] === 'translate:start')
      .at(-1)?.['requestId'] as string;
    a.applyChunk({ type: 'delta', requestId, text: 'It asks' });
    await a.flush();
    await drain();

    b.deleteTurn(e);
    await drain();
    a.applyChunk({ type: 'done', requestId, confidence: 1 });
    await a.flush();
    await drain();

    expect(JSON.stringify((await loadThreadResult(ORIGIN)).turns)).not.toContain('secret-result');
    expect(byId(a, t)?.variants?.at(-1)?.about).toEqual({ turnId: e });
    expect(await a.regenerateVariant(t)).toBe(true);
    expect(JSON.stringify(lastStartOptions())).not.toContain('secret-result');
  });

  it('a window that saves before it hears of the delete stores no text of the reply, and Undo brings the quote back there', async () => {
    const a = await openWindow();
    // Window B hears storage late: its save runs before A's delete reaches it.
    let late = false;
    const held: Changes[] = [];
    const b = createConversation();
    const listener = (changes: Changes, area: string): void => {
      if (area !== 'local') return;
      if (late) held.push(changes);
      else b.onStorageChanged(changes);
    };
    chrome.storage.onChanged.addListener(listener);
    listeners.push(listener);
    await b.openConversation(ORIGIN);

    const e = await sendAndFinish(a, 'secret-original', 'secret-result');
    const answer = await a.send({
      content: 'why?',
      kind: 'ask',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
      about: { turnId: e },
    });
    const requestId = requestIdOf('why?');
    a.applyChunk({ type: 'delta', requestId, text: 'Because.' });
    a.applyChunk({ type: 'done', requestId, confidence: 1 });
    await a.flush();
    await drain();
    const questionId = byId(a, answer)?.attachedToTurnId ?? '';

    late = true;
    const slice = a.deleteTurn(e);
    await drain();
    b.toggleBookmark(answer);
    await b.flush();
    await drain();

    const stored = (await loadThreadResult(ORIGIN)).turns;
    // B's write landed (its bookmark is stored), and the deleted reply is nowhere in it.
    expect(stored.find((t) => t.id === answer)?.bookmarked).toBe(true);
    expect(stored.some((t) => t.id === e)).toBe(false);
    expect(JSON.stringify(stored)).not.toContain('secret-result');

    late = false;
    for (const changes of held.splice(0)) b.onStorageChanged(changes);
    await drain();
    const question = byId(b, questionId) as Turn;
    expect(byId(b, e)).toBeUndefined();
    // R2-27: the bubble renders a gone reply as a plain question, with no quote.
    expect(linkedQuote(question, b.turns)).toBeUndefined();
    expect(askedAboutFor(b.turns, byId(b, answer) as Turn, LABELS)).toBe('gone');
    (chrome.runtime.sendMessage as Mock).mockClear();
    expect(await b.regenerateVariant(answer)).toBe(true);
    expect(JSON.stringify(lastStartOptions())).not.toContain('secret-result');
    b.cancel();
    await drain();

    if (slice === null) throw new Error('nothing deleted');
    expect(a.restoreTurns(slice)).toBe(true);
    await a.flush();
    await drain();
    expect(byId(b, e)?.content).toBe('secret-result');
    expect(linkedQuote(byId(b, questionId) as Turn, b.turns)?.text).toBe('secret-result');
  });

  /** 150 exchanges, the cap exactly; the sixth message asks about the first reply. */
  function atTheCap(): Turn[] {
    return Array.from({ length: MAX_TURNS_PER_THREAD / 2 }, (_, i) => {
      const asks = i === 5;
      return [
        {
          id: `u${i}`,
          role: 'user',
          kind: asks ? 'ask' : 'translate',
          status: 'idle',
          createdAt: 2 * i + 1,
          content: asks ? 'why?' : `text ${i}`,
          dispatch: { sourceLang: 'auto', targetLang: EN, stream: true },
          ...(asks ? { about: { turnId: 'a0' } } : {}),
        },
        {
          id: `a${i}`,
          role: 'assistant',
          kind: asks ? 'ask' : 'translate',
          status: 'done',
          createdAt: 2 * i + 2,
          content: `reply ${i}`,
          attachedToTurnId: `u${i}`,
        },
      ] as Turn[];
    }).flat();
  }

  it('a question whose reply the 300-message cap drops sends nothing of it, and keeps its reference', async () => {
    await saveThread(ORIGIN, atTheCap());
    const a = await openWindow();
    (chrome.runtime.sendMessage as Mock).mockClear();
    expect(await a.regenerateVariant('a5')).toBe(true);
    expect(lastStartOptions()['askAbout']).toMatchObject({ result: 'reply 0' });
    a.cancel();
    await drain();

    await sendAndFinish(a, 'from a', 'a answer');
    expect(byId(a, 'a0')).toBeUndefined();
    expect(byId(a, 'u5')?.about).toEqual({ turnId: 'a0' });
    expect(await a.regenerateVariant('a5')).toBe(true);
    expect(lastStartOptions()).not.toHaveProperty('askAbout');
    expect(JSON.stringify(lastStartOptions())).not.toContain('reply 0');
  });

  it('a question sent at the cap carries the reply its own send trims, and About then says the reply is gone', async () => {
    await saveThread(ORIGIN, atTheCap());
    const a = await openWindow();
    (chrome.runtime.sendMessage as Mock).mockClear();
    const answer = await a.send({
      content: 'and the first one?',
      kind: 'ask',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
      about: { turnId: 'a0' },
    });
    expect(lastStartOptions()['askAbout']).toMatchObject({ result: 'reply 0' });
    const requestId = requestIdOf('and the first one?');
    a.applyChunk({ type: 'delta', requestId, text: 'Because.' });
    a.applyChunk({ type: 'done', requestId, confidence: 1 });
    await a.flush();
    await drain();

    expect(byId(a, 'a0')).toBeUndefined();
    expect(askedAboutFor(a.turns, byId(a, answer) as Turn, LABELS)).toBe('gone');
  });

  it('a reply the store trims when a handed-off exchange lands leaves this window too: no quote, nothing sent', async () => {
    await saveThread(ORIGIN, atTheCap());
    const a = await openWindow();
    a.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'from the page',
      response: 'page answer',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    await a.flush();
    await drain();

    expect((await loadThreadResult(ORIGIN)).turns.some((t) => t.id === 'a0')).toBe(false);
    expect(byId(a, 'a0')).toBeUndefined();
    expect(linkedQuote(byId(a, 'u5') as Turn, a.turns)).toBeUndefined();
    (chrome.runtime.sendMessage as Mock).mockClear();
    expect(await a.regenerateVariant('a5')).toBe(true);
    expect(lastStartOptions()).not.toHaveProperty('askAbout');
    expect(JSON.stringify(lastStartOptions())).not.toContain('reply 0');
  });

  it('a reply the store trims in one window leaves the other at once: no quote, nothing sent', async () => {
    await saveThread(ORIGIN, atTheCap());
    const a = await openWindow();
    const b = await openWindow();
    a.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'from the page',
      response: 'page answer',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    await a.flush();
    await drain();

    expect(byId(b, 'a0')).toBeUndefined();
    expect(linkedQuote(byId(b, 'u5') as Turn, b.turns)).toBeUndefined();
    (chrome.runtime.sendMessage as Mock).mockClear();
    expect(await b.regenerateVariant('a5')).toBe(true);
    expect(lastStartOptions()).not.toHaveProperty('askAbout');
    expect(JSON.stringify(lastStartOptions())).not.toContain('reply 0');
  });

  it('a reply a send at the cap trims leaves the other window too, which never writes it back', async () => {
    await saveThread(ORIGIN, atTheCap());
    const a = await openWindow();
    const b = await openWindow();
    await sendAndFinish(a, 'from a', 'a answer');

    expect(byId(b, 'a0')).toBeUndefined();
    expect(linkedQuote(byId(b, 'u5') as Turn, b.turns)).toBeUndefined();
    // Back under the cap, a save from B would write back any trimmed reply it still held.
    a.deleteTurn('a10');
    await a.flush();
    await drain();
    b.toggleBookmark('a20');
    await b.flush();
    await drain();
    expect((await loadThreadResult(ORIGIN)).turns.some((t) => t.id === 'a0')).toBe(false);
    const reloaded = await openWindow();
    expect(byId(reloaded, 'a0')).toBeUndefined();

    (chrome.runtime.sendMessage as Mock).mockClear();
    expect(await b.regenerateVariant('a5')).toBe(true);
    expect(lastStartOptions()).not.toHaveProperty('askAbout');
    expect(JSON.stringify(lastStartOptions())).not.toContain('reply 0');
  });

  it("a save that read the thread before this window's own trim says nothing of another window", async () => {
    const push = vi.spyOn(toastStore, 'push');
    await saveThread(ORIGIN, atTheCap());
    const a = await openWindow();
    a.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'from the page',
      response: 'page answer',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    // Reads the thread while the handoff's own save, which trims it, still waits.
    await a.flush();
    await drain();

    expect(byId(a, 'a0')).toBeUndefined();
    const said = push.mock.calls.map(([m]) => m.message);
    expect(said).toContain('2 older messages were removed to save space.');
    expect(said.filter((m) => m.startsWith('Another window'))).toEqual([]);
  });

  it('a trim of the reply this window is re-running stops that request', async () => {
    await saveThread(ORIGIN, atTheCap());
    const a = await openWindow();
    (chrome.runtime.sendMessage as Mock).mockClear();
    expect(await a.regenerateVariant('a0')).toBe(true);
    const requestId = (chrome.runtime.sendMessage as Mock).mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((m) => m['kind'] === 'translate:start')?.['requestId'] as string;
    // The handoff's own save is the only one, so the trim alone has to stop the request.
    a.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'from the page',
      response: 'page answer',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    await drain();

    expect(byId(a, 'a0')).toBeUndefined();
    expect(a.inflightId).toBeNull();
    expect(cancelledRequests()).toContain(requestId);
  });
});

describe('a retry of a reply another window is still answering', () => {
  // `r` reaches retry() on any focused reply, a streaming one included.
  it("A's retry of a reply B is still streaming leaves B's answer alone", async () => {
    const push = vi.spyOn(toastStore, 'push');
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await b.send({
      content: 'live',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    const requestId = requestIdOf('live');
    b.applyChunk({ type: 'delta', requestId, text: 'half' });
    await b.flush();
    await drain();
    expect(byId(a, assistantId)?.status).toBe('streaming');
    const starts = startsSent();

    expect(await a.retry(assistantId)).toBeNull();
    await a.flush();
    await drain();

    expect(startsSent()).toBe(starts);
    expect(cancelledRequests()).not.toContain(requestId);
    expect(b.inflightId).toBe(assistantId);
    expect(byId(b, assistantId)?.content).toBe('half');
    expect(push.mock.calls.map(([m]) => m.message)).toContain(
      'Wait for the current reply to finish, then retry.',
    );
  });

  // An edit-last re-send keeps the old answer as v0, so the live version is a sibling, not the whole turn.
  it("A's retry of a version B is still streaming does not drop that version", async () => {
    const a = await openWindow();
    const b = await openWindow();
    const assistantId = await b.send({
      content: 'dos',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
      preservedResponse: 'two (old)',
    });
    await b.flush();
    await drain();
    expect(byId(a, assistantId)?.variants?.map((v) => v.status)).toEqual(['done', 'pending']);
    const starts = startsSent();

    expect(await a.retry(assistantId)).toBeNull();
    await a.flush();
    await drain();

    expect(startsSent()).toBe(starts);
    expect(b.inflightId).toBe(assistantId);
    expect(byId(b, assistantId)?.variants?.map((v) => v.status)).toEqual(['done', 'pending']);
  });
});
