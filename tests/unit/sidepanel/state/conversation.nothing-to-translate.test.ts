import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { loadThreadResult } from '@/sidepanel/state/conversation-store';
import { activeVariant, type TurnKind } from '@/sidepanel/state/conversation';
import { asLangIdUnsafe } from '@/shared/brands';
import type { TaskId } from '@/shared/task-view';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;
const EN = asLangIdUnsafe('en');
const FR = asLangIdUnsafe('fr');
const LINK = 'https://example.com/docs?id=42';

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

async function sent(content: string, kind: TurnKind = 'translate', taskId?: TaskId) {
  const c = createConversation();
  await c.openConversation('https://local-reply.test');
  const id = await c.send({
    content,
    kind,
    ...(taskId !== undefined ? { taskId } : {}),
    sourceLang: 'auto',
    targetLang: EN,
    stream: true,
  });
  const reply = (): ReturnType<typeof c.turns.find> => c.turns.find((t) => t.id === id);
  return { c, id, reply };
}

describe('a Translate of nothing to translate is answered in the panel', () => {
  it.each([LINK, 'someone@example.com', '12,50 €'])(
    '%s gets its text back, no request',
    async (text) => {
      const { c, reply } = await sent(text);

      expect(startCalls()).toHaveLength(0);
      expect(c.inflightId).toBeNull();
      const turn = reply();
      expect(turn).toMatchObject({ status: 'done', content: text });
      expect(turn?.confidence).toBeUndefined();
      expect(turn?.meta).toBeUndefined();
      expect(turn && activeVariant(turn)?.nothingToTranslate).toBe(true);
    },
  );

  it('is saved like any answer', async () => {
    const { c, id } = await sent(LINK);
    await c.flush();
    const stored = (await loadThreadResult('https://local-reply.test')).turns.find(
      (t) => t.id === id,
    );
    expect(stored && activeVariant(stored)).toMatchObject({
      status: 'done',
      nothingToTranslate: true,
    });
  });

  it.each([
    ['Explain', 'explain', undefined],
    ['a custom task', 'translate', 'custom-x'],
  ] as const)('%s of the same text still goes to the model', async (_, kind, taskId) => {
    await sent(LINK, kind, taskId as TaskId | undefined);
    expect(startCalls()).toHaveLength(1);
  });

  it('a word beside the link still goes to the model', async () => {
    await sent(`read ${LINK}`);
    expect(startCalls()).toHaveLength(1);
  });

  it('Translate into another language answers in the panel too', async () => {
    const { c, id, reply } = await sent(LINK);

    expect(await c.langVariant(id, FR)).toBe(true);

    expect(startCalls()).toHaveLength(0);
    const turn = reply();
    expect(turn && activeVariant(turn)).toMatchObject({
      status: 'done',
      content: LINK,
      targetLang: FR,
      nothingToTranslate: true,
    });
  });

  it('a typed change still reaches the model, which may do more than echo', async () => {
    const { c, id } = await sent(LINK);
    expect(await c.refine({ turnId: id, refinementBody: 'Say what this page is.' })).toBe(true);
    expect(startCalls()).toHaveLength(1);
  });

  it('Regenerate and `r` add nothing: the answer cannot change', async () => {
    const { c, id, reply } = await sent(LINK);

    expect(await c.retry(id)).toBeNull();
    expect(await c.regenerateVariant(id)).toBe(false);

    expect(startCalls()).toHaveLength(0);
    expect(reply()?.variants).toHaveLength(1);
  });
});
