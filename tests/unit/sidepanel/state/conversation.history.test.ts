import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { activeVariant, type Variant } from '@/sidepanel/state/conversation';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';

const en = asLangIdUnsafe('en');

/** Drives the real routing key: chunks reach the turn only through the live requestId. */
function lastRequestId(): string {
  const starts = (chrome.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
  const last = starts[starts.length - 1];
  if (!last) throw new Error('expected at least one translate:start call');
  return last['requestId'] as string;
}

function completeAssistant(c: ReturnType<typeof createConversation>, text: string): void {
  const reqId = lastRequestId();
  // Send delta so content is non-empty, then terminal done.
  c.applyChunk({ type: 'delta', requestId: reqId, text: text });
  c.applyChunk({ type: 'done', requestId: reqId, confidence: 0.9 });
}

beforeEach(() => {
  (chrome.runtime.sendMessage as Mock).mockClear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

describe('send() — conversationHistory assembly', () => {
  it('first send on an empty conversation omits conversationHistory', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect('conversationHistory' in msg.options).toBe(false);
  });

  it('third send attaches the prior 2 exchanges as conversationHistory (4 ChatTurns)', async () => {
    const c = createConversation();

    // Exchange 1
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'hello');

    // Exchange 2
    await c.send({
      content: 'gracias',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'thanks');

    // Exchange 3 — under test
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.send({
      content: 'adios',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });

    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    const history: { role: string; content: string }[] = msg.options.conversationHistory;

    expect(history).toBeDefined();
    expect(history).toHaveLength(4);
    expect(history[0]).toEqual({ role: 'user', content: 'hola' });
    expect(history[1]).toEqual(expect.objectContaining({ role: 'assistant' }));
    expect(history[2]).toEqual({ role: 'user', content: 'gracias' });
    expect(history[3]).toEqual(expect.objectContaining({ role: 'assistant' }));

    // The third send's own text must NOT appear in the history.
    expect(history.some((h) => h.content === 'adios')).toBe(false);
  });

  it('an earlier image message reads as an image, not as the "[image]" render marker', async () => {
    const c = createConversation();
    await c.send({
      content: '[image]',
      kind: 'image-translate',
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'Hello there');
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.send({
      content: 'what does it say?',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(msg.options.conversationHistory).toEqual([
      { role: 'user', content: '(sent an image)' },
      { role: 'assistant', content: 'Hello there' },
    ]);
  });
});

describe('retry() — conversationHistory assembly', () => {
  it('a retry sends the same history the first attempt sent', async () => {
    const c = createConversation();

    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'hello');

    await c.send({
      content: 'gracias',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'thanks');

    const assistantId = await c.send({
      content: 'adios',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    c.applyChunk({
      type: 'error',
      requestId: lastRequestId(),
      code: 'NETWORK',
      message: 'boom',
    });

    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.retry(assistantId);

    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    const history: { role: string; content: string }[] = msg.options.conversationHistory;

    expect(history).toBeDefined();
    expect(history).toHaveLength(4);
    expect(history[0]).toEqual({ role: 'user', content: 'hola' });
    expect(history[2]).toEqual({ role: 'user', content: 'gracias' });
    // The retried turn is the request, not its own context.
    expect(history.some((h) => h.content === 'adios')).toBe(false);
  });

  /** One finished Translate exchange; returns its reply's id. */
  async function exchange(
    c: ReturnType<typeof createConversation>,
    content: string,
    answer: string,
  ): Promise<string> {
    const id = await c.send({
      content,
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, answer);
    return id;
  }
  const lastStart = (): { options: Record<string, unknown> } =>
    (chrome.runtime.sendMessage as Mock).mock.calls
      .map((c) => c[0] as { kind: string; options: Record<string, unknown> })
      .filter((m) => m.kind === 'translate:start')
      .at(-1) as { options: Record<string, unknown> };
  const shown = (c: ReturnType<typeof createConversation>, id: string): Variant | undefined => {
    const t = c.turns.find((x) => x.id === id);
    return t === undefined ? undefined : activeVariant(t);
  };
  const ABOUT = { task: 'Translate', original: 'mar7aba', result: 'hello' };

  it('a new version of an answer to a question resends the earlier turns and the reply it was about', async () => {
    const c = createConversation();
    const reply = await exchange(c, 'mar7aba', 'hello');
    const answerId = await c.send({
      content: 'why?',
      kind: 'ask',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
      about: { turnId: reply, variantId: `${reply}:v1` },
    });
    expect(lastStart().options['askAbout']).toEqual(ABOUT);
    completeAssistant(c, 'because');

    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.regenerateVariant(answerId);

    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(msg.options.askAbout).toEqual(ABOUT);
    expect(msg.options.conversationHistory).toEqual([
      { role: 'user', content: 'mar7aba' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('a question keeps which reply it asks about, never that reply’s text', async () => {
    const c = createConversation();
    const reply = await exchange(c, 'secret-original', 'secret-result');
    const answerId = await c.send({
      content: 'why?',
      kind: 'ask',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
      about: { turnId: reply, variantId: `${reply}:v1` },
    });
    const question = c.turns.find(
      (t) => t.id === c.turns.find((a) => a.id === answerId)?.attachedToTurnId,
    );
    expect(question?.about).toEqual({ turnId: reply, variantId: `${reply}:v1` });
    expect(JSON.stringify(question)).not.toContain('secret');
  });

  it('every re-run builds the block from the thread and the names as they are then', async () => {
    let views = SHIPPED_TASK_VIEWS;
    const c = createConversation({ askLabels: () => ({ views, varieties: [] }) });
    const reply = await exchange(c, 'mar7aba', 'hello');
    const answerId = await c.send({
      content: 'why?',
      kind: 'ask',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
      about: { turnId: reply },
    });
    completeAssistant(c, 'because');
    views = SHIPPED_TASK_VIEWS.map((v) => (v.id === 'translate' ? { ...v, label: 'Render' } : v));
    expect(await c.regenerateVariant(answerId)).toBe(true);
    expect(lastStart().options['askAbout']).toEqual({ ...ABOUT, task: 'Render' });
  });

  it('"Ask instead" asks the text about the earlier reply with the history, and its re-runs keep both', async () => {
    const c = createConversation();
    const reply = await exchange(c, 'mar7aba', 'hello');
    const translated = await exchange(c, 'what does it mean', 'what does it mean');
    const history = [
      { role: 'user', content: 'mar7aba' },
      { role: 'assistant', content: 'hello' },
    ];

    (chrome.runtime.sendMessage as Mock).mockClear();
    expect(await c.taskVariant(translated, 'ask', { turnId: reply })).not.toBeNull();
    const asked = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(asked.text).toBe('what does it mean');
    expect(asked.options.task).toBe('ask');
    expect(asked.options.askAbout).toEqual(ABOUT);
    expect(asked.options.conversationHistory).toEqual(history);
    completeAssistant(c, 'It asks what a word means.');

    // The reference lives on the version, so Regenerate and a language change ask about the reply again.
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.regenerateVariant(translated);
    const again = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(again.options.askAbout).toEqual(ABOUT);
    expect(again.options.conversationHistory).toEqual(history);
    completeAssistant(c, 'It asks for a meaning.');
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.langVariant(translated, asLangIdUnsafe('fr'));
    expect((chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0].options.askAbout).toEqual(ABOUT);
    completeAssistant(c, 'Il demande un sens.');

    // Answered again as Translate, the text goes alone.
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.taskVariant(translated, 'translate');
    const plain = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect('askAbout' in plain.options).toBe(false);
    expect('conversationHistory' in plain.options).toBe(false);
  });

  describe('a re-run while the reply asked about is deleted', () => {
    it('an "Ask instead" version re-run sends no block and says so; after Undo its re-runs ask about the reply again', async () => {
      const c = createConversation();
      const e = await exchange(c, 'secret-original', 'secret-result');
      const t = await exchange(c, 'what does it mean', 'what does it mean');
      expect(await c.taskVariant(t, 'ask', { turnId: e })).not.toBeNull();
      completeAssistant(c, 'It asks.');
      const slice = c.deleteTurn(e);
      expect(await c.regenerateVariant(t)).toBe(true);
      expect(lastStart().options['task']).toBe('ask');
      expect(lastStart().options).not.toHaveProperty('askAbout');
      expect(JSON.stringify(lastStart().options)).not.toContain('secret');
      completeAssistant(c, 'It asks, again.');
      expect(shown(c, t)?.aboutUnsent).toBe(true);

      if (slice === null) throw new Error('nothing deleted');
      expect(c.restoreTurns(slice)).toBe(true);
      // It still sent nothing, but its own re-runs ask about the reply again.
      expect(shown(c, t)?.aboutUnsent).toBe(true);
      expect(await c.regenerateVariant(t)).toBe(true);
      expect(lastStart().options['askAbout']).toEqual({
        task: 'Translate',
        original: 'secret-original',
        result: 'secret-result',
      });
      completeAssistant(c, 'It asks, once more.');
      expect(shown(c, t)).not.toHaveProperty('aboutUnsent');
    });

    it('a Retry of a failed answer to a question sends no block and says so, even once Undo brings the reply back', async () => {
      const c = createConversation();
      const e = await exchange(c, 'secret-original', 'secret-result');
      const failed = await c.send({
        content: 'why?',
        kind: 'ask',
        sourceLang: 'auto',
        targetLang: en,
        stream: false,
        about: { turnId: e },
      });
      c.applyChunk({ type: 'error', requestId: lastRequestId(), code: 'NETWORK', message: 'x' });
      const question = c.turns.find((x) => x.id === failed)?.attachedToTurnId;
      const slice = c.deleteTurn(e);
      await c.retry(failed);
      expect(lastStart().options['task']).toBe('ask');
      expect(lastStart().options).not.toHaveProperty('askAbout');
      const answer = c.turns.find((x) => x.role === 'assistant' && x.attachedToTurnId === question);
      expect(shown(c, answer?.id ?? '')?.aboutUnsent).toBe(true);

      if (slice === null) throw new Error('nothing deleted');
      expect(c.restoreTurns(slice)).toBe(true);
      expect(c.turns.find((x) => x.id === question)?.about).toEqual({ turnId: e });
      expect(shown(c, answer?.id ?? '')?.aboutUnsent).toBe(true);
    });
  });

  describe('a question and its answer go only with a question', () => {
    const ORIGINAL = { role: 'user', content: 'ya ibn el kalb, kifak' };
    const TRANSLATION = { role: 'assistant', content: 'Hello, you son of a bitch.' };
    const QUESTION = { role: 'user', content: 'levantive only?' };
    const ANSWER = { role: 'assistant', content: 'Yes. They are Levantine slang.' };
    const startFor = (text: string): { options: Record<string, unknown> } =>
      (chrome.runtime.sendMessage as Mock).mock.calls
        .map((c) => c[0] as { kind: string; text: string; options: Record<string, unknown> })
        .filter((m) => m.kind === 'translate:start' && m.text === text)
        .at(-1) as { options: Record<string, unknown> };
    const send = (
      c: ReturnType<typeof createConversation>,
      content: string,
      kind: 'translate' | 'explain' = 'translate',
    ) => c.send({ content, kind, sourceLang: 'auto', targetLang: en, stream: false });

    /** The owner's thread: a translation, then a question about it, both answered. Returns the translation's id. */
    async function translatedThenAsked(c: ReturnType<typeof createConversation>): Promise<string> {
      const reply = await exchange(c, ORIGINAL.content, TRANSLATION.content);
      await c.send({
        content: QUESTION.content,
        kind: 'ask',
        sourceLang: 'auto',
        targetLang: en,
        stream: false,
        about: { turnId: reply, variantId: `${reply}:v1` },
      });
      completeAssistant(c, ANSWER.content);
      return reply;
    }

    it.each(['translate', 'explain'] as const)(
      'after a question, a %s send carries the earlier exchange, not the question or its answer',
      async (kind) => {
        const c = createConversation();
        await translatedThenAsked(c);
        await send(c, 'test', kind);
        expect(startFor('test').options['conversationHistory']).toEqual([ORIGINAL, TRANSLATION]);
      },
    );

    it('a question sent after it still carries every earlier turn', async () => {
      const c = createConversation();
      const reply = await translatedThenAsked(c);
      await c.send({
        content: 'and Egyptian?',
        kind: 'ask',
        sourceLang: 'auto',
        targetLang: en,
        stream: false,
        about: { turnId: reply },
      });
      expect(startFor('and Egyptian?').options['conversationHistory']).toEqual([
        ORIGINAL,
        TRANSLATION,
        QUESTION,
        ANSWER,
      ]);
    });

    it('a Retry of a failed Translate after a question sends the same earlier exchange', async () => {
      const c = createConversation();
      await translatedThenAsked(c);
      const failed = await send(c, 'test');
      c.applyChunk({ type: 'error', requestId: lastRequestId(), code: 'NETWORK', message: 'x' });
      (chrome.runtime.sendMessage as Mock).mockClear();
      await c.retry(failed);
      expect(startFor('test').options['conversationHistory']).toEqual([ORIGINAL, TRANSLATION]);
    });

    it('a reply shown as its "Ask instead" answer is left out, and goes again once its translation is shown', async () => {
      const c = createConversation();
      const reply = await exchange(c, 'mar7aba', 'hello');
      const asked = await exchange(c, 'what does it mean', 'what does it mean');
      expect(await c.taskVariant(asked, 'ask', { turnId: reply })).not.toBeNull();
      completeAssistant(c, 'It asks what a word means.');
      const first = [
        { role: 'user', content: 'mar7aba' },
        { role: 'assistant', content: 'hello' },
      ];

      await send(c, 'shukran');
      expect(startFor('shukran').options['conversationHistory']).toEqual(first);
      completeAssistant(c, 'thanks');

      c.selectVariant(asked, 0);
      await send(c, 'yalla');
      expect(startFor('yalla').options['conversationHistory']).toEqual([
        ...first,
        { role: 'user', content: 'what does it mean' },
        { role: 'assistant', content: 'what does it mean' },
        { role: 'user', content: 'shukran' },
        { role: 'assistant', content: 'thanks' },
      ]);
    });

    it('a question shown as its "Answer again as Translate" version goes with a later Translate', async () => {
      const c = createConversation();
      const reply = await exchange(c, ORIGINAL.content, TRANSLATION.content);
      const answer = await c.send({
        content: QUESTION.content,
        kind: 'ask',
        sourceLang: 'auto',
        targetLang: en,
        stream: false,
        about: { turnId: reply },
      });
      completeAssistant(c, ANSWER.content);
      expect(await c.taskVariant(answer, 'translate')).not.toBeNull();
      completeAssistant(c, 'Levantine only?');

      await send(c, 'test');
      expect(startFor('test').options['conversationHistory']).toEqual([
        ORIGINAL,
        TRANSLATION,
        QUESTION,
        { role: 'assistant', content: 'Levantine only?' },
      ]);
    });
  });

  it('a refine variant sends no history, by choice, even with earlier exchanges', async () => {
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'hello');
    const assistantId = await c.send({
      content: 'gracias',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'thanks');

    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.refine({ turnId: assistantId, refinementBody: 'shorter' });

    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(msg.options.refinement).toBe('shorter');
    expect('conversationHistory' in msg.options).toBe(false);
  });
});
