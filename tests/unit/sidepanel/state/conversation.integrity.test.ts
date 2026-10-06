import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';

const sendMessage = chrome.runtime.sendMessage as Mock;
const en = asLangIdUnsafe('en');

function starts(): Array<Record<string, unknown>> {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
}

function lastRequestId(): string {
  const last = starts().at(-1);
  if (!last) throw new Error('expected a translate:start call');
  return last['requestId'] as string;
}

function userTurn(id: string, content: string, createdAt = 1): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt, content };
}

async function settledExchange(
  c: ReturnType<typeof createConversation>,
  content: string,
): Promise<string> {
  await c.send({ content, kind: 'translate', sourceLang: 'auto', targetLang: en, stream: false });
  c.applyChunk({ type: 'delta', requestId: lastRequestId(), text: `{"translation":"${content}"}` });
  c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 });
  const assistant = c.turns.filter((t) => t.role === 'assistant').at(-1);
  if (!assistant) throw new Error('expected an assistant turn');
  return assistant.id;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

describe('a debounced save cannot land on the origin it was not scheduled for', () => {
  it('turns appended during an origin switch never reach the previous site key', async () => {
    vi.useFakeTimers();
    await saveThread('https://target.com', [userTurn('new-1', 'NEW-SITE-TURN')]);
    const c = createConversation();
    await c.openConversation('https://source.com');
    c.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'OLD-SITE-TURN',
      response: 'old answer',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    await c.flush();

    // A seed landing inside setActiveOrigin's flush binds the OLD origin but snapshots the NEW turns.
    let injected = false;
    const realSet = chrome.storage.local.set.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(((items: unknown) => {
      const p = realSet(items as Record<string, unknown>);
      if (!injected) {
        injected = true;
        c.seedDeliveredTurn({
          kind: 'translate',
          sourceText: 'INJECTED',
          response: 'injected answer',
          sourceLang: 'auto',
          targetLang: en,
          stream: false,
        });
      }
      return p;
    }) as typeof chrome.storage.local.set);

    await c.openConversation('https://target.com');
    await vi.advanceTimersByTimeAsync(1000);
    vi.restoreAllMocks();

    const source = (await loadThreadResult('https://source.com')).turns.map((t) => t.content);
    expect(source).not.toContain('NEW-SITE-TURN');
  });
});

describe('retry on a settled answer', () => {
  it('appends a variant instead of destroying the refinements', async () => {
    const c = createConversation();
    const assistantId = await settledExchange(c, 'hola');
    await c.refine({ turnId: assistantId, refinementBody: 'shorter' });
    c.applyChunk({ type: 'delta', requestId: lastRequestId(), text: '{"translation":"short"}' });
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 });
    const before = c.turns.find((t) => t.id === assistantId)?.variants?.length ?? 0;
    expect(before).toBe(2);

    await c.retry(assistantId);

    const after = c.turns.find((t) => t.id === assistantId);
    expect(after?.variants).toHaveLength(before + 1);
    expect(after?.variants?.[1]?.refinementBody).toBe('shorter');
  });

  it('still replaces the turn when the answer failed', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    const failedId = c.turns.filter((t) => t.role === 'assistant').at(-1)?.id ?? '';
    c.applyChunk({
      type: 'error',
      requestId: lastRequestId(),
      code: 'NETWORK',
      message: 'dropped',
    });

    await c.retry(failedId);

    expect(c.turns.some((t) => t.id === failedId)).toBe(false);
    expect(c.turns.filter((t) => t.role === 'assistant')).toHaveLength(1);
  });
});

