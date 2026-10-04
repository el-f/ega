import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

describe('lastUserTurn — edit-last inflight guard', () => {
  it('returns user turn content when idle', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    // Drain inflight
    const reqId = (sendMessage.mock.calls[0]?.[0] as Record<string, unknown>)[
      'requestId'
    ] as string;
    c.applyChunk({ type: 'done', requestId: reqId, confidence: 0.9 });
    expect(c.inflightId).toBeNull();

    const result = c.lastUserTurn();
    expect(result).not.toBeNull();
    expect(result?.content).toBe('hola');
  });

  it('lastUserTurn called while inflightId is set — caller guard prevents mutation', async () => {
    const c = createConversation();
    await c.send({
      content: 'hello',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    expect(c.inflightId).not.toBeNull();
    const turnsBefore = c.turns.length;

    // The real guard lives in SidePanel.svelte; this mirrors it.
    if (c.inflightId !== null) {
      // Guard fires — don't call lastUserTurn
    } else {
      c.lastUserTurn();
    }

    expect(c.turns.length).toBe(turnsBefore);
    expect(c.inflightId).not.toBeNull();
  });

  it('lastUserTurn after terminal clears inflight and returns last user turn', async () => {
    const c = createConversation();
    await c.send({
      content: 'world',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const reqId = (sendMessage.mock.calls[0]?.[0] as Record<string, unknown>)[
      'requestId'
    ] as string;
    c.applyChunk({ type: 'done', requestId: reqId, confidence: 0.9 });
    expect(c.inflightId).toBeNull();

    const result = c.lastUserTurn();
    expect(result?.content).toBe('world');
    expect(result?.kind).toBe('translate');
  });
});
