import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';

const sendMessage = chrome.runtime.sendMessage as Mock;

const ES = asLangIdUnsafe('es');
const EN = asLangIdUnsafe('en');
const FR = asLangIdUnsafe('fr');

function starts(): Array<Record<string, unknown>> {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
}

function lastStart(): Record<string, unknown> {
  const last = starts().at(-1);
  if (!last) throw new Error('expected at least one translate:start call');
  return last;
}

function lastOptions(): Record<string, unknown> {
  return lastStart()['options'] as Record<string, unknown>;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

function finish(c: ReturnType<typeof createConversation>): void {
  c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string, confidence: 0.9 });
}

function fail(c: ReturnType<typeof createConversation>): void {
  c.applyChunk({
    type: 'error',
    requestId: lastStart()['requestId'] as string,
    code: 'NETWORK',
    message: 'boom',
  });
}

async function firstAnswer(c: ReturnType<typeof createConversation>): Promise<string> {
  await c.send({
    content: 'hola',
    kind: 'translate',
    sourceLang: ES,
    targetLang: EN,
    stream: true,
  });
  finish(c);
  const a = c.turns.at(-1);
  if (a?.role !== 'assistant') throw new Error('expected assistant turn');
  return a.id;
}

describe('createConversation().retry on a failed sibling variant', () => {
  it('retries a failed language variant in its language, beside the surviving answer', async () => {
    const c = createConversation();
    const assistantId = await firstAnswer(c);
    await c.langVariant(assistantId, FR);
    fail(c);
    const before = starts().length;

    await c.retry(assistantId);

    expect(starts().length).toBe(before + 1);
    expect(lastStart()['targetLang']).toBe(FR);
    const a = c.turns.find((t) => t.id === assistantId);
    expect(a).toBeDefined();
    expect(a?.variants?.map((v) => [v.status, v.targetLang])).toEqual([
      ['done', undefined],
      ['pending', FR],
    ]);
    expect(a?.activeVariantIdx).toBe(1);
  });

  it('retries a failed refinement with the same refinement body', async () => {
    const c = createConversation();
    const assistantId = await firstAnswer(c);
    await c.refine({ turnId: assistantId, refinementBody: 'Make outputs shorter.' });
    fail(c);

    await c.retry(assistantId);

    expect(lastOptions()['refinement']).toBe('Make outputs shorter.');
    const a = c.turns.find((t) => t.id === assistantId);
    expect(a?.variants?.length).toBe(2);
    expect(a?.variants?.[1]?.refinementBody).toBe('Make outputs shorter.');
  });

  it('retries a failed swap with the languages still swapped', async () => {
    const c = createConversation();
    const assistantId = await firstAnswer(c);
    await c.swapVariant(assistantId);
    fail(c);

    await c.retry(assistantId);

    expect(lastStart()['sourceLang']).toBe(EN);
    expect(lastStart()['targetLang']).toBe(ES);
  });

  it('retries a failed task variant under the same task', async () => {
    const c = createConversation();
    const assistantId = await firstAnswer(c);
    await c.taskVariant(assistantId, 'reword');
    fail(c);

    await c.retry(assistantId);

    expect(lastOptions()['task']).toBe('reword');
    expect(c.turns.find((t) => t.id === assistantId)?.variants?.[1]?.task).toBe('reword');
  });

  it('still replaces the whole turn when the only answer failed', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: ES,
      targetLang: EN,
      stream: true,
    });
    fail(c);
    const failedId = c.turns.at(-1)?.id;
    if (!failedId) throw new Error('expected assistant turn');

    await c.retry(failedId);

    const assistant = c.turns.at(-1);
    expect(assistant?.id).not.toBe(failedId);
    expect(assistant?.variants?.length).toBe(1);
    expect(c.turns.filter((t) => t.role === 'assistant').length).toBe(1);
  });
});
