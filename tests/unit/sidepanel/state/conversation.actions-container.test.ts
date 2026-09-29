import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

function lastStart(): Record<string, unknown> {
  const all = startCalls();
  const last = all[all.length - 1];
  if (!last) throw new Error('expected at least one translate:start call');
  return last;
}

function lastStartOptions(): Record<string, unknown> {
  return lastStart()['options'] as Record<string, unknown>;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

/** Build a 2-exchange conversation: user1→assistant1, user2→assistant2. */
async function buildTwoExchanges(c: ReturnType<typeof createConversation>): Promise<{
  userId1: string;
  assistantId1: string;
  userId2: string;
  assistantId2: string;
}> {
  await c.send({
    content: 'hello',
    kind: 'translate',
    sourceLang: asLangIdUnsafe('en'),
    targetLang: asLangIdUnsafe('es'),
    stream: true,
  });
  const req1 = lastStart()['requestId'] as string;
  const a1 = c.turns.find((t) => t.role === 'assistant');
  if (!a1) throw new Error('expected first assistant turn');
  const assistantId1 = a1.id;
  c.applyChunk({ type: 'done', requestId: req1, confidence: 0.9 });

  await c.send({
    content: 'world',
    kind: 'translate',
    sourceLang: asLangIdUnsafe('en'),
    targetLang: asLangIdUnsafe('es'),
    stream: true,
  });
  const req2 = lastStart()['requestId'] as string;
  const assistants = c.turns.filter((t) => t.role === 'assistant');
  const a2 = assistants[1];
  if (!a2) throw new Error('expected second assistant turn');
  const assistantId2 = a2.id;
  c.applyChunk({ type: 'done', requestId: req2, confidence: 0.9 });

  const users = c.turns.filter((t) => t.role === 'user');
  const u1 = users[0];
  const u2 = users[1];
  if (!u1 || !u2) throw new Error('expected two user turns');

  return { userId1: u1.id, assistantId1, userId2: u2.id, assistantId2 };
}

describe('createConversation().deleteTurn', () => {
  it('removes the assistant turn and its paired user turn', async () => {
    const c = createConversation();
    const { assistantId1, userId2, assistantId2 } = await buildTwoExchanges(c);

    c.deleteTurn(assistantId1);

    expect(c.turns.map((t) => t.id)).toEqual([userId2, assistantId2]);
  });

  it('removes a user turn and its linked assistant turn', async () => {
    const c = createConversation();
    const { userId1, userId2, assistantId2 } = await buildTwoExchanges(c);

    c.deleteTurn(userId1);

    expect(c.turns.map((t) => t.id)).toEqual([userId2, assistantId2]);
  });

  it('cancels inflight when the deleted turn is the inflight assistant', async () => {
    const c = createConversation();
    await c.send({
      content: 'hi',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('en'),
      targetLang: asLangIdUnsafe('es'),
      stream: true,
    });
    const inflightTurn = c.turns.find((t) => t.role === 'assistant');
    if (!inflightTurn) throw new Error('expected assistant turn');
    expect(c.inflightId).toBe(inflightTurn.id);

    c.deleteTurn(inflightTurn.id);

    expect(c.inflightId).toBeNull();
    expect(c.turns).toHaveLength(0);
  });
});

describe('createConversation().toggleBookmark', () => {
  it('sets bookmarked on a turn and clears it on a second call', async () => {
    const c = createConversation();
    const { userId1 } = await buildTwoExchanges(c);

    c.toggleBookmark(userId1);
    expect(c.turns.find((t) => t.id === userId1)?.bookmarked).toBe(true);

    c.toggleBookmark(userId1);
    expect(c.turns.find((t) => t.id === userId1)?.bookmarked).toBe(false);
  });

  it('only toggles the targeted turn, leaves others unchanged', async () => {
    const c = createConversation();
    const { userId1, assistantId1, userId2 } = await buildTwoExchanges(c);

    c.toggleBookmark(userId1);

    expect(c.turns.find((t) => t.id === assistantId1)?.bookmarked).toBeUndefined();
    expect(c.turns.find((t) => t.id === userId2)?.bookmarked).toBeUndefined();
  });
});

describe('createConversation().regenerateVariant', () => {
  it('adds a variant and dispatches with the same task', async () => {
    const c = createConversation();
    const { assistantId1 } = await buildTwoExchanges(c);

    const startsBefore = startCalls().length;
    const result = await c.regenerateVariant(assistantId1);

    expect(result).toBe(true);
    expect(startCalls().length).toBe(startsBefore + 1);

    const assistant = c.turns.find((t) => t.id === assistantId1);
    expect(assistant?.variants?.length).toBe(2);
  });

  it('dispatches without an extra task field when kind is translate', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('es'),
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const req = lastStart()['requestId'] as string;
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    c.applyChunk({ type: 'done', requestId: req, confidence: 0.9 });

    await c.regenerateVariant(assistantTurn.id);

    // translate kind → no task field in options (mirrors taskVariant behavior)
    expect(lastStartOptions()['task']).toBeUndefined();
  });

  it('dispatches with task field when kind is non-translate', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'summarize',
      sourceLang: asLangIdUnsafe('es'),
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const req = lastStart()['requestId'] as string;
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    c.applyChunk({ type: 'done', requestId: req, confidence: 0.9 });

    await c.regenerateVariant(assistantTurn.id);

    expect(lastStartOptions()['task']).toBe('summarize');
  });

  it('returns false while another dispatch is inflight', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('es'),
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');

    const startsBefore = startCalls().length;
    const result = await c.regenerateVariant(assistantTurn.id);

    expect(result).toBe(false);
    expect(startCalls().length).toBe(startsBefore);
  });

  it('returns false for an unknown turn id', async () => {
    const c = createConversation();
    const result = await c.regenerateVariant('no-such-id');
    expect(result).toBe(false);
  });
});

