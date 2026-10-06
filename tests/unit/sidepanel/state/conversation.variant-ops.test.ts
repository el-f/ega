import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';
import type { LangSelection } from '@/shared/types';
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

async function sendAndDrain(
  c: ReturnType<typeof createConversation>,
  opts: {
    content?: string;
    sourceLang?: LangSelection;
    targetLang?: string;
  } = {},
): Promise<string> {
  await c.send({
    content: opts.content ?? 'hola',
    kind: 'translate',
    sourceLang: opts.sourceLang ?? asLangIdUnsafe('es'),
    targetLang: asLangIdUnsafe(opts.targetLang ?? 'en'),
    stream: true,
  });
  c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string, confidence: 0.9 });
  const assistant = c.turns.find((t) => t.role === 'assistant');
  if (!assistant) throw new Error('expected assistant turn');
  return assistant.id;
}

/** Streams `text` into the request in flight; the caller sends its own done. */
function answer(c: ReturnType<typeof createConversation>, text: string): void {
  c.applyChunk({
    type: 'delta',
    requestId: lastStart()['requestId'] as string,
    text: `{"translation":"${text}"}`,
  });
}

describe('createConversation().swapVariant', () => {
  it('adds a variant and dispatches with swapped langs', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });

    const startsBefore = startCalls().length;
    const result = await c.swapVariant(assistantId);

    expect(result).toBe(true);
    expect(startCalls().length).toBe(startsBefore + 1);

    const assistant = c.turns.find((t) => t.id === assistantId);
    expect(assistant?.variants?.length).toBe(2);

    const msg = lastStart();
    expect(msg['sourceLang']).toBe(asLangIdUnsafe('en'));
    expect(msg['targetLang']).toBe(asLangIdUnsafe('es'));
    // No refinement field
    expect(lastStartOptions()['refinement']).toBeUndefined();
  });

  it('returns false when sourceLang is auto (cannot swap auto-detected source)', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, { sourceLang: 'auto', targetLang: 'en' });

    const startsBefore = startCalls().length;
    const result = await c.swapVariant(assistantId);

    expect(result).toBe(false);
    expect(startCalls().length).toBe(startsBefore);

    const assistant = c.turns.find((t) => t.id === assistantId);
    expect(assistant?.variants?.length ?? 1).toBe(1);
  });

  it('returns false while another dispatch is inflight', async () => {
    const c = createConversation();
    // Send but do NOT drain (keep inflight)
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('es'),
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');

    const startsBefore = startCalls().length;
    const result = await c.swapVariant(assistant.id);

    expect(result).toBe(false);
    expect(startCalls().length).toBe(startsBefore);
    expect(assistant.variants?.length ?? 1).toBe(1);
  });
});

function restoredPair(): Turn[] {
  return [
    {
      createdAt: 1,
      id: 'u1',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: 'hola',
      dispatch: {
        sourceLang: asLangIdUnsafe('es'),
        targetLang: asLangIdUnsafe('en'),
        stream: true,
      },
    },
    {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      attachedToTurnId: 'u1',
      // Every writer seeds this; a stored turn without it was shrunk by the byte cap and cannot take a variant.
      variants: [{ id: 'a1:v1', status: 'done', content: 'hello' }],
      activeVariantIdx: 0,
    },
  ];
}

