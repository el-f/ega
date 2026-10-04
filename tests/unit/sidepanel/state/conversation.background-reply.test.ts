import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';
import { toastStore } from '@/shared/components/toastStore';

type Container = ReturnType<typeof createConversation>;
type Changes = Record<string, chrome.storage.StorageChange>;

const EN = asLangIdUnsafe('en');
const A = 'https://a.test';
const B = 'https://b.test';

function messages(kind: string): Array<Record<string, unknown>> {
  return (chrome.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === kind);
}

function requestIdOf(content: string): string {
  const start = messages('translate:start')
    .filter((m) => m['text'] === content)
    .at(-1);
  if (!start) throw new Error(`no translate:start for ${content}`);
  return start['requestId'] as string;
}

async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const listeners: Array<(changes: Changes, area: string) => void> = [];

/** The panel wiring: storage changes reach the container the way SidePanel forwards them. */
function panel(opts: Parameters<typeof createConversation>[0] = {}): Container {
  const c = createConversation(opts);
  const listener = (changes: Changes, area: string): void => {
    if (area === 'local') c.onStorageChanged(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  listeners.push(listener);
  return c;
}

async function startOn(c: Container, origin: string, content: string): Promise<string> {
  await c.setActiveOrigin(origin);
  return await c.send({
    content,
    kind: 'translate',
    sourceLang: 'auto',
    targetLang: EN,
    stream: true,
  });
}

/** Runs `seed` inside the thread read, the window where a seed message counts as landing mid-load. */
async function switchWithSeed(c: Container, origin: string, seed: () => void): Promise<void> {
  const realGet = chrome.storage.local.get.bind(chrome.storage.local);
  let seeded = false;
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const spy = vi.spyOn(chrome.storage.local, 'get').mockImplementation(((keys: unknown) => {
    const read = realGet(keys as string);
    const key = Array.isArray(keys) ? keys[0] : (keys as string);
    if (!seeded && typeof key === 'string' && key.startsWith('ega:conv:t:')) {
      seeded = true;
      seed();
    }
    return read;
  }) as typeof chrome.storage.local.get);
  await c.setActiveOrigin(origin);
  spy.mockRestore();
  expect(seeded, 'the thread read never ran').toBe(true);
}

async function storedTurn(origin: string, id: string): Promise<Turn | undefined> {
  return (await loadThreadResult(origin)).turns.find((t) => t.id === id);
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  for (const l of listeners) chrome.storage.onChanged.removeListener(l);
  listeners.length = 0;
  vi.restoreAllMocks();
});

describe('a reply still running when the panel follows another tab', () => {
  it('finishes into the thread it was sent from instead of being canceled', async () => {
    const c = panel();
    const assistantId = await startOn(c, A, 'hola');
    const requestId = requestIdOf('hola');
    c.applyChunk({ type: 'delta', requestId, text: '{"translation":"hel' });

    await c.setActiveOrigin(B);
    expect(c.inflightId).toBeNull();
    expect(messages('translate:cancel').map((m) => m['requestId'])).not.toContain(requestId);

    c.applyChunk({ type: 'delta', requestId, text: 'lo"}' });
    c.applyChunk({ type: 'done', requestId, confidence: 1 });
    await drain();

    const stored = await storedTurn(A, assistantId);
    expect(stored?.status).toBe('done');
    expect(stored?.content).toBe('hello');
    // The thread on screen is B's, and nothing of A's reply leaked into it.
    expect(c.turns).toEqual([]);
  });

  it('keeps the old thread in order and leaves its other turns alone', async () => {
    const c = panel();
    await startOn(c, A, 'first');
    const first = requestIdOf('first');
    c.applyChunk({ type: 'delta', requestId: first, text: '{"translation":"one"}' });
    c.applyChunk({ type: 'done', requestId: first, confidence: 1 });
    await c.send({
      content: 'second',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    const second = requestIdOf('second');

    await c.setActiveOrigin(B);
    c.applyChunk({ type: 'delta', requestId: second, text: '{"translation":"two"}' });
    c.applyChunk({ type: 'done', requestId: second, confidence: 1 });
    await drain();

    expect((await loadThreadResult(A)).turns.map((t) => [t.role, t.content, t.status])).toEqual([
      ['user', 'first', 'idle'],
      ['assistant', 'one', 'done'],
      ['user', 'second', 'idle'],
      ['assistant', 'two', 'done'],
    ]);
  });

  it('takes the slot back when the panel comes back early, with the text that came meanwhile', async () => {
    const c = panel();
    const assistantId = await startOn(c, A, 'hola');
    const requestId = requestIdOf('hola');
    c.applyChunk({ type: 'delta', requestId, text: '{"translation":"hel' });
    await c.setActiveOrigin(B);
    c.applyChunk({ type: 'delta', requestId, text: 'lo' });
    await c.setActiveOrigin(A);

    // Back in the foreground: Stop works again, and no second dispatch can start on the turn.
    expect(c.inflightId).toBe(assistantId);
    expect(c.turns.find((t) => t.id === assistantId)?.content).toBe('hello');
    expect(await c.langVariant(asLangIdUnsafe('fr'))).toBe(false);

    c.applyChunk({ type: 'delta', requestId, text: '"}' });
    c.applyChunk({ type: 'done', requestId, confidence: 1 });
    await drain();

    expect(c.turns.find((t) => t.id === assistantId)?.status).toBe('done');
    expect(c.turns.find((t) => t.id === assistantId)?.content).toBe('hello');
    expect((await storedTurn(A, assistantId))?.status).toBe('done');
  });

  it('takes the slot back even when a delivered answer lands while the thread loads', async () => {
    const c = panel();
    const assistantId = await startOn(c, A, 'hola');
    await c.setActiveOrigin(B);

    await switchWithSeed(c, A, () =>
      c.seedDeliveredTurn({
        kind: 'translate',
        sourceText: 'word',
        response: 'palabra',
        sourceLang: 'auto',
        targetLang: EN,
        stream: true,
      }),
    );

    expect(c.turns.map((t) => t.content)).toContain('word');
    expect(c.inflightId).toBe(assistantId);
  });

  it('stops a reply whose turn another window removed, and still brings back a later one', async () => {
    const c = panel();
    const goneId = await startOn(c, A, 'gone');
    const goneReq = requestIdOf('gone');
    await c.setActiveOrigin(B);

    const other = panel();
    await other.setActiveOrigin(A);
    other.deleteTurn(goneId);
    await other.flush();

    await c.setActiveOrigin(A);
    expect(messages('translate:cancel').map((m) => m['requestId'])).toContain(goneReq);

    const liveId = await c.send({
      content: 'live',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: EN,
      stream: true,
    });
    await c.setActiveOrigin(B);
    await c.setActiveOrigin(A);
    expect(c.inflightId).toBe(liveId);
  });

  it('refuses a retry on a turn its reply still writes in the background', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const c = panel();
    const assistantId = await startOn(c, A, 'hola');
    await c.setActiveOrigin(B);

    // An image seed during the load holds the slot, so the reply stays in the background.
    await switchWithSeed(c, A, () =>
      c.seedExternalImageTurn('req-image', 'https://example.com/img.png'),
    );
    expect(c.turns.find((t) => t.id === assistantId)?.status).toBe('pending');
    c.applyChunk({ type: 'delta', requestId: 'req-image', text: '{"translation":"x"}' });
    c.applyChunk({ type: 'done', requestId: 'req-image', confidence: 1 });
    expect(c.inflightId).toBeNull();
    const starts = messages('translate:start').length;

    await c.retry(assistantId);

    expect(push).toHaveBeenCalledWith(expect.objectContaining({ variant: 'warning' }));
    expect(messages('translate:start')).toHaveLength(starts);
    expect(c.turns.some((t) => t.id === assistantId)).toBe(true);
  });

  it('is stopped by a purge, which leaves nothing to write it into', async () => {
    const c = panel();
    await startOn(c, A, 'hola');
    const requestId = requestIdOf('hola');
    await c.setActiveOrigin(B);

    c.resetAfterPurge();

    expect(messages('translate:cancel').map((m) => m['requestId'])).toContain(requestId);
  });

  it('does not stop when the new thread sends its own message', async () => {
    const c = panel();
    const aId = await startOn(c, A, 'from-a');
    const aReq = requestIdOf('from-a');
    const bId = await startOn(c, B, 'from-b');
    const bReq = requestIdOf('from-b');
    expect(c.inflightId).toBe(bId);

    c.applyChunk({ type: 'delta', requestId: aReq, text: '{"translation":"a"}' });
    c.applyChunk({ type: 'done', requestId: aReq, confidence: 1 });
    c.applyChunk({ type: 'delta', requestId: bReq, text: '{"translation":"b"}' });
    c.applyChunk({ type: 'done', requestId: bReq, confidence: 1 });
    await drain();

    expect((await storedTurn(A, aId))?.content).toBe('a');
    expect(c.turns.find((t) => t.id === bId)?.content).toBe('b');
  });

  it('is failed as a timeout in its own thread when it goes silent', async () => {
    const c = panel({ stallMs: () => 50 });
    const assistantId = await startOn(c, A, 'hola');
    const requestId = requestIdOf('hola');
    await c.setActiveOrigin(B);

    await vi.waitFor(async () =>
      expect((await storedTurn(A, assistantId))?.error?.code).toBe('TIMEOUT'),
    );
    await drain();
    expect(messages('translate:cancel').map((m) => m['requestId'])).toContain(requestId);
  });

  it('is dropped, not written back, when its turn was deleted meanwhile', async () => {
    const c = panel();
    const assistantId = await startOn(c, A, 'hola');
    const requestId = requestIdOf('hola');
    await c.setActiveOrigin(B);
    await c.setActiveOrigin(A);
    c.deleteTurn(assistantId);
    await c.flush();

    c.applyChunk({ type: 'delta', requestId, text: '{"translation":"hello"}' });
    c.applyChunk({ type: 'done', requestId, confidence: 1 });
    await drain();

    expect((await loadThreadResult(A)).turns).toEqual([]);
  });

  it('says so when its answer cannot be saved', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const c = panel();
    await startOn(c, A, 'hola');
    const requestId = requestIdOf('hola');
    await c.setActiveOrigin(B);
    const realSet = chrome.storage.local.set.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(((items: Record<string, unknown>) =>
      `ega:conv:t:${A}` in items
        ? Promise.reject(new Error('disk gone'))
        : realSet(items)) as typeof chrome.storage.local.set);

    c.applyChunk({ type: 'delta', requestId, text: '{"translation":"hello"}' });
    c.applyChunk({ type: 'done', requestId, confidence: 1 });
    await drain();

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The answer for a.test could not be saved.',
        variant: 'danger',
      }),
    );
  });

  it('names the conversation its save removed to make room', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const C = 'https://c.test';
    await saveThread(C, [
      { id: 'c1', role: 'user', kind: 'translate', status: 'idle', content: 'viejo', createdAt: 1 },
    ]);
    const c = panel();
    await startOn(c, A, 'hola');
    const requestId = requestIdOf('hola');
    await c.setActiveOrigin(B);
    const realSet = chrome.storage.local.set.bind(chrome.storage.local);
    // A's write fits only once C's thread is gone, as on a full disk.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((async (
      items: Record<string, unknown>,
    ) => {
      const cLeft =
        (await chrome.storage.local.get(`ega:conv:t:${C}`))[`ega:conv:t:${C}`] !== undefined;
      if (`ega:conv:t:${A}` in items && cLeft) throw new Error('QUOTA_BYTES quota exceeded');
      return realSet(items);
    }) as typeof chrome.storage.local.set);

    c.applyChunk({ type: 'delta', requestId, text: '{"translation":"hello"}' });
    c.applyChunk({ type: 'done', requestId, confidence: 1 });
    await drain();

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The saved conversation for c.test was removed to make room.',
      }),
    );
    expect((await loadThreadResult(A)).turns.at(-1)?.content).toBe('hello');
  });
});
