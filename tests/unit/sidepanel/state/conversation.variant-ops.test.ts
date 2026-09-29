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

describe('createConversation().canSwap', () => {
  it('a later variety send does not unlock swap on an auto-source turn', async () => {
    const c = createConversation();
    await sendAndDrain(c, { sourceLang: 'auto', targetLang: 'en' });
    await sendAndDrain(c, { sourceLang: asLangIdUnsafe('es'), targetLang: 'en' });
    const autoTurn = c.turns.filter((t) => t.role === 'assistant')[0];
    if (!autoTurn) throw new Error('expected two assistant turns');

    const startsBefore = startCalls().length;
    expect(await c.swapVariant(autoTurn.id)).toBe(false);
    expect(startCalls().length).toBe(startsBefore);
    expect(c.canSwap(autoTurn.id)).toBe(false);
  });

  it('matches swapVariant on a variety-source turn', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c, {
      sourceLang: asLangIdUnsafe('es'),
      targetLang: 'en',
    });

    expect(c.canSwap(assistantId)).toBe(true);
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
    expect(c.canSwap(assistant.id)).toBe(true);
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

    expect(c.canSwap(assistant.id)).toBe(false);
  });

  it('is false for an unknown turn id', async () => {
    const c = createConversation();
    await sendAndDrain(c, { sourceLang: asLangIdUnsafe('es'), targetLang: 'en' });

    expect(c.canSwap('nonexistent-id')).toBe(false);
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