describe('createConversation().swapPair', () => {
  it('a later variety send does not unlock swap on an auto-source turn', async () => {
    const c = createConversation();
    await sendAndDrain(c, { sourceLang: 'auto', targetLang: 'en' });
    await sendAndDrain(c, { sourceLang: asLangIdUnsafe('es'), targetLang: 'en' });
    const autoTurn = c.turns.filter((t) => t.role === 'assistant')[0];
    if (!autoTurn) throw new Error('expected two assistant turns');

    const startsBefore = startCalls().length;
    expect(await c.swapVariant(autoTurn.id)).toBe(false);
    expect(startCalls().length).toBe(startsBefore);
    expect(c.swapPair(autoTurn.id)).toBeNull();
  });

  it('matches swapVariant on a variety-source turn', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });

    expect(c.swapPair(assistantId)).not.toBeNull();
    expect(await c.swapVariant(assistantId)).toBe(true);
  });

  it('matches swapVariant on a thread restored from storage', async () => {
    const origin = 'https://example.com';
    await saveThread(origin, restoredPair());
    const c = createConversation();
    await c.setActiveOrigin(origin);
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected the restored assistant turn');

    // A restored thread has no lastDispatch; the user turn's own dispatch must enable the button and run the swap.
    const startsBefore = startCalls().length;
    expect(c.swapPair(assistant.id)).not.toBeNull();
    expect(await c.swapVariant(assistant.id)).toBe(true);
    expect(startCalls().length).toBe(startsBefore + 1);
  });

  it('is false while a dispatch is inflight', async () => {
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

    expect(c.swapPair(assistant.id)).toBeNull();
  });

  it('blocks a swap a finished reply already ran, on every variant', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });
    expect(await c.swapVariant(assistantId)).toBe(true);
    answer(c, 'hola');
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string });

    expect(c.swapPair(assistantId)).toEqual({
      sourceLang: 'en',
      targetLang: 'es',
      blocked: 'answered',
    });
    c.selectVariant(assistantId, 0);
    expect(c.swapPair(assistantId)?.blocked).toBe('answered');
    const startsBefore = startCalls().length;
    expect(await c.swapVariant(assistantId)).toBe(false);
    expect(startCalls().length).toBe(startsBefore);
  });

  it('a failed swap can run again', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });
    expect(await c.swapVariant(assistantId)).toBe(true);
    c.applyChunk({
      type: 'error',
      requestId: lastStart()['requestId'] as string,
      code: 'NETWORK',
      message: 'offline',
    } as never);
    expect(c.swapPair(assistantId)?.blocked).toBeUndefined();
  });

  it('blocks an auto-detected source that is the target language', async () => {
    const c = createConversation();
    await c.send({
      content: 'שלום',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('he'),
      stream: true,
    });
    c.applyChunk({
      type: 'done',
      requestId: lastStart()['requestId'] as string,
      detectedLang: 'he',
    } as never);
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');

    expect(c.swapPair(assistant.id)).toEqual({
      sourceLang: 'he',
      targetLang: 'he',
      blocked: 'same-language',
    });
    const startsBefore = startCalls().length;
    expect(await c.swapVariant(assistant.id)).toBe(false);
    expect(startCalls().length).toBe(startsBefore);
  });

  it('reads an auto source from the reply that detected it, not from the shown swap', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    c.applyChunk({
      type: 'done',
      requestId: lastStart()['requestId'] as string,
      detectedLang: 'es',
    } as never);
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');
    expect(await c.swapVariant(assistant.id)).toBe(true);
    // The swap was told its source is English, and the model echoes that back.
    answer(c, 'hola');
    c.applyChunk({
      type: 'done',
      requestId: lastStart()['requestId'] as string,
      detectedLang: 'en',
    } as never);

    expect(c.swapPair(assistant.id)).toEqual({
      sourceLang: 'en',
      targetLang: 'es',
      blocked: 'answered',
    });
  });

  it('is false for an unknown turn id', async () => {
    const c = createConversation();
    await sendAndDrain(c, { sourceLang: asLangIdUnsafe('es'), targetLang: 'en' });

    expect(c.swapPair('nonexistent-id')).toBeNull();
  });

  it('an empty swap reply does not block the swap', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });
    expect(await c.swapVariant(assistantId)).toBe(true);
    // "No reply came back": the swap finished with no text, so there is nothing it answered.
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string });

    expect(c.swapPair(assistantId)).toEqual({ sourceLang: 'en', targetLang: 'es' });
    expect(await c.swapVariant(assistantId)).toBe(true);
  });

  it('skips a reply that detected no known language when it reads an auto source', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    c.applyChunk({
      type: 'done',
      requestId: lastStart()['requestId'] as string,
      detectedLang: 'other',
    } as never);
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');
    expect(await c.regenerateVariant(assistant.id)).toBe(true);
    c.applyChunk({
      type: 'done',
      requestId: lastStart()['requestId'] as string,
      detectedLang: 'es',
    } as never);
    // The first reply reported 'other'; the second named Spanish, and that is the source to swap from.
    c.selectVariant(assistant.id, 0);

    expect(c.swapPair(assistant.id)).toEqual({ sourceLang: 'en', targetLang: 'es' });
  });
});

