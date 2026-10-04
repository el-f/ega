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

describe('a dispatch that never reaches the background', () => {
  it('marks its own turn errored', async () => {
    sendMessage.mockRejectedValue(new Error('port closed'));
    const c = createConversation();

    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });

    const assistant = c.turns.find((t) => t.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(c.inflightId).toBeNull();
  });

  it('keeps Retry, because nothing was billed', async () => {
    sendMessage.mockRejectedValue(new Error('port closed'));
    const c = createConversation();

    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });

    const assistant = c.turns.find((t) => t.role === 'assistant');
    // Outside the policy table on purpose: UNKNOWN is non-retryable, and this turn is retryable.
    expect(assistant?.error?.code).toBe('dispatch-failed');
    expect(assistant?.error?.message).toBe(
      'Ega could not send this. Try again, or reload the extension.',
    );
    expect(assistant?.variants?.[0]?.error?.code).toBe('dispatch-failed');
  });

  it('leaves a turn that took the slot while it was in flight alone', async () => {
    const gate: { reject: (() => void) | null } = { reject: null };
    sendMessage.mockImplementation((msg: { kind?: string }) => {
      if (msg.kind === 'translate:start' && gate.reject === null) {
        return new Promise((_resolve, reject) => {
          gate.reject = () => reject(new Error('port closed'));
        });
      }
      return Promise.resolve({ ok: true });
    });
    const c = createConversation();

    const pending = c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    await Promise.resolve();
    c.seedExternalImageTurn('req-image', 'https://pic.test/a.png');
    const seededInflight = c.inflightId;
    gate.reject?.();
    await pending;

    expect(c.inflightId).toBe(seededInflight);
    expect(c.ownsRequest('req-image')).toBe(true);
  });
});
