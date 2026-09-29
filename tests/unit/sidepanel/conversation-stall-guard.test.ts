import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;

function calls(kind: string): Record<string, unknown>[] {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === kind);
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

async function sendOne(c: ReturnType<typeof createConversation>): Promise<string> {
  const assistantId = await c.send({
    content: 'hola',
    kind: 'translate',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    stream: true,
  });
  return assistantId;
}

// The tooltip and inline renderers already had this guard; the side panel was the one surface that could spin forever.
describe('side-panel stall guard', () => {
  it('fails a silent turn as TIMEOUT and cancels the request in the worker', async () => {
    const c = createConversation({ stallMs: () => 1_000 });
    const assistantId = await sendOne(c);
    const requestId = calls('translate:start')[0]?.['requestId'];
    expect(requestId).toBeTypeOf('string');

    vi.advanceTimersByTime(1_100);

    const turn = c.turns.find((t) => t.id === assistantId);
    expect(turn?.status).toBe('error');
    expect(c.inflightId).toBeNull();
    expect(calls('translate:cancel').map((m) => m['requestId'])).toEqual([requestId]);
  });

  it('every delta re-arms the guard, and a terminal chunk disarms it', async () => {
    const c = createConversation({ stallMs: () => 1_000 });
    const assistantId = await sendOne(c);
    const requestId = calls('translate:start')[0]?.['requestId'] as string;

    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(800);
      c.applyChunk({ type: 'delta', requestId, text: 'x' });
    }
    expect(c.turns.find((t) => t.id === assistantId)?.status).not.toBe('error');

    // The timer itself must be gone, not merely neutralized by the cleared request id.
    const armed = vi.getTimerCount();
    c.applyChunk({ type: 'done', requestId, confidence: 1 });
    expect(vi.getTimerCount()).toBe(armed - 1);
    vi.advanceTimersByTime(5_000);
    expect(calls('translate:cancel')).toHaveLength(0);
  });

  it('a user cancel disarms the guard so no second error lands on the canceled turn', async () => {
    const c = createConversation({ stallMs: () => 1_000 });
    await sendOne(c);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    c.cancel();
    // Cancel clears the stall timer and the pending persist together; nothing may stay armed.
    expect(vi.getTimerCount()).toBe(0);
    const cancels = calls('translate:cancel').length;
    vi.advanceTimersByTime(5_000);
    expect(calls('translate:cancel')).toHaveLength(cancels);
  });
});
