import { describe, it, expect, vi, type Mock, type MockInstance } from 'vitest';
import { createIntake, type Pickers } from '@/sidepanel/state/intake';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { toastStore } from '@/shared/components/toastStore';
import { loadThreadResult, saveThread, threadKey } from '@/sidepanel/state/conversation-store';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import type { Turn } from '@/sidepanel/state/conversation';
import { drainAsync } from '@tests/_helpers/async';
import type { PageContext } from '@/shared/types';

const WORKER = { id: 'ega-test' } as chrome.runtime.MessageSender;

const user = (id: string, content: string): Turn =>
  ({ id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content }) as Turn;

/** A promise the test settles by hand, standing in for the panel's first follow of the tab. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

async function intakeFor(
  panelWindowId: number | undefined,
  firstFollow: Promise<void> = Promise.resolve(),
  pageContext: () => Promise<PageContext | null> = () => Promise.resolve(null),
): Promise<{
  intake: ReturnType<typeof createIntake>;
  conversation: ReturnType<typeof createConversation>;
  askAbout: Mock<(replyId: string) => void>;
  pickers: () => Pickers;
}> {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  const conversation = createConversation();
  let pickers: Pickers = {
    sourceLang: 'auto',
    targetLang: 'en',
    task: 'translate',
    tone: 'neutral',
  };
  const askAbout = vi.fn<(replyId: string) => void>();
  const intake = createIntake({
    conversation,
    askAbout,
    panelWindowId: () => panelWindowId,
    streaming: () => true,
    pickers: () => pickers,
    setPickers: (p) => (pickers = p),
    runnableTask: (t) => t,
    pageContext,
    clearFilters: () => {},
    attachImage: () => {},
    followSite: (site) => conversation.followSite(site),
    firstFollow,
  });
  // One turn of the queue: the intake learns that a settled first follow is over.
  await Promise.resolve();
  return { intake, conversation, askAbout, pickers: () => pickers };
}

const seed = (windowId: number): unknown => ({
  kind: 'sidepanel:seed-image-translate',
  requestId: `req-${windowId}`,
  imageUrl: 'https://example.com/a.png',
  windowId,
});

describe('panel intake, without mounting the panel', () => {
  it("seeds an image click from this window and ignores another window's", async () => {
    const { intake, conversation } = await intakeFor(7);
    intake.onRuntimeMessage(seed(8), WORKER);
    expect(conversation.turns).toHaveLength(0);
    intake.onRuntimeMessage(seed(7), WORKER);
    expect(conversation.turns).toHaveLength(2);
    expect(conversation.ownsRequest('req-7')).toBe(true);
  });

  it("toasts another surface's failure but not this panel's own", async () => {
    const push = vi.spyOn(toastStore, 'push');
    const { intake } = await intakeFor(1);
    const failure = (surface: string): unknown => ({
      kind: 'audit:append',
      entry: { error: { code: 'NETWORK', message: 'down' }, surface },
    });
    intake.onRuntimeMessage(failure('sidepanel'), WORKER);
    expect(push).not.toHaveBeenCalled();
    intake.onRuntimeMessage(failure('popup'), WORKER);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('No connection') as unknown,
      }),
    );
    expect(push.mock.calls[0]?.[0].message).not.toContain('down');
    push.mockRestore();
  });

  it("lands an image click in the tab's site conversation, with a reply that came back during the switch", async () => {
    await saveThread('https://other.test', [user('o1', 'bonjour')]);
    await saveThread('https://a.test', [user('a1', 'hola')]);
    const { intake, conversation } = await intakeFor(7);
    await conversation.followSite('https://a.test');
    expect(await conversation.openConversation('https://other.test')).toBe(true);

    intake.onRuntimeMessage(seed(7), WORKER);
    // A fast answer (an error, a cached reply) can arrive before the panel has switched.
    const chunk = (c: object): unknown => ({ kind: 'translate:chunk', chunk: c });
    intake.onRuntimeMessage(chunk({ type: 'delta', requestId: 'req-7', text: 'hello' }), WORKER);
    intake.onRuntimeMessage(chunk({ type: 'done', requestId: 'req-7' }), WORKER);
    expect(conversation.ownsRequest('req-7')).toBe(true);

    await vi.waitFor(() => expect(conversation.turns.at(-1)?.status).toBe('done'));
    expect(conversation.activeSite).toBe('https://a.test');
    expect(conversation.turns.map((t) => t.content)).toEqual(['hola', '[image]', 'hello']);
    await conversation.flush();
    expect((await loadThreadResult('https://other.test')).turns.map((t) => t.id)).toEqual(['o1']);
    expect((await loadThreadResult('https://a.test')).turns).toHaveLength(3);
  });

  it('says nothing about a switch the panel was already making when the click came', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const follow = deferred();
    const { intake, conversation } = await intakeFor(7, follow.promise);
    // The panel is still opening: its first follow of the tab has started and not finished.
    const opening = conversation.followSite('https://a.test');
    intake.onRuntimeMessage(seed(7), WORKER);
    await opening;
    follow.resolve();

    await vi.waitFor(() => expect(conversation.turns).toHaveLength(2));
    expect(conversation.activeSite).toBe('https://a.test');
    expect(push).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/^Switched/) as unknown }),
    );
    push.mockRestore();
    // The seed's debounced save would otherwise land in the next test's storage.
    await conversation.flush();
  });

  it('lands a handoff drained before the first follow in the tab site conversation, after it', async () => {
    await saveThread('https://a.test', [user('a1', 'hola')]);
    const follow = deferred();
    const { intake, conversation } = await intakeFor(7, follow.promise);
    await writePendingPopupHandoff({
      sourceText: 'texto',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      response: 'text',
    });

    const draining = intake.drainPopupHandoffs();
    // Long enough for the whole drain to run, so a handoff that does not wait would land here.
    await drainAsync();
    expect(conversation.turns).toHaveLength(0);
    await conversation.followSite('https://a.test');
    follow.resolve();
    await draining;

    expect(conversation.activeSite).toBe('https://a.test');
    expect(conversation.turns.map((t) => t.content)).toEqual(['hola', 'texto', 'text']);
  });

  it('sends a handoff into its own conversation, without the page read, when the tab changes during that read', async () => {
    await saveThread('https://a.test', [user('a1', 'hola')]);
    await saveThread('https://b.test', [user('b1', 'hallo')]);
    let duringRead = (): Promise<unknown> => Promise.resolve();
    const { intake, conversation } = await intakeFor(7, Promise.resolve(), async () => {
      await duringRead();
      return { pageUrl: 'https://b.test/', pageTitle: 'B' };
    });
    await conversation.followSite('https://a.test');
    duringRead = () => conversation.followSite('https://b.test');
    await writePendingPopupHandoff({
      sourceText: 'texto',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });

    await intake.drainPopupHandoffs();

    expect(conversation.activeSite).toBe('https://a.test');
    expect(conversation.turns.map((t) => t.content).slice(0, 2)).toEqual(['hola', 'texto']);
    const start = (chrome.runtime.sendMessage as Mock).mock.calls
      .map(([m]) => m as { kind?: string; text?: string; context?: unknown })
      .filter((m) => m.kind === 'translate:start')
      .at(-1);
    expect(start?.text).toBe('texto');
    expect(start?.context).toBeFalsy();
    conversation.cancel();
    await conversation.flush();
    expect((await loadThreadResult('https://b.test')).turns.map((t) => t.id)).toEqual(['b1']);
  });

  it('sends a handoff into its own conversation when the read ends while the tab change still loads', async () => {
    await saveThread('https://a.test', [user('a1', 'hola')]);
    await saveThread('https://b.test', [user('b1', 'hallo')]);
    let duringRead = (): Promise<unknown> => Promise.resolve();
    const { intake, conversation } = await intakeFor(7, Promise.resolve(), async () => {
      await duringRead();
      return { pageUrl: 'https://b.test/', pageTitle: 'B' };
    });
    await conversation.followSite('https://a.test');
    // The tab change is parked in the read of b.test's thread when the page read returns.
    const reached = deferred();
    const hold = deferred();
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'get').mockImplementation((async (arg: unknown) => {
      if (arg === threadKey('https://b.test')) {
        reached.resolve();
        await hold.promise;
      }
      return await (original as (a: unknown) => Promise<Record<string, unknown>>)(arg);
    }) as typeof chrome.storage.local.get);
    let follow: Promise<boolean> = Promise.resolve(false);
    duringRead = async () => {
      follow = conversation.followSite('https://b.test');
      await reached.promise;
      setTimeout(hold.resolve, 0);
    };
    await writePendingPopupHandoff({
      sourceText: 'texto',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });

    await intake.drainPopupHandoffs();
    await follow;

    expect(conversation.activeSite).toBe('https://a.test');
    expect(conversation.turns.map((t) => t.content).slice(0, 2)).toEqual(['hola', 'texto']);
    conversation.cancel();
    await conversation.flush();
    expect((await loadThreadResult('https://b.test')).turns.map((t) => t.id)).toEqual(['b1']);
  });

  it('keeps a handoff out of its conversation when that one is deleted during the page read', async () => {
    await saveThread('https://a.test', [user('a1', 'hola')]);
    let duringRead = (): Promise<unknown> => Promise.resolve();
    const { intake, conversation } = await intakeFor(7, Promise.resolve(), async () => {
      await duringRead();
      return null;
    });
    await conversation.followSite('https://a.test');
    const deleted = conversation.activeId;
    let undo = (): void => {};
    duringRead = async () => {
      ({ undo } = await conversation.deleteConversation(deleted));
    };
    await writePendingPopupHandoff({
      sourceText: 'texto',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });

    await intake.drainPopupHandoffs();

    expect(conversation.activeId).not.toBe(deleted);
    expect(conversation.turns.map((t) => t.content)[0]).toBe('texto');
    conversation.cancel();
    await conversation.flush();
    // The delete's timer would otherwise fire in a later test.
    undo();
  });
});

describe('a tooltip Ask handoff', () => {
  const handoff = {
    sourceText: 'mar7aba, kifak?',
    sourceLang: 'auto',
    // The pickers start on English; a handoff into Spanish moves them.
    targetLang: 'es',
    task: 'translate',
    tone: 'neutral',
    response: 'Hola, ¿qué tal?',
    reply: { detectedLang: 'arabizi', detectedDetail: 'Levantine', confidence: 0.93 },
  } as const;
  const pickerToast = (push: MockInstance<typeof toastStore.push>): boolean =>
    push.mock.calls.some(([t]) => /Language, task and tone set/.test(t.message));

  it('seeds the detection and reports the seeded reply, setting the pickers without a toast', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const { intake, conversation, askAbout, pickers } = await intakeFor(7);
    await writePendingPopupHandoff({ ...handoff, ask: true });
    await intake.drainPopupHandoffs();

    const reply = conversation.turns.at(-1);
    expect(reply).toMatchObject({
      role: 'assistant',
      content: 'Hola, ¿qué tal?',
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine',
      confidence: 0.93,
    });
    expect(askAbout).toHaveBeenCalledExactlyOnceWith(reply?.id);
    expect(pickers().targetLang).toBe('es');
    expect(pickerToast(push)).toBe(false);
    push.mockRestore();
    await conversation.flush();
  });

  it('a plain handoff seeds the detection too, reports nothing, and says the pickers moved', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const { intake, conversation, askAbout } = await intakeFor(7);
    await writePendingPopupHandoff(handoff);
    await intake.drainPopupHandoffs();

    expect(conversation.turns.at(-1)).toMatchObject({ detectedDetail: 'Levantine' });
    expect(askAbout).not.toHaveBeenCalled();
    expect(pickerToast(push)).toBe(true);
    push.mockRestore();
    await conversation.flush();
  });

  it('an Ask whose reply must still run is sent, and reports nothing to ask about', async () => {
    const { intake, conversation, askAbout } = await intakeFor(7);
    const { response: _unused, reply: _reply, ...unfinished } = handoff;
    await writePendingPopupHandoff({ ...unfinished, ask: true });
    await intake.drainPopupHandoffs();

    // The message landed and went out as a plain request, not a question about anything.
    expect(conversation.turns.map((t) => t.content)).toContain('mar7aba, kifak?');
    const start = (chrome.runtime.sendMessage as Mock).mock.calls
      .map(([m]) => m as { kind?: string; text?: string; options?: Record<string, unknown> })
      .filter((m) => m.kind === 'translate:start')
      .at(-1);
    expect(start?.text).toBe('mar7aba, kifak?');
    expect(start?.options?.['askAbout']).toBeUndefined();
    expect(conversation.turns.at(-1)?.status).not.toBe('done');
    expect(askAbout).not.toHaveBeenCalled();
    conversation.cancel();
    await conversation.flush();
  });
});