describe('mid-history re-dispatch reuses that turn own params', () => {
  /** Exchange 1: es→en on page A. Exchange 2: fr→de on page B. */
  async function buildTwoLangPairs(
    c: ReturnType<typeof createConversation>,
  ): Promise<{ assistantId1: string }> {
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('es'),
      targetLang: asLangIdUnsafe('en'),
      stream: true,
      context: { pageTitle: 'page A' },
    });
    const req1 = lastStart()['requestId'] as string;
    const a1 = c.turns.find((t) => t.role === 'assistant');
    if (!a1) throw new Error('expected first assistant turn');
    c.applyChunk({ type: 'done', requestId: req1, confidence: 0.9 });

    await c.send({
      content: 'bonjour',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('fr'),
      targetLang: asLangIdUnsafe('de'),
      stream: true,
      context: { pageTitle: 'page B' },
    });
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string, confidence: 0.9 });

    return { assistantId1: a1.id };
  }

  it('regenerate on an older turn keeps its lang pair and page context', async () => {
    const c = createConversation();
    const { assistantId1 } = await buildTwoLangPairs(c);

    await c.regenerateVariant(assistantId1);

    const msg = lastStart();
    expect(msg['text']).toBe('hola');
    expect(msg['sourceLang']).toBe(asLangIdUnsafe('es'));
    expect(msg['targetLang']).toBe(asLangIdUnsafe('en'));
    expect((msg['context'] as { pageTitle?: string }).pageTitle).toBe('page A');
  });

  it('retry on an older turn keeps its lang pair and page context', async () => {
    const c = createConversation();
    const { assistantId1 } = await buildTwoLangPairs(c);

    await c.retry(assistantId1);

    const msg = lastStart();
    expect(msg['text']).toBe('hola');
    expect(msg['sourceLang']).toBe(asLangIdUnsafe('es'));
    expect(msg['targetLang']).toBe(asLangIdUnsafe('en'));
    expect((msg['context'] as { pageTitle?: string }).pageTitle).toBe('page A');
  });
});

describe('createConversation().editFrom', () => {
  it('returns the user turn content and truncates from that turn onward', async () => {
    const c = createConversation();
    const { userId1 } = await buildTwoExchanges(c);

    const text = c.editFrom(userId1);

    expect(text).toBe('hello');
    // Everything from userId1 onward is gone
    expect(c.turns).toHaveLength(0);
  });

  it('truncates only the later exchange when editing the second user turn', async () => {
    const c = createConversation();
    const { userId1, assistantId1, userId2 } = await buildTwoExchanges(c);

    const text = c.editFrom(userId2);

    expect(text).toBe('world');
    expect(c.turns.map((t) => t.id)).toEqual([userId1, assistantId1]);
  });

  it('cancels inflight when inflight turn is in the truncated range', async () => {
    const c = createConversation();
    // First exchange done
    await c.send({
      content: 'first',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('en'),
      targetLang: asLangIdUnsafe('es'),
      stream: true,
    });
    const req1 = lastStart()['requestId'] as string;
    c.applyChunk({ type: 'done', requestId: req1, confidence: 0.9 });

    // Second dispatch — keep inflight (no drain)
    await c.send({
      content: 'second',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('en'),
      targetLang: asLangIdUnsafe('es'),
      stream: true,
    });
    const userTurns = c.turns.filter((t) => t.role === 'user');
    const u2 = userTurns[1];
    if (!u2) throw new Error('expected second user turn');
    expect(c.inflightId).not.toBeNull();

    c.editFrom(u2.id);

    expect(c.inflightId).toBeNull();
  });

  it('returns null for an unknown id', () => {
    const c = createConversation();
    expect(c.editFrom('no-such-id')).toBeNull();
  });

  it('returns null when the id belongs to an assistant turn', async () => {
    const c = createConversation();
    await c.send({
      content: 'hi',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('en'),
      targetLang: asLangIdUnsafe('es'),
      stream: true,
    });
    const req = lastStart()['requestId'] as string;
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    c.applyChunk({ type: 'done', requestId: req, confidence: 0.9 });

    expect(c.editFrom(assistantTurn.id)).toBeNull();
  });
});
