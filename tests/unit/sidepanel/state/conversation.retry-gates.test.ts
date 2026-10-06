import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { toastStore } from '@/shared/components/toastStore';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

async function sendThenFail(code: string, extra: Record<string, unknown> = {}) {
  const c = createConversation();
  const assistantId = await c.send({
    content: 'hola',
    kind: 'translate',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    stream: true,
  });
  const requestId = startCalls()[0]?.['requestId'] as string;
  c.applyChunk({ type: 'error', requestId, code, message: 'boom', ...extra } as never);
  return { c, assistantId };
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
  vi.restoreAllMocks();
});

// `r` calls retry() directly, so the button's gates have to live in retry() itself.
describe('retry() applies the gates the Retry button shows', () => {
  it('refuses a code that cannot succeed on a second try, and says why', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { c, assistantId } = await sendThenFail('AUTH');
    await c.retry(assistantId);
    expect(startCalls()).toHaveLength(1);
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Settings/);
  });

  // A cancel is neutral, so it retries like the tooltip's Retry rather than refusing.
  it('retries a canceled reply instead of refusing it', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { c, assistantId } = await sendThenFail('ABORTED');
    await c.retry(assistantId);
    expect(startCalls()).toHaveLength(2);
    expect(push).not.toHaveBeenCalled();
  });

  it('waits out a Retry-After window instead of firing inside it', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { c, assistantId } = await sendThenFail('RATE_LIMIT', { retryAfterMs: 30_000 });
    await c.retry(assistantId);
    expect(startCalls()).toHaveLength(1);
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Wait \d+s/);
    // The toast lives exactly as long as the wait it names.
    expect(push.mock.calls[0]?.[0]?.countdownMs).toBeGreaterThan(29_000);
    expect(push.mock.calls[0]?.[0]?.countdownMs).toBeLessThanOrEqual(30_000);
  });

  it('still retries a retryable code', async () => {
    const { c, assistantId } = await sendThenFail('NETWORK');
    await c.retry(assistantId);
    expect(startCalls()).toHaveLength(2);
  });
});

// The router stamps the failed backend on the error chunk; the card reads it off the turn.
describe('a failed reply keeps the backend that failed', () => {
  it('copies the backend id from the error chunk onto the turn', async () => {
    const { c, assistantId } = await sendThenFail('AUTH', { backendId: 'openai' });
    expect(c.turns.find((t) => t.id === assistantId)?.error?.backendId).toBe('openai');
  });

  it('leaves it off when no backend ran', async () => {
    const { c, assistantId } = await sendThenFail('NO_BACKEND');
    const error = c.turns.find((t) => t.id === assistantId)?.error;
    expect(error?.code).toBe('NO_BACKEND');
    expect(error && 'backendId' in error).toBe(false);
  });
});
