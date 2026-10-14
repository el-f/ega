import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;

function requestIdsOf(kind: string): string[] {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === kind)
    .map((m) => m['requestId'] as string);
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

describe('ownsRequest — duplicate-toast suppression key', () => {
  it('returns true for a requestId this sidepanel dispatched', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const [reqId] = requestIdsOf('translate:start');
    expect(reqId).toBeDefined();
    expect(c.ownsRequest(reqId)).toBe(true);
  });

  it('returns false for a foreign requestId (other surface)', () => {
    const c = createConversation();
    expect(c.ownsRequest('foreign-req-from-tooltip')).toBe(false);
  });

  it('returns false for an undefined requestId', () => {
    const c = createConversation();
    expect(c.ownsRequest(undefined)).toBe(false);
  });

  it('tracks requestIds across multiple dispatches', async () => {
    const c = createConversation();
    await c.send({
      content: 'one',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    // Close the first turn so the second send isn't inflight-guarded.
    const first = requestIdsOf('translate:start')[0];
    if (!first) throw new Error('no first requestId');
    c.applyChunk({ type: 'done', requestId: first, confidence: 1 });
    await c.send({
      content: 'two',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const ids = requestIdsOf('translate:start');
    expect(ids).toHaveLength(2);
    expect(c.ownsRequest(ids[0])).toBe(true);
    expect(c.ownsRequest(ids[1])).toBe(true);
  });

  it('records the requestId of an external image-translate seed', () => {
    const c = createConversation();
    c.seedExternalImageTurn('req-img-ext', 'https://example.com/img.png');
    expect(c.ownsRequest('req-img-ext')).toBe(true);
  });
});
