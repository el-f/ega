import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const en = asLangIdUnsafe('en');

/** Drives the real routing key: chunks reach the turn only through the live requestId. */
function lastRequestId(): string {
  const starts = (chrome.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
  const last = starts[starts.length - 1];
  if (!last) throw new Error('expected at least one translate:start call');
  return last['requestId'] as string;
}

function completeAssistant(c: ReturnType<typeof createConversation>, text: string): void {
  const reqId = lastRequestId();
  // Send delta so content is non-empty, then terminal done.
  c.applyChunk({ type: 'delta', requestId: reqId, text: text });
  c.applyChunk({ type: 'done', requestId: reqId, confidence: 0.9 });
}

beforeEach(() => {
  (chrome.runtime.sendMessage as Mock).mockClear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

describe('send() — conversationHistory assembly', () => {
  it('first send on an empty conversation omits conversationHistory', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect('conversationHistory' in msg.options).toBe(false);
  });

  it('third send attaches the prior 2 exchanges as conversationHistory (4 ChatTurns)', async () => {
    const c = createConversation();

    // Exchange 1
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'hello');

    // Exchange 2
    await c.send({
      content: 'gracias',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'thanks');

    // Exchange 3 — under test
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.send({
      content: 'adios',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });

    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    const history: { role: string; content: string }[] = msg.options.conversationHistory;

    expect(history).toBeDefined();
    expect(history).toHaveLength(4);
    expect(history[0]).toEqual({ role: 'user', content: 'hola' });
    expect(history[1]).toEqual(expect.objectContaining({ role: 'assistant' }));
    expect(history[2]).toEqual({ role: 'user', content: 'gracias' });
    expect(history[3]).toEqual(expect.objectContaining({ role: 'assistant' }));

    // The third send's own text must NOT appear in the history.
    expect(history.some((h) => h.content === 'adios')).toBe(false);
  });
});

describe('retry() — conversationHistory assembly', () => {
  it('a retry sends the same history the first attempt sent', async () => {
    const c = createConversation();

    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'hello');

    await c.send({
      content: 'gracias',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'thanks');

    const assistantId = await c.send({
      content: 'adios',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    c.applyChunk({
      type: 'error',
      requestId: lastRequestId(),
      code: 'NETWORK',
      message: 'boom',
    });

    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.retry(assistantId);

    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    const history: { role: string; content: string }[] = msg.options.conversationHistory;

    expect(history).toBeDefined();
    expect(history).toHaveLength(4);
    expect(history[0]).toEqual({ role: 'user', content: 'hola' });
    expect(history[2]).toEqual({ role: 'user', content: 'gracias' });
    // The retried turn is the request, not its own context.
    expect(history.some((h) => h.content === 'adios')).toBe(false);
  });

  it('a refine variant sends no history, by choice, even with earlier exchanges', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'hello');
    const assistantId = await c.send({
      content: 'gracias',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'thanks');

    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.refine({ turnId: assistantId, refinementBody: 'shorter' });

    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(msg.options.refinement).toBe('shorter');
    expect('conversationHistory' in msg.options).toBe(false);
  });
});
