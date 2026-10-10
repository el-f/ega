import { describe, it, expect, vi, type Mock } from 'vitest';
import { createIntake, type Pickers } from '@/sidepanel/state/intake';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { toastStore } from '@/shared/components/toastStore';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import type { Turn } from '@/sidepanel/state/conversation';
import { drainAsync } from '@tests/_helpers/async';

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
): Promise<{
  intake: ReturnType<typeof createIntake>;
  conversation: ReturnType<typeof createConversation>;
}> {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  const conversation = createConversation();
  let pickers: Pickers = {
    sourceLang: 'auto',
    targetLang: 'en',
    task: 'translate',
    tone: 'neutral',
  };
  const intake = createIntake({
    conversation,
    panelWindowId: () => panelWindowId,
    streaming: () => true,
    pickers: () => pickers,
    setPickers: (p) => (pickers = p),
    runnableTask: (t) => t,
    pageContext: () => Promise.resolve(null),
    clearFilters: () => {},
    attachImage: () => {},
    followSite: (site) => conversation.followSite(site),
    firstFollow,
  });
  // One turn of the queue: the intake learns that a settled first follow is over.
  await Promise.resolve();
  return { intake, conversation };
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
});
