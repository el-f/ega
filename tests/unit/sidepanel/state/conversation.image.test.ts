import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function lastOptions(): Record<string, unknown> {
  const all = startCalls();
  const last = all[all.length - 1];
  if (!last) throw new Error('expected at least one translate:start call');
  return last['options'] as Record<string, unknown>;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

describe('createConversation().send — attached image', () => {
  it('forwards the attached image so the router can route it to a vision backend', async () => {
    const c = createConversation();
    await c.send({
      content: '[image]',
      kind: 'image-translate',
      imageDataUrl: PNG,
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });

    expect(lastOptions()['imageUrl']).toBe(PNG);
  });

  it('omits imageUrl on a plain text send', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });

    expect(lastOptions()['imageUrl']).toBeUndefined();
  });

  it('re-sends the image when the image turn is retried', async () => {
    const c = createConversation();
    const assistantId = await c.send({
      content: '[image]',
      kind: 'image-translate',
      imageDataUrl: PNG,
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const req = startCalls()[0]?.['requestId'] as string;
    // NETWORK, not UNKNOWN: retry() now applies the same gate the Retry button does.
    c.applyChunk({ type: 'error', requestId: req, code: 'NETWORK', message: 'boom' });

    await c.retry(assistantId);

    expect(startCalls()).toHaveLength(2);
    expect(lastOptions()['imageUrl']).toBe(PNG);
  });
});
