import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;
const SITE = 'https://rules.test';

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

async function sendIn(c: ReturnType<typeof createConversation>): Promise<string> {
  return c.send({
    content: 'hola',
    kind: 'translate',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    stream: true,
  });
}

function lastRequestId(): string {
  return startCalls().at(-1)?.['requestId'] as string;
}

// The worker reads the site only from this field when page info is off, so every path must send it.
describe("every request names the conversation's site", () => {
  it('Send, Retry and a new version all carry it', async () => {
    const c = createConversation();
    await c.openConversation(`${SITE}#k1`);
    const failed = await sendIn(c);
    c.applyChunk({ type: 'error', requestId: lastRequestId(), code: 'SERVER', message: 'x' });
    const retried = await c.retry(failed);
    c.applyChunk({ type: 'done', requestId: lastRequestId(), confidence: 1 });
    expect(await c.langVariant(retried?.turnId ?? '', asLangIdUnsafe('fr'))).toBe(true);

    expect(startCalls()).toHaveLength(3);
    expect(startCalls().map((m) => m['siteOrigin'])).toEqual([SITE, SITE, SITE]);
  });

  it('a conversation on other pages names no site', async () => {
    const c = createConversation();
    await sendIn(c);

    expect(startCalls()).toHaveLength(1);
    expect('siteOrigin' in (startCalls()[0] ?? {})).toBe(false);
  });
});
