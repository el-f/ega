import { describe, it, expect, vi, type Mock } from 'vitest';
import { createIntake, type Pickers } from '@/sidepanel/state/intake';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { toastStore } from '@/shared/components/toastStore';

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
});
