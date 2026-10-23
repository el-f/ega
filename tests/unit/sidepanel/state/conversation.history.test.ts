import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { activeVariant, type Variant } from '@/sidepanel/state/conversation';
import { askedAbout } from '@/sidepanel/state/thread-view';

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

  it('a new version of an answer to a question resends the earlier turns and the reply it was about', async () => {
    const c = createConversation();
    await c.send({
      content: 'mar7aba',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'hello');
    const about = {
      turnId: 'a1',
      task: 'Translate',
      original: 'mar7aba',
      result: 'hello',
    };
    const answerId = await c.send({
      content: 'why?',
      kind: 'ask',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
      about,
    });
    const first = (chrome.runtime.sendMessage as Mock).mock.calls.at(-1)?.[0];
    expect(first.options.askAbout).toEqual(about);
    completeAssistant(c, 'because');

    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.regenerateVariant(answerId);

    const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(msg.options.askAbout).toEqual(about);
    expect(msg.options.conversationHistory).toEqual([
      { role: 'user', content: 'mar7aba' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('"Ask instead" asks the text about the earlier reply with the history, and its re-runs keep both', async () => {
    const c = createConversation();
    await c.send({
      content: 'mar7aba',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'hello');
    const translated = await c.send({
      content: 'what does it mean',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    completeAssistant(c, 'what does it mean');
    const about = { turnId: 'a1', task: 'Translate', original: 'mar7aba', result: 'hello' };
    const history = [
      { role: 'user', content: 'mar7aba' },
      { role: 'assistant', content: 'hello' },
    ];

    (chrome.runtime.sendMessage as Mock).mockClear();
    expect(await c.taskVariant(translated, 'ask', about)).toBe(true);
    const asked = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(asked.text).toBe('what does it mean');
    expect(asked.options.task).toBe('ask');
    expect(asked.options.askAbout).toEqual(about);
    expect(asked.options.conversationHistory).toEqual(history);
    completeAssistant(c, 'It asks what a word means.');

    // The about block lives on the version, so Regenerate and a language change send it again.
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.regenerateVariant(translated);
    const again = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect(again.options.askAbout).toEqual(about);
    expect(again.options.conversationHistory).toEqual(history);
    completeAssistant(c, 'It asks for a meaning.');
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.langVariant(translated, asLangIdUnsafe('fr'));
    expect((chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0].options.askAbout).toEqual(about);
    completeAssistant(c, 'Il demande un sens.');

    // Answered again as Translate, the text goes alone.
    (chrome.runtime.sendMessage as Mock).mockClear();
    await c.taskVariant(translated, 'translate');
    const plain = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
    expect('askAbout' in plain.options).toBe(false);
    expect('conversationHistory' in plain.options).toBe(false);
  });

  describe('a re-run while the reply asked about is deleted', () => {
    const lastStart = (): { options: Record<string, unknown> } =>
      (chrome.runtime.sendMessage as Mock).mock.calls
        .map((c) => c[0] as { kind: string; options: Record<string, unknown> })
        .filter((m) => m.kind === 'translate:start')
        .at(-1) as { options: Record<string, unknown> };
    const shown = (c: ReturnType<typeof createConversation>, id: string): Variant | undefined => {
      const t = c.turns.find((x) => x.id === id);
      return t === undefined ? undefined : activeVariant(t);
    };

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

    it('an "Ask instead" version re-run says it sent no copy, and gets the copy back with Undo', async () => {
      const c = createConversation();
      const e = await exchange(c, 'secret-original', 'secret-result');
      const t = await exchange(c, 'what does it mean', 'what does it mean');
      const about = {
        turnId: e,
        task: 'Translate',
        original: 'secret-original',
        result: 'secret-result',
      };
      expect(await c.taskVariant(t, 'ask', about)).toBe(true);
      completeAssistant(c, 'It asks.');
      const slice = c.deleteTurn(e);
      expect(await c.regenerateVariant(t)).toBe(true);
      expect(lastStart().options['task']).toBe('ask');
      expect(lastStart().options).not.toHaveProperty('askAbout');
      completeAssistant(c, 'It asks, again.');
      expect(askedAbout(shown(c, t))).toBe('unsent');

      if (slice === null) throw new Error('nothing deleted');
      expect(c.restoreTurns(slice)).toBe(true);
      // It still sent nothing, but its own re-runs ask about the reply again.
      expect(askedAbout(shown(c, t))).toBe('unsent');
      expect(await c.regenerateVariant(t)).toBe(true);
      expect(lastStart().options['askAbout']).toEqual(about);
    });

    it('a Retry of a failed answer to a question says it sent no copy, even once Undo brings the reply back', async () => {
      const c = createConversation();
      const e = await exchange(c, 'secret-original', 'secret-result');
      const about = {
        turnId: e,
        task: 'Translate',
        original: 'secret-original',
        result: 'secret-result',
      };
      const failed = await c.send({
        content: 'why?',
        kind: 'ask',
        sourceLang: 'auto',
        targetLang: en,
        stream: false,
        about,
      });
      c.applyChunk({ type: 'error', requestId: lastRequestId(), code: 'NETWORK', message: 'x' });
      const question = c.turns.find((x) => x.id === failed)?.attachedToTurnId;
      const slice = c.deleteTurn(e);
      await c.retry(failed);
      expect(lastStart().options['task']).toBe('ask');
      expect(lastStart().options).not.toHaveProperty('askAbout');
      const answer = c.turns.find((x) => x.role === 'assistant' && x.attachedToTurnId === question);
      expect(askedAbout(shown(c, answer?.id ?? ''))).toBe('unsent');

      if (slice === null) throw new Error('nothing deleted');
      expect(c.restoreTurns(slice)).toBe(true);
      expect(c.turns.find((x) => x.id === question)?.about).toEqual(about);
      expect(askedAbout(shown(c, answer?.id ?? ''))).toBe('unsent');
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
