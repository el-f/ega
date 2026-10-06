import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { saveThread } from '@/sidepanel/state/conversation-store';

const sendMessage = chrome.runtime.sendMessage as Mock;

function lastRequestId(): string {
  const calls = sendMessage.mock.calls.filter(
    (c) => (c[0] as Record<string, unknown>)['kind'] === 'translate:start',
  );
  const raw = calls[calls.length - 1];
  if (!raw) throw new Error('no translate:start call found');
  return (raw[0] as Record<string, unknown>)['requestId'] as string;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

describe('createConversation().refine return value', () => {
  it('returns false when inflightId is set (bail case)', async () => {
    const c = createConversation();
    await c.send({
      content: 'hello',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    expect(c.inflightId).not.toBeNull();
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('no assistant turn');

    const result = await c.refine({ turnId: assistant.id, refinementBody: 'shorter' });

    expect(result).toBe(false);
  });

  it('returns true when idle and dispatch succeeds', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('no assistant turn');
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 });
    expect(c.inflightId).toBeNull();

    const result = await c.refine({ turnId: assistant.id, refinementBody: 'shorter' });

    expect(result).toBe(true);
  });

  it('returns false when turnId not found', async () => {
    const c = createConversation();
    await c.send({
      content: 'test',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 0.9 });

    const result = await c.refine({ turnId: 'nonexistent-id', refinementBody: 'shorter' });

    expect(result).toBe(false);
  });
});

describe('a stored turn the byte cap shrank gets its v1 back on load', () => {
  it('refine, swap and task variants work on it like any other settled turn', async () => {
    const origin = 'https://shrunk.test';
    const huge = 'y'.repeat(400 * 1024);
    await saveThread(origin, [
      {
        id: 'u1',
        role: 'user',
        kind: 'translate',
        status: 'idle',
        content: 'hola',
        createdAt: 1,
        dispatch: {
          sourceLang: asLangIdUnsafe('es'),
          targetLang: asLangIdUnsafe('en'),
          stream: false,
        },
      },
      {
        id: 'a1',
        role: 'assistant',
        kind: 'translate',
        status: 'done',
        content: huge,
        attachedToTurnId: 'u1',
        variants: [{ id: 'a1:v1', status: 'done', content: huge }],
        activeVariantIdx: 0,
        createdAt: 2,
      },
    ]);
    const c = createConversation();
    await c.openConversation(origin);
    const assistant = c.turns.find((t) => t.role === 'assistant');
    // Stored without variants (the byte cap strips them); the loader rebuilt v1 from the body it kept.
    expect(assistant?.variants).toHaveLength(1);
    expect(assistant?.variants?.[0]?.content.length).toBeGreaterThan(0);
    sendMessage.mockClear();

    expect(c.swapPair('a1')).not.toBeNull();
    expect(await c.refine({ turnId: 'a1', refinementBody: 'shorter' })).toBe(true);
    expect(
      sendMessage.mock.calls.filter(
        (call) => (call[0] as Record<string, unknown>)['kind'] === 'translate:start',
      ),
    ).toHaveLength(1);
    expect(c.turns.find((t) => t.id === 'a1')?.variants).toHaveLength(2);
    expect(c.inflightId).not.toBeNull();
    c.cancel();
  });
});
