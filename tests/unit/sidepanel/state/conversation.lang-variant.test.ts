import { afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import type { TurnKind } from '@/sidepanel/state/conversation';
import type { LangSelection } from '@/shared/types';

const sendMessage = chrome.runtime.sendMessage as Mock;

const ES = asLangIdUnsafe('es');
const EN = asLangIdUnsafe('en');
const FR = asLangIdUnsafe('fr');
const DE = asLangIdUnsafe('de');

function calls(kind: string): Array<Record<string, unknown>> {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === kind);
}

function lastStart(): Record<string, unknown> {
  const last = calls('translate:start').at(-1);
  if (!last) throw new Error('expected at least one translate:start call');
  return last;
}

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
});

function drain(c: ReturnType<typeof createConversation>): void {
  c.applyChunk({ type: 'done', requestId: lastStart()['requestId'] as string, confidence: 0.9 });
}

async function sendAndDrain(
  c: ReturnType<typeof createConversation>,
  opts: { kind?: TurnKind; sourceLang?: LangSelection; targetLang?: LangSelection } = {},
): Promise<string> {
  await c.send({
    content: 'hola',
    kind: opts.kind ?? 'translate',
    sourceLang: opts.sourceLang ?? ES,
    targetLang: opts.targetLang ?? EN,
    stream: true,
  });
  drain(c);
  const assistant = c.turns.at(-1);
  if (assistant?.role !== 'assistant') throw new Error('expected assistant turn');
  return assistant.id;
}

describe('createConversation().langVariant', () => {
  it('re-dispatches the last turn as a variant in the new language and records it', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c);
    const before = calls('translate:start').length;

    expect(await c.langVariant(assistantId, FR)).toBe(true);

    expect(calls('translate:start').length).toBe(before + 1);
    const msg = lastStart();
    expect(msg['sourceLang']).toBe(ES);
    expect(msg['targetLang']).toBe(FR);
    const a = c.turns.find((t) => t.id === assistantId);
    expect(a?.variants?.length).toBe(2);
    expect(a?.variants?.[1]?.targetLang).toBe(FR);
    expect(a?.activeVariantIdx).toBe(1);
    expect(c.inflightId).toBe(assistantId);
  });

  it('is a no-op when the active answer is already in that language', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c);
    const before = calls('translate:start').length;

    expect(await c.langVariant(assistantId, EN)).toBe(false);

    expect(calls('translate:start').length).toBe(before);
  });

  it('flips to a done variant already in that language instead of dispatching', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c);
    await c.langVariant(assistantId, FR);
    drain(c);
    const before = calls('translate:start').length;

    expect(await c.langVariant(assistantId, EN)).toBe(true);
    expect(c.turns.find((t) => t.id === assistantId)?.activeVariantIdx).toBe(0);
    expect(await c.langVariant(assistantId, FR)).toBe(true);
    expect(c.turns.find((t) => t.id === assistantId)?.activeVariantIdx).toBe(1);

    expect(calls('translate:start').length).toBe(before);
  });

  it('bails while an unrelated request is streaming', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: ES,
      targetLang: EN,
      stream: true,
    });
    const before = calls('translate:start').length;

    expect(await c.langVariant(c.turns.at(-1)?.id ?? '', FR)).toBe(false);

    expect(calls('translate:start').length).toBe(before);
    expect(calls('translate:cancel').length).toBe(0);
  });

  it('replaces its own still-streaming language variant on a second pick', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c);
    await c.langVariant(assistantId, FR);
    const frRequest = lastStart()['requestId'];

    expect(await c.langVariant(assistantId, DE)).toBe(true);

    expect(calls('translate:cancel').map((m) => m['requestId'])).toContain(frRequest);
    expect(lastStart()['targetLang']).toBe(DE);
    const a = c.turns.find((t) => t.id === assistantId);
    expect(a?.variants?.map((x) => x.targetLang)).toEqual([undefined, DE]);
    expect(a?.activeVariantIdx).toBe(1);
    expect(a?.status).toBe('pending');
  });

  it('returns false for a reply that is not in the thread', async () => {
    const c = createConversation();
    expect(await c.langVariant('missing', FR)).toBe(false);
    expect(calls('translate:start').length).toBe(0);
  });

  // D-a: "Translate into" acts on the reply it is picked from, an older one too.
  it('targets the reply it is given, not the newest', async () => {
    const c = createConversation();
    const first = await sendAndDrain(c);
    const second = await sendAndDrain(c);

    await c.langVariant(first, FR);

    expect(c.turns.find((t) => t.id === first)?.variants?.length).toBe(2);
    expect(c.turns.find((t) => t.id === second)?.variants?.length).toBe(1);
  });

  it('keeps an explain turn as explain', async () => {
    const c = createConversation();
    const id = await sendAndDrain(c, { kind: 'explain' });

    await c.langVariant(id, FR);

    const options = lastStart()['options'] as Record<string, unknown>;
    expect(options['explain']).toBe(true);
    expect(options['task']).toBe('explain');
  });
});

describe('createConversation().swapVariant — records its target', () => {
  it('stores the swapped target on the variant so a later language pick can reuse it', async () => {
    const c = createConversation();
    const assistantId = await sendAndDrain(c);

    await c.swapVariant(assistantId);

    expect(c.turns.find((t) => t.id === assistantId)?.variants?.[1]?.targetLang).toBe(ES);
  });
});
