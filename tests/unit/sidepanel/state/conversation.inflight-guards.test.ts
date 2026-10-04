import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;

function callsOfKind(kind: string): Record<string, unknown>[] {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === kind);
}

function nthRequestId(n: number): string {
  const calls = callsOfKind('translate:start');
  const raw = calls[n];
  if (!raw) throw new Error(`no translate:start call #${n}`);
  return raw['requestId'] as string;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

describe('retry() inflight guard', () => {
  it('is a no-op while another dispatch is inflight', async () => {
    const c = createConversation();
    // Turn 1 errors out.
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const erroredAssistant = c.turns.find((t) => t.role === 'assistant');
    if (!erroredAssistant) throw new Error('no assistant turn');
    c.applyChunk({
      type: 'error',
      requestId: nthRequestId(0),
      code: 'NETWORK',
      message: 'fetch failed',
    });
    // Turn 2 is streaming.
    await c.send({
      content: 'mundo',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const liveAssistantId = c.inflightId;
    expect(liveAssistantId).not.toBeNull();

    await c.retry(erroredAssistant.id);

    // Guarded: no third dispatch, live stream untouched.
    expect(callsOfKind('translate:start')).toHaveLength(2);
    expect(c.inflightId).toBe(liveAssistantId);
    // The errored turn is still there, untouched.
    expect(c.turns.some((t) => t.id === erroredAssistant.id)).toBe(true);
    // Live stream's chunks still route.
    c.applyChunk({ type: 'delta', requestId: nthRequestId(1), text: 'world' });
    const live = c.turns.find((t) => t.id === liveAssistantId);
    expect(live?.content).toBe('world');
  });

  it('still works when idle', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const erroredAssistant = c.turns.find((t) => t.role === 'assistant');
    if (!erroredAssistant) throw new Error('no assistant turn');
    c.applyChunk({
      type: 'error',
      requestId: nthRequestId(0),
      code: 'NETWORK',
      message: 'fetch failed',
    });
    expect(c.inflightId).toBeNull();

    await c.retry(erroredAssistant.id);

    expect(callsOfKind('translate:start')).toHaveLength(2);
    expect(c.inflightId).not.toBeNull();
  });
});

describe('seedExternalImageTurn() inflight guard', () => {
  it('cancels the prior inflight stream before seeding', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const priorAssistantId = c.inflightId;
    const priorRequestId = nthRequestId(0);
    if (!priorAssistantId) throw new Error('no inflight');

    c.seedExternalImageTurn('req-img', 'https://example.com/img.png');

    // Prior turn terminal (canceled), not stuck streaming.
    const prior = c.turns.find((t) => t.id === priorAssistantId);
    expect(prior?.status).toBe('error');
    expect(prior?.error?.code).toBe('cancelled');
    // SW told to abort the orphaned request.
    const cancels = callsOfKind('translate:cancel');
    expect(cancels.some((m) => m['requestId'] === priorRequestId)).toBe(true);
    // Seeded turn owns the inflight slot; its chunks route.
    const seeded = c.turns.filter((t) => t.role === 'assistant').slice(-1)[0];
    if (!seeded) throw new Error('no seeded assistant turn');
    expect(c.inflightId).toBe(seeded.id);
    c.applyChunk({ type: 'delta', requestId: 'req-img', text: 'ocr text' });
    expect(c.turns.find((t) => t.id === seeded.id)?.content).toBe('ocr text');
  });

  it('does not emit a cancel when idle', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-img', 'https://example.com/img.png');
    expect(callsOfKind('translate:cancel')).toHaveLength(0);
    expect(c.inflightId).not.toBeNull();
  });
});
