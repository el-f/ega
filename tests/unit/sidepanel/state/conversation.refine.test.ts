import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { startCalls } from '@tests/_helpers/messages';

// Read refine's task and tone from the sendMessage payload.
const sendMessage = chrome.runtime.sendMessage as Mock;

function lastStart(): Record<string, unknown> {
  const all = startCalls();
  const last = all[all.length - 1];
  if (!last) throw new Error('expected at least one translate:start call');
  return last;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

describe('createConversation().refine — concurrency guard', () => {
  it('no-op when another dispatch is inflight (does not append variant or fire request)', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const startsAfterSend = startCalls().length;
    expect(c.inflightId).not.toBeNull();
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');
    const variantsBefore = assistant.variants?.length ?? 0;

    await c.refine({
      turnId: assistant.id,
      refinementBody: 'shorter',
    });

    // Refine fired no extra translate:start; the turn's variants list is untouched.
    expect(startCalls().length).toBe(startsAfterSend);
    const after = c.turns.find((t) => t.id === assistant.id);
    expect(after?.variants?.length ?? 0).toBe(variantsBefore);
  });

  it('refine fires after a terminal done frame clears the inflight slot', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');
    const assistantId = assistant.id;
    // Match the requestId sent so the chunk isn't dropped by the stale-request filter.
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string, confidence: 0.9 });
    expect(c.inflightId).toBeNull();

    const startsBefore = startCalls().length;
    await c.refine({
      turnId: assistantId,
      refinementBody: 'shorter',
    });
    expect(startCalls().length).toBe(startsBefore + 1);
    const after = c.turns.find((t) => t.id === assistantId);
    expect(after?.variants?.length).toBe(2);
    // Refinement rides the envelope as a request-scoped instruction.
    const opts = lastStart()['options'] as Record<string, unknown>;
    expect(opts['refinement']).toBe('shorter');
  });
});

describe('createConversation().cancel — refined variant not yet streaming', () => {
  it('terminates the dispatched variant after the user flips back to v1', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('es'),
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');
    const assistantId = assistant.id;
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string, confidence: 0.9 });

    // v2 is dispatched but no delta has arrived, so it is still `pending`.
    await c.refine({ turnId: assistantId, refinementBody: 'shorter' });
    c.selectVariant(assistantId, 0);
    c.cancel();

    const after = c.turns.find((t) => t.id === assistantId);
    expect(after?.variants?.[1]?.status).toBe('error');
    expect(after?.variants?.[1]?.error?.code).toBe('cancelled');
    // v1 is what the user is looking at — it stays the finished answer.
    expect(after?.variants?.[0]?.status).toBe('done');
    expect(after?.status).toBe('done');
  });
});

describe('createConversation().refine — tone captured per user turn', () => {
  it('reword turn dispatched with formal tone; later picker change to casual; refine re-fires formal', async () => {
    const c = createConversation();
    await c.send({
      content: 'hello',
      kind: 'reword',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
      tone: 'formal',
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');
    const assistantId = assistant.id;
    // Drain the inflight slot so refine clears the concurrency guard.
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string, confidence: 0.9 });

    // A casual send moves lastDispatch to casual; refining the first reword must still use its own formal tone.
    await c.send({
      content: 'separate prompt',
      kind: 'reword',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
      tone: 'casual',
    });
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string, confidence: 0.9 });

    // Now refine the FIRST assistant turn. It must use formal.
    await c.refine({
      turnId: assistantId,
      refinementBody: 'shorter',
    });
    const opts = lastStart()['options'] as Record<string, unknown>;
    expect(opts['tone']).toBe('formal');
  });
});
