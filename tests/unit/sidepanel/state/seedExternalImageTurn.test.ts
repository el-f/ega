import { describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { retryableTurnIds } from '@/sidepanel/state/conversation';
import { asLangSelection } from '@/shared/brands';

const dispatch = {
  sourceLang: asLangSelection('auto'),
  targetLang: asLangSelection('en'),
  stream: true,
};

// The SW dispatches image translate on its own, so the panel has no turn id when chunks land.

describe('createConversation().seedExternalImageTurn', () => {
  it('appends a user image-translate turn carrying the imageUrl', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    const userTurns = c.turns.filter((t) => t.role === 'user');
    expect(userTurns).toHaveLength(1);
    const u = userTurns[0];
    if (!u) throw new Error('expected one user turn');
    expect(u.kind).toBe('image-translate');
    expect(u.content).toBe('[image]');
    expect(u.imageDataUrl).toBe('https://example.com/img.png');
  });

  it('appends a paired assistant turn linked to the user turn', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    const userTurns = c.turns.filter((t) => t.role === 'user');
    const assistantTurns = c.turns.filter((t) => t.role === 'assistant');
    expect(assistantTurns).toHaveLength(1);
    const a = assistantTurns[0];
    const u = userTurns[0];
    if (!a || !u) throw new Error('expected paired turns');
    expect(a.kind).toBe('image-translate');
    expect(a.attachedToTurnId).toBe(u.id);
  });

  it('a second seed for the same request (broadcast, then the queue drain) adds nothing', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    const inflight = c.inflightId;
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    expect(c.turns).toHaveLength(2);
    expect(c.inflightId).toBe(inflight);
    expect(c.turns.find((t) => t.role === 'assistant')?.status).toBe('pending');
  });

  it('sets the inflight id to the new assistant turn so chunks route correctly', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    expect(c.inflightId).not.toBeNull();
    expect(c.inflightId).toBe(assistantTurn.id);
  });

  it('chunk arriving after seed lands on the seeded assistant turn', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    c.applyChunk({ type: 'delta', requestId: 'req-1', text: 'hello' });
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    expect(assistantTurn.content).toBe('hello');
  });

  it('done chunk clears inflightId after seed', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    c.applyChunk({
      type: 'done',
      requestId: 'req-1',
      confidence: 0.9,
    });
    expect(c.inflightId).toBeNull();
  });

  it('error chunk lands on the seeded turn and clears inflightId', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    c.applyChunk({
      type: 'error',
      requestId: 'req-1',
      code: 'NETWORK',
      message: 'fetch failed',
    });
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    expect(assistantTurn.status).toBe('error');
    expect(assistantTurn.error).toBeDefined();
    expect(assistantTurn.error?.code).toBe('NETWORK');
    expect(assistantTurn.error?.message).toContain('fetch failed');
    expect(c.inflightId).toBeNull();
  });

  it('cancel after seed marks the assistant turn canceled', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png');
    c.cancel();
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    expect(assistantTurn.status).toBe('error');
    expect(assistantTurn.error?.code).toBe('cancelled');
    expect(c.inflightId).toBeNull();
  });

  it('seeding when a prior conversation exists appends new turns rather than replacing', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/a.png');
    c.applyChunk({ type: 'done', requestId: 'req-1', confidence: 1 });
    c.seedExternalImageTurn('req-2', 'https://example.com/b.png');
    expect(c.turns.filter((t) => t.role === 'user')).toHaveLength(2);
    expect(c.turns.filter((t) => t.role === 'assistant')).toHaveLength(2);
    const lastUser = c.turns.filter((t) => t.role === 'user').slice(-1)[0];
    if (!lastUser) throw new Error('expected last user turn');
    expect(lastUser.imageDataUrl).toBe('https://example.com/b.png');
  });
});

describe('seedExternalImageTurn — a context-menu image turn can be retried', () => {
  beforeEach(() => {
    (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  });

  it('records the dispatch so the paired assistant turn is retryable', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png', dispatch);
    const user = c.turns.find((t) => t.role === 'user');
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!user || !assistant) throw new Error('expected paired turns');
    expect(user.dispatch).toEqual(dispatch);
    expect(retryableTurnIds(c.turns).has(assistant.id)).toBe(true);
  });

  it('replays the image, not the [image] marker', async () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/img.png', dispatch);
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');
    c.applyChunk({
      type: 'error',
      requestId: 'req-1',
      code: 'NETWORK',
      message: 'fetch failed',
    });
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.retry(assistant.id);
    const sent = (chrome.runtime.sendMessage as Mock).mock.calls
      .map((call) => call[0] as { options?: { imageUrl?: string; task?: string } })
      .find((msg) => msg.options?.imageUrl !== undefined);
    expect(sent?.options?.imageUrl).toBe('https://example.com/img.png');
    expect(sent?.options?.task).toBeUndefined();
  });

  it('records no dispatch when the guard stripped the image', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-2', 'blob:https://example.com/abc', dispatch);
    const user = c.turns.find((t) => t.role === 'user');
    if (!user) throw new Error('expected user turn');
    expect(user.dispatch).toBeUndefined();
    expect(retryableTurnIds(c.turns).size).toBe(0);
  });

  it('keeps Retry reachable after a tab switch cancels the stream', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-3', 'https://example.com/img.png', dispatch);
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected assistant turn');
    c.cancel();
    const after = c.turns.find((t) => t.id === assistant.id);
    expect(after?.status).toBe('error');
    expect(retryableTurnIds(c.turns).has(assistant.id)).toBe(true);
  });
});
