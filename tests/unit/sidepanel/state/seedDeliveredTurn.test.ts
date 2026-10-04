import { describe, it, expect } from 'vitest';
import { retryableTurnIds } from '@/sidepanel/state/conversation';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';

/** seedDeliveredTurn adds a tooltip escalation's finished answer (or image + OCR) as a done exchange, with no re-dispatch. */
const DISPATCH = {
  sourceLang: 'auto',
  targetLang: asLangIdUnsafe('en'),
  stream: true,
} as const;

describe('createConversation().seedDeliveredTurn', () => {
  it('seeds a user turn + a done assistant turn carrying the explanation body', () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'explain',
      sourceText: 'bonjour',
      response: 'A French greeting.',
      ...DISPATCH,
    });
    const user = c.turns.find((t) => t.role === 'user');
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!user || !assistant) throw new Error('expected paired turns');
    expect(user.kind).toBe('explain');
    expect(user.content).toBe('bonjour');
    expect(assistant.attachedToTurnId).toBe(user.id);
    expect(assistant.status).toBe('done');
    expect(assistant.content).toBe('A French greeting.');
  });

  it('attaches the image data url to the user turn for the open-image surface', () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'image-translate',
      sourceText: 'ocr text here',
      imageDataUrl: 'data:image/png;base64,AAAA',
      response: 'Welcome to the group chat',
      ...DISPATCH,
    });
    const user = c.turns.find((t) => t.role === 'user');
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!user || !assistant) throw new Error('expected paired turns');
    expect(user.imageDataUrl).toBe('data:image/png;base64,AAAA');
    expect(assistant.content).toBe('Welcome to the group chat');
    expect(assistant.status).toBe('done');
  });

  it('leaves nothing inflight — the delivered turn is terminal', () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'explain',
      sourceText: 'hola',
      response: 'A Spanish greeting.',
      ...DISPATCH,
    });
    expect(c.inflightId).toBeNull();
  });

  it('a delivered text turn is refinable — re-dispatch with a refinement is valid', async () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'translate',
      sourceText: 'hola',
      response: 'hello',
      ...DISPATCH,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('no assistant turn');
    expect(retryableTurnIds(c.turns).has(assistant.id)).toBe(true);
    const ok = await c.refine({ turnId: assistant.id, refinementBody: 'shorter' });
    expect(ok).toBe(true);
  });

  it('a delivered image turn re-runs the vision pass, because the image is kept', () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'image-translate',
      sourceText: 'ocr text',
      imageDataUrl: 'data:image/png;base64,AAAA',
      response: 'translated',
      ...DISPATCH,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('no assistant turn');
    expect(retryableTurnIds(c.turns).has(assistant.id)).toBe(true);
  });

  it('a turn whose image never arrived has nothing to replay', async () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'image-translate',
      sourceText: IMAGE_TURN_PLACEHOLDER,
      imageDropped: true,
      response: 'Exit only',
      ...DISPATCH,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('no assistant turn');
    expect(retryableTurnIds(c.turns).has(assistant.id)).toBe(false);
    expect(await c.refine({ turnId: assistant.id, refinementBody: 'shorter' })).toBe(false);
  });

  it('a turn whose image never arrived does not borrow a later text turn’s dispatch', async () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'image-translate',
      sourceText: IMAGE_TURN_PLACEHOLDER,
      imageDropped: true,
      response: 'Exit only',
      ...DISPATCH,
    });
    const imageAnswer = c.turns.find((t) => t.role === 'assistant');
    if (!imageAnswer) throw new Error('no assistant turn');
    c.seedDeliveredTurn({ kind: 'translate', sourceText: 'hola', response: 'hello', ...DISPATCH });
    expect(await c.refine({ turnId: imageAnswer.id, refinementBody: 'shorter' })).toBe(false);
  });

  it('appends rather than replacing when a conversation already exists', () => {
    const c = createConversation();
    c.seedDeliveredTurn({ kind: 'explain', sourceText: 'one', response: 'first', ...DISPATCH });
    c.seedDeliveredTurn({ kind: 'explain', sourceText: 'two', response: 'second', ...DISPATCH });
    expect(c.turns.filter((t) => t.role === 'user')).toHaveLength(2);
    expect(c.turns.filter((t) => t.role === 'assistant')).toHaveLength(2);
  });
});

describe('createConversation().send', () => {
  it('records no replay for an image the panel refused, so no Retry is offered', async () => {
    const c = createConversation();
    await c.send({
      content: IMAGE_TURN_PLACEHOLDER,
      kind: 'image-translate',
      imageDataUrl: 'data:image/bmp;base64,Qk0=',
      ...DISPATCH,
    });
    const assistant = c.turns.find((t) => t.role === 'assistant');
    if (!assistant) throw new Error('no assistant turn');
    expect(retryableTurnIds(c.turns).has(assistant.id)).toBe(false);
  });
});
