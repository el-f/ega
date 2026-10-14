import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;

function lastStart(): Record<string, unknown> {
  const all = sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
  const last = all[all.length - 1];
  if (!last) throw new Error('expected at least one translate:start call');
  return last;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

async function exchange(
  c: ReturnType<typeof createConversation>,
  content: string,
): Promise<string> {
  await c.send({
    content,
    kind: 'translate',
    sourceLang: asLangIdUnsafe('en'),
    targetLang: asLangIdUnsafe('es'),
    stream: true,
  });
  const req = lastStart()['requestId'] as string;
  c.applyChunk({ type: 'done', requestId: req, confidence: 0.9 });
  const assistants = c.turns.filter((t) => t.role === 'assistant');
  const a = assistants[assistants.length - 1];
  if (!a) throw new Error('expected an assistant turn');
  return a.id;
}

describe('retry keeps the reply next to the message it answers', () => {
  it('re-dispatching an older turn leaves the reply in place, not at the bottom', async () => {
    const c = createConversation();
    const assistantId1 = await exchange(c, 'one');
    await exchange(c, 'two');
    const before = c.turns.map((t) => t.role);

    await c.retry(assistantId1);

    expect(c.turns.map((t) => t.role)).toEqual(before);
    const first = c.turns[0];
    const second = c.turns[1];
    expect(first?.role).toBe('user');
    expect(second?.role).toBe('assistant');
    expect(second?.attachedToTurnId).toBe(first?.id);
  });

  it('the retried turn is the one that streams, still in its own slot', async () => {
    const c = createConversation();
    const assistantId1 = await exchange(c, 'one');
    await exchange(c, 'two');

    await c.retry(assistantId1);
    const inflightIdx = c.turns.findIndex((t) => t.id === c.inflightId);

    expect(inflightIdx).toBe(1);
  });
});