describe('a delivered payload does not kill a running translate', () => {
  it('leaves the inflight turn streaming', async () => {
    const c = createConversation();
    await c.send({
      content: 'long ask',
      kind: 'ask',
      sourceLang: 'auto',
      targetLang: en,
      stream: true,
    });
    const req = lastRequestId();
    c.applyChunk({ type: 'delta', requestId: req, text: 'partial' });

    c.seedDeliveredTurn({
      kind: 'explain',
      sourceText: 'word',
      response: 'meaning',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });

    const streaming = c.turns.filter((t) => t.role === 'assistant')[0];
    expect(streaming?.status).toBe('streaming');
    expect(c.inflightId).toBe(streaming?.id);

    c.applyChunk({ type: 'done', requestId: req, confidence: 0.9 });
    expect(c.turns.filter((t) => t.role === 'assistant')[0]?.status).toBe('done');
  });
});

/** Zero-ms ticks only, so fake time never reaches the 400ms debounce: a pass proves the write skipped it. */
async function settleWithoutTime(done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 50 && !(await done()); i++) await vi.advanceTimersByTimeAsync(0);
}

describe('discrete edits are written without waiting out the debounce', () => {
  it('a bookmark reaches storage before the 400ms timer would fire', async () => {
    vi.useFakeTimers();
    const c = createConversation();
    await c.openConversation('https://disc.com');
    c.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'hola',
      response: 'hello',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    await c.flush();
    const target = c.turns[0]?.id ?? '';

    c.toggleBookmark(target);
    const bookmarked = async (): Promise<boolean> =>
      (await loadThreadResult('https://disc.com')).turns.find((t) => t.id === target)
        ?.bookmarked === true;
    await settleWithoutTime(bookmarked);

    expect(await bookmarked()).toBe(true);
  });

  it('a delete reaches storage before the 400ms timer would fire', async () => {
    vi.useFakeTimers();
    const c = createConversation();
    await c.openConversation('https://disc2.com');
    c.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'hola',
      response: 'hello',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    await c.flush();
    const target = c.turns[0]?.id ?? '';

    c.deleteTurn(target);
    const gone = async (): Promise<boolean> =>
      (await loadThreadResult('https://disc2.com')).turns.length === 0;
    await settleWithoutTime(gone);

    expect((await loadThreadResult('https://disc2.com')).turns).toEqual([]);
  });
});

describe('a turn deleted here stays deleted across a save from another window', () => {
  it('records a tombstone the other window has to honor', async () => {
    const o = 'https://tomb-panel.com';
    await saveThread(o, [userTurn('t1', 'one', 10), userTurn('t2', 'two', 20)]);
    const c = createConversation();
    await c.openConversation(o);
    c.deleteTurn('t2');
    await c.flush();

    // The other window still holds t2 and saves its own view of the thread.
    await saveThread(o, [userTurn('t1', 'one', 10), userTurn('t2', 'two', 20)], {
      knownIds: new Set(['t1', 't2']),
    });

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);
  });

  it('lifts the tombstone when the delete is undone', async () => {
    const o = 'https://tomb-undo.com';
    await saveThread(o, [userTurn('t1', 'one', 10), userTurn('t2', 'two', 20)]);
    const c = createConversation();
    await c.openConversation(o);

    const slice = c.deleteTurn('t2');
    await c.flush();
    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1']);

    if (slice) c.restoreTurns(slice);
    await c.flush();

    expect((await loadThreadResult(o)).turns.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('keeps a turn the other window added while this panel was open', async () => {
    const o = 'https://foreign-panel.com';
    await saveThread(o, [userTurn('t1', 'one', 10)]);
    const c = createConversation();
    await c.openConversation(o);

    const key = `ega:conv:t:${o}`;
    const stored = (await chrome.storage.local.get(key))[key] as { turns: Turn[] };
    await chrome.storage.local.set({
      [key]: { ...stored, turns: [...stored.turns, userTurn('t2', 'from-other-window', 20)] },
    });

    c.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'mine',
      response: 'answer',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    await c.flush();

    const contents = (await loadThreadResult(o)).turns.map((t) => t.content);
    expect(contents).toContain('from-other-window');
    expect(contents).toContain('mine');
    expect(contents).toContain('one');
  });
});
