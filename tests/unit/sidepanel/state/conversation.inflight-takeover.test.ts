import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;

function calls(kind: string): Array<Record<string, unknown>> {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === kind);
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

async function startStream(c: ReturnType<typeof createConversation>): Promise<string> {
  await c.send({
    content: 'hola',
    kind: 'translate',
    sourceLang: asLangIdUnsafe('es'),
    targetLang: asLangIdUnsafe('en'),
    stream: true,
  });
  const req = calls('translate:start')[0]?.['requestId'] as string;
  c.applyChunk({ type: 'delta', requestId: req, text: '{"translation":"he' });
  return req;
}

// Chunks for the displaced turn are dropped by the stale-request guard, so it spins forever.
describe('taking the inflight slot closes the running stream', () => {
  it('a second send cancels the turn it displaces', async () => {
    const c = createConversation();
    const req1 = await startStream(c);

    await c.send({
      content: 'adios',
      kind: 'translate',
      sourceLang: asLangIdUnsafe('es'),
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });

    const first = c.turns.filter((t) => t.role === 'assistant')[0];
    expect(first?.status).toBe('error');
    expect(calls('translate:cancel').map((m) => m['requestId'])).toContain(req1);
  });

  // A delivered pair is terminal and takes no slot, so it is not a displacement.
  it('a delivered seed leaves the running stream alone', async () => {
    const c = createConversation();
    const req1 = await startStream(c);

    c.seedDeliveredTurn({
      kind: 'explain',
      sourceText: 'word',
      response: 'meaning',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: false,
    });

    const first = c.turns.filter((t) => t.role === 'assistant')[0];
    expect(first?.status).toBe('streaming');
    expect(c.inflightId).toBe(first?.id);
    expect(calls('translate:cancel').map((m) => m['requestId'])).not.toContain(req1);
  });
});
