import { beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Msg } from '@/shared/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

function lastRequestId(): string {
  const startCall = [...(sendMessage.mock.calls as Array<[unknown]>)]
    .reverse()
    .find(([msg]) => (msg as Msg | null)?.kind === 'translate:start');
  const requestId = (startCall?.[0] as { requestId?: string } | null)?.requestId;
  if (!requestId) throw new Error('translate:start not dispatched');
  return requestId;
}

describe('edit-last re-send keeps the replaced answer as a variant', () => {
  it('seeds a done prior variant and streams into the new active one', async () => {
    const c = createConversation();
    await c.send({
      content: 'edited question',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
      preservedResponse: 'the old answer',
    });

    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('assistant turn missing');
    expect(assistant.status).toBe('pending');
    expect(assistant.variants).toHaveLength(2);
    expect(assistant.variants?.[0]?.status).toBe('done');
    expect(assistant.variants?.[0]?.content).toBe('the old answer');
    expect(assistant.activeVariantIdx).toBe(1);

    const requestId = lastRequestId();
    c.applyChunk({ type: 'delta', requestId, text: '{"translation":"new answer"}' });
    c.applyChunk({ type: 'done', requestId, confidence: 1 });

    const after = c.turns.find((t) => t.id === assistant.id);
    expect(after?.status).toBe('done');
    expect(after?.content).toBe('new answer');
    // The stream landed on the active variant; the preserved one is untouched.
    expect(after?.variants?.[1]?.content).toBe('new answer');
    expect(after?.variants?.[0]?.content).toBe('the old answer');
  });

  it('the variant rail can flip back to the replaced answer', async () => {
    const c = createConversation();
    await c.send({
      content: 'edited question',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
      preservedResponse: 'the old answer',
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('assistant turn missing');
    const requestId = lastRequestId();
    c.applyChunk({ type: 'delta', requestId, text: '{"translation":"new answer"}' });
    c.applyChunk({ type: 'done', requestId, confidence: 1 });

    c.selectVariant(assistant.id, 0);
    const flipped = c.turns.find((t) => t.id === assistant.id);
    expect(flipped?.status).toBe('done');
    expect(flipped?.content).toBe('the old answer');
  });

  it('send without preservedResponse still seeds a single variant', async () => {
    const c = createConversation();
    await c.send({
      content: 'plain question',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    expect(assistant?.variants).toHaveLength(1);
    expect(assistant?.activeVariantIdx).toBe(0);
  });
});
