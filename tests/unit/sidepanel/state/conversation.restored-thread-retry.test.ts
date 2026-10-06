import { beforeEach, afterEach, describe, expect, it, type Mock } from 'vitest';
import { retryableTurnIds } from '@/sidepanel/state/conversation';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

/** Reopening the panel (or a tab-follow origin switch) nulls the panel-wide
 *  `lastDispatch` while the turns loaded from storage keep their own `dispatch`. */
async function restoredThread(): Promise<ReturnType<typeof createConversation>> {
  const c = createConversation();
  await c.openConversation('https://a.test');
  await c.send({
    content: 'marhaba',
    kind: 'translate',
    sourceLang: asLangIdUnsafe('ar'),
    targetLang: asLangIdUnsafe('en'),
    stream: false,
  });
  const req = startCalls()[0]?.['requestId'] as string;
  c.applyChunk({ type: 'delta', requestId: req, text: '{"translation":"hello"}' });
  c.applyChunk({ type: 'done', requestId: req, confidence: 0.9 });
  // Away and back: this is the real path that persists the thread, reloads it and
  // nulls `lastDispatch` while the loaded turns keep their own `dispatch`.
  await c.openConversation('https://b.test');
  await c.openConversation('https://a.test');
  return c;
}

describe('a thread restored from storage stays actionable', () => {
  it('setActiveOrigin drops the panel-wide dispatch but keeps the per-turn one', async () => {
    const c = await restoredThread();
    const userTurn = c.turns.find((t) => t.role === 'user');
    expect(userTurn?.dispatch).toBeDefined();
    const assistant = c.turns.find((t) => t.role === 'assistant');
    expect(assistant && retryableTurnIds(c.turns).has(assistant.id)).toBe(true);
  });

  it('retry re-dispatches from the turn, with no panel-wide dispatch', async () => {
    const c = await restoredThread();
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected a restored assistant turn');
    sendMessage.mockClear();

    await c.retry(assistant.id);

    expect(startCalls()).toHaveLength(1);
  });

  it('regenerate re-dispatches too, so the button is not a dead control', async () => {
    const c = await restoredThread();
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('expected a restored assistant turn');
    sendMessage.mockClear();

    const ok = await c.regenerateVariant(assistant.id);

    expect(ok).toBe(true);
    expect(startCalls()).toHaveLength(1);
  });
});
