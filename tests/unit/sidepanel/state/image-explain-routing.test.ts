import { describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { addAssistantTurn, applyChunk, type Turn } from '@/sidepanel/state/conversation';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

function startCalls(): Array<{ options?: Record<string, unknown> }> {
  return (sendMessage.mock.calls as Array<[Record<string, unknown>]>)
    .map(([m]) => m)
    .filter((m) => m['kind'] === 'translate:start') as Array<{ options?: Record<string, unknown> }>;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

describe('an image sent with the Explain task reaches the vision-explain arm', () => {
  it('asks for explain, names the task, and carries the image', async () => {
    const c = createConversation();
    await c.send({
      content: 'what is this sign',
      kind: 'explain',
      imageDataUrl: PIXEL,
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const sent = startCalls().at(-1);
    expect(sent?.options?.['explain']).toBe(true);
    expect(sent?.options?.['task']).toBe('explain');
    expect(sent?.options?.['imageUrl']).toBe(PIXEL);
  });

  it('leaves a plain image translate on the OCR arm', async () => {
    const c = createConversation();
    await c.send({
      content: '[image]',
      kind: 'image-translate',
      imageDataUrl: PIXEL,
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const sent = startCalls().at(-1);
    expect(sent?.options?.['explain']).toBe(false);
    expect(sent?.options?.['task']).toBeUndefined();
    expect(sent?.options?.['imageUrl']).toBe(PIXEL);
  });
});

describe('a pinned explanation survives the first streamed chunk', () => {
  function seeded(): Turn[] {
    const user: Turn = {
      id: 'u1',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      createdAt: 1,
      content: 'hola',
    };
    return addAssistantTurn([user], {
      id: 'a1',
      kind: 'translate',
      attachedToTurnId: 'u1',
      explain: 'informal greeting',
    });
  }

  it('seeds the variant with the explanation, not just the turn', () => {
    const turns = seeded();
    expect(turns[1]?.variants?.[0]?.explain).toBe('informal greeting');
  });

  it('keeps it through a delta', () => {
    const turns = applyChunk(seeded(), 'a1', {
      type: 'delta',
      requestId: 'r1',
      text: '{"translation":"hi"',
    });
    expect(turns[1]?.explain).toBe('informal greeting');
  });

  it('keeps it through a done chunk that carries none of its own', () => {
    let turns = applyChunk(seeded(), 'a1', {
      type: 'delta',
      requestId: 'r1',
      text: '{"translation":"hi"}',
    });
    turns = applyChunk(turns, 'a1', { type: 'done', requestId: 'r1', confidence: 0.9 });
    expect(turns[1]?.explain).toBe('informal greeting');
    expect(turns[1]?.content).toBe('hi');
  });

  it('lets a response carrying its own explanation win', () => {
    let turns = applyChunk(seeded(), 'a1', {
      type: 'delta',
      requestId: 'r1',
      text: '{"translation":"hi","explain":"from the response"}',
    });
    turns = applyChunk(turns, 'a1', { type: 'done', requestId: 'r1', confidence: 0.9 });
    expect(turns[1]?.explain).toBe('from the response');
  });
});

describe('imageBackedTurnIds finds every image-carrying pair, whatever the kind', () => {
  it('matches an explain send that carried an image', async () => {
    const { imageBackedTurnIds } = await import('@/sidepanel/state/conversation');
    const turns: Turn[] = [
      {
        id: 'u1',
        role: 'user',
        kind: 'explain',
        status: 'idle',
        createdAt: 1,
        content: 'what is this',
        imageDataUrl: PIXEL,
      },
      {
        id: 'a1',
        role: 'assistant',
        kind: 'explain',
        status: 'done',
        createdAt: 2,
        content: 'a sign',
        attachedToTurnId: 'u1',
      },
    ];
    expect(imageBackedTurnIds(turns).has('a1')).toBe(true);
  });

  it('leaves a text pair alone', async () => {
    const { imageBackedTurnIds } = await import('@/sidepanel/state/conversation');
    const turns: Turn[] = [
      { id: 'u1', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'hola' },
      {
        id: 'a1',
        role: 'assistant',
        kind: 'translate',
        status: 'done',
        createdAt: 2,
        content: 'hi',
        attachedToTurnId: 'u1',
      },
    ];
    expect(imageBackedTurnIds(turns).size).toBe(0);
  });
});
