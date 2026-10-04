import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

// imageDataUrl reaches <img src> before the router's SSRF check, so every state entry point drops unsafe URLs.
describe('conversation image-src render guard', () => {
  it('seedExternalImageTurn drops a metadata-endpoint imageUrl but still seeds the turn pair', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://169.254.169.254/latest/meta-data/');
    const u = c.turns.find((t) => t.role === 'user');
    if (!u) throw new Error('expected user turn');
    expect(u.imageDataUrl).toBeUndefined();
    // Turn pair still seeded — error chunks from the router's own
    // validation must have a slot to land on.
    expect(c.inflightId).not.toBeNull();
  });

  it('seedExternalImageTurn keeps a safe https imageUrl', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-1', 'https://example.com/a.png');
    const u = c.turns.find((t) => t.role === 'user');
    expect(u?.imageDataUrl).toBe('https://example.com/a.png');
  });

  it('seedDeliveredTurn strips an unsafe imageDataUrl', () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'image-translate',
      sourceText: 'ocr text',
      response: 'translated',
      imageDataUrl: 'data:image/svg+xml,<svg onload=alert(1)>',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const u = c.turns.find((t) => t.role === 'user');
    if (!u) throw new Error('expected user turn');
    expect(u.imageDataUrl).toBeUndefined();
  });

  it('seedDeliveredTurn keeps a raster data URL', () => {
    const c = createConversation();
    c.seedDeliveredTurn({
      kind: 'image-translate',
      sourceText: 'ocr text',
      response: 'translated',
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const u = c.turns.find((t) => t.role === 'user');
    expect(u?.imageDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('send drops an unsafe imageDataUrl from the user turn', async () => {
    const c = createConversation();
    await c.send({
      content: '[image]',
      kind: 'image-translate',
      imageDataUrl: 'data:text/html,<script>alert(1)</script>',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const u = c.turns.find((t) => t.role === 'user');
    if (!u) throw new Error('expected user turn');
    expect(u.imageDataUrl).toBeUndefined();
  });

  it('send keeps a raster data URL', async () => {
    const c = createConversation();
    await c.send({
      content: '[image]',
      kind: 'image-translate',
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const u = c.turns.find((t) => t.role === 'user');
    expect(u?.imageDataUrl).toBe('data:image/jpeg;base64,/9j/4AAQ');
  });
});
