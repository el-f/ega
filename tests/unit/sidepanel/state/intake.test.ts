import { describe, it, expect, vi, type Mock } from 'vitest';
import { createIntake, type Pickers } from '@/sidepanel/state/intake';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { toastStore } from '@/shared/components/toastStore';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

const WORKER = { id: 'ega-test' } as chrome.runtime.MessageSender;

function intakeFor(panelWindowId: number | undefined): {
  intake: ReturnType<typeof createIntake>;
  conversation: ReturnType<typeof createConversation>;
} {
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
  });
  return { intake, conversation };
}

const seed = (windowId: number): unknown => ({
  kind: 'sidepanel:seed-image-translate',
  requestId: `req-${windowId}`,
  imageUrl: 'https://example.com/a.png',
  windowId,
});

describe('panel intake, without mounting the panel', () => {
  it("seeds an image click from this window and ignores another window's", () => {
    const { intake, conversation } = intakeFor(7);
    intake.onRuntimeMessage(seed(8), WORKER);
    expect(conversation.turns).toHaveLength(0);
    intake.onRuntimeMessage(seed(7), WORKER);
    expect(conversation.turns).toHaveLength(2);
    expect(conversation.ownsRequest('req-7')).toBe(true);
  });

  it("toasts another surface's failure but not this panel's own", () => {
    const push = vi.spyOn(toastStore, 'push');
    const { intake } = intakeFor(1);
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
    const user = (id: string, content: string): Turn =>
      ({ id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content }) as Turn;
    await saveThread('https://other.test', [user('o1', 'bonjour')]);
    await saveThread('https://a.test', [user('a1', 'hola')]);
    const { intake, conversation } = intakeFor(7);
    await conversation.followSite('https://a.test');
    expect(await conversation.openConversation('https://other.test')).toBe(true);

    intake.onRuntimeMessage(seed(7), WORKER);
    // A fast answer (an error, a cached reply) can arrive before the panel has switched.
    const chunk = (c: object): unknown => ({ kind: 'translate:chunk', chunk: c });
    intake.onRuntimeMessage(
      chunk({ type: 'delta', requestId: 'req-7', text: '{"translation":"hello"}' }),
      WORKER,
    );
    intake.onRuntimeMessage(chunk({ type: 'done', requestId: 'req-7' }), WORKER);
    expect(conversation.ownsRequest('req-7')).toBe(true);

    await vi.waitFor(() => expect(conversation.turns.at(-1)?.status).toBe('done'));
    expect(conversation.activeSite).toBe('https://a.test');
    expect(conversation.turns.map((t) => t.content)).toEqual(['hola', '[image]', 'hello']);
    await conversation.flush();
    expect((await loadThreadResult('https://other.test')).turns.map((t) => t.id)).toEqual(['o1']);
    expect((await loadThreadResult('https://a.test')).turns).toHaveLength(3);
  });
});
