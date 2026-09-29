import { describe, it, expect } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';

describe('applyChunk request-id routing', () => {
  it('drops chunks whose requestId does not match the current inflight request', () => {
    const c = createConversation();
    // The external-image path gives a known inflightId with no SW dispatch.
    c.seedExternalImageTurn('req-current', 'https://example.com/img.png');
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    const before = assistantTurn.content;

    c.applyChunk({ type: 'delta', requestId: 'req-stale', text: 'leaked text' });

    expect(assistantTurn.content, 'stale-request delta must not leak').toBe(before);
    expect(c.inflightId, 'inflight must remain open after stale chunk').not.toBeNull();
  });

  it('applies chunks whose requestId matches the current inflight request', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-current', 'https://example.com/img.png');
    c.applyChunk({ type: 'delta', requestId: 'req-current', text: 'hello' });
    const assistantTurn = c.turns.find((t) => t.role === 'assistant');
    if (!assistantTurn) throw new Error('expected assistant turn');
    expect(assistantTurn.content).toBe('hello');
  });

  it('stale done chunk does not close the current inflight turn', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-current', 'https://example.com/img.png');
    c.applyChunk({ type: 'done', requestId: 'req-stale', confidence: 0.5 });
    expect(c.inflightId, 'stale done must not clear inflight').not.toBeNull();
  });
});
