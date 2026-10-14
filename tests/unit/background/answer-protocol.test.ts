import { afterEach, describe, expect, it, vi } from 'vitest';
import { wrapOnChunkForStreamingFlush } from '@/background/router-chunks';
import { createTranslateFsm } from '@/background/router-fsm';
import { addAssistantTurn, applyChunk } from '@/sidepanel/state/conversation';
import type { TranslationChunk } from '@/shared/types';
import { emitTerminal } from '@/shared/backends/base';

afterEach(() => vi.useRealTimers());

describe('visible answer chunk protocol', () => {
  it('leaves nonempty adapter text for the worker to interpret', () => {
    const chunks: TranslationChunk[] = [];
    emitTerminal((c) => chunks.push(c), 'r', 'Model', '{"answer":"Hello"}');
    expect(chunks).toEqual([{ type: 'done', requestId: 'r' }]);
  });
  it('coalesces replacements without appending the preamble back', () => {
    vi.useFakeTimers();
    const chunks: TranslationChunk[] = [];
    const emit = wrapOnChunkForStreamingFlush((c) => chunks.push(c), 100);
    emit({ type: 'delta', requestId: 'r', text: 'Preamble' });
    emit({ type: 'delta', requestId: 'r', text: 'Hello', replace: true });
    emit({ type: 'delta', requestId: 'r', text: ' there' });
    vi.advanceTimersByTime(100);
    expect(chunks).toEqual([{ type: 'delta', requestId: 'r', text: 'Hello there', replace: true }]);
  });

  it('keeps literal JSON in a visible answer and applies the authoritative final text', () => {
    const turns = addAssistantTurn([], { id: 'a', kind: 'ask', attachedToTurnId: 'u' });
    applyChunk(turns, 'a', {
      type: 'delta',
      requestId: 'r',
      text: '{"translation":"literal example"}',
    });
    expect(turns[0]?.content).toBe('{"translation":"literal example"}');
    applyChunk(turns, 'a', { type: 'delta', requestId: 'r', text: 'Corrected', replace: true });
    expect(turns[0]?.content).toBe('Corrected');
    applyChunk(turns, 'a', { type: 'done', requestId: 'r', text: 'Final' });
    expect(turns[0]?.content).toBe('Final');
  });

  it('uses terminal text for persistence even if the stream ended with an earlier reading', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    fsm.send({ type: 'delta', text: 'Preamble', now: 1 });
    fsm.send({ type: 'done', chunk: { type: 'done', requestId: 'r', text: 'Final' } });
    expect(fsm.context().finalText).toBe('Final');
  });
});