describe('createConversation().regenerateVariant re-rolls the shown answer', () => {
  /** The start message without its per-request id, so two sends of one request compare equal. */
  function request(msg: Record<string, unknown>): Record<string, unknown> {
    const { requestId: _id, ...rest } = msg;
    return rest;
  }

  it('a shown swap re-runs the swapped direction, and sends what the swap sent', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });
    const original = request(lastStart());
    expect(await c.swapVariant(assistantId)).toBe(true);
    const swap = request(lastStart());
    answer(c, 'hola');
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string });

    expect(await c.regenerateVariant(assistantId)).toBe(true);

    const regen = request(lastStart());
    // The cache key hashes the prompt: the swap's key, and only the direction differs from the first answer's.
    expect(regen).toEqual(swap);
    expect({ ...regen, sourceLang: 'es', targetLang: 'en' }).toEqual(original);
    expect(c.turns.find((t) => t.id === assistantId)?.variants?.at(-1)).toMatchObject({
      sourceLang: 'en',
      targetLang: 'es',
    });
  });

  it('the first answer shown re-runs the first direction, not the swap', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });
    expect(await c.swapVariant(assistantId)).toBe(true);
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string });
    c.selectVariant(assistantId, 0);

    expect(await c.regenerateVariant(assistantId)).toBe(true);

    expect(lastStart()['sourceLang']).toBe('es');
    expect(lastStart()['targetLang']).toBe('en');
  });

  it('a shown task variant re-runs that task', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c);
    expect(await c.taskVariant(assistantId, 'explain')).toBe(true);
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string });

    expect(await c.regenerateVariant(assistantId)).toBe(true);

    expect(lastStartOptions()['task']).toBe('explain');
    expect(c.turns.find((t) => t.id === assistantId)?.variants?.at(-1)?.task).toBe('explain');
  });

  it('a shown refine re-runs with its refinement', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c);
    expect(
      await c.refine({
        turnId: assistantId,
        refinementBody: 'Make outputs shorter.',
        refinementLabel: 'Shorter',
      }),
    ).toBe(true);
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string });

    expect(await c.regenerateVariant(assistantId)).toBe(true);

    expect(lastStartOptions()['refinement']).toBe('Make outputs shorter.');
    expect(c.turns.find((t) => t.id === assistantId)?.variants?.at(-1)?.refinementLabel).toBe(
      'Shorter',
    );
  });

  it('the r key path (retry on a finished reply) re-rolls the shown swap too', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });
    expect(await c.swapVariant(assistantId)).toBe(true);
    c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string });

    await c.retry(assistantId);

    expect(lastStart()['sourceLang']).toBe('en');
    expect(lastStart()['targetLang']).toBe('es');
  });
});

describe('createConversation().taskVariant', () => {
  it('adds a variant and dispatches with the new task', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });

    const startsBefore = startCalls().length;
    const result = await c.taskVariant(assistantId, 'summarize');

    expect(result).toBe(true);
    expect(startCalls().length).toBe(startsBefore + 1);

    const assistant = c.turns.find((t) => t.id === assistantId);
    expect(assistant?.variants?.length).toBe(2);

    const opts = lastStartOptions();
    expect(opts['task']).toBe('summarize');
    // No refinement field
    expect(opts['refinement']).toBeUndefined();
  });

  it('sets explain:true when task is explain', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c);

    await c.taskVariant(assistantId, 'explain');

    expect(lastStartOptions()['explain']).toBe(true);
    expect(lastStartOptions()['refinement']).toBeUndefined();
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
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');

    const startsBefore = startCalls().length;
    const result = await c.taskVariant(assistant.id, 'summarize');

    expect(result).toBe(false);
    expect(startCalls().length).toBe(startsBefore);
  });
});
