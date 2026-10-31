import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  dispatchImageTranslate,
  type ImageTranslateDispatchDeps,
} from '@/background/imageTranslateDispatch';
import type { Msg } from '@/shared/messages';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { PageContext, Settings } from '@/shared/types';
import type { CustomTask } from '@/shared/settings-schema';

// Page context for an image request: the worker asks the tab, anchored at the image, under the text path's gates.

const IMG = 'https://shop.example.com/label.png';
const CTX: PageContext = {
  pageTitle: 'Oat drink 1 L, no added sugar',
  pageUrl: 'https://shop.example.com/item/42',
  imageAlt: 'Back label',
};

/** The custom image task the harness runs; page context on, as a user who wants it sets it. */
function labelTask(over: Partial<CustomTask> = {}): CustomTask {
  return {
    id: 'c-label',
    label: 'Label check',
    system: '',
    user: 'Check {{text}}',
    output: 'plain',
    pageContext: true,
    image: true,
    glossary: false,
    createdAt: 1,
    ...over,
  };
}

const tabSend = chrome.tabs.sendMessage as unknown as Mock;

afterEach(() => {
  tabSend.mockResolvedValue({ ok: true });
});

/** The tab answers the context ask with `reply`; any other tab message gets the default answer. */
function tabAnswers(reply: unknown): void {
  tabSend.mockImplementation((_tabId: number, msg: { kind?: string }) =>
    Promise.resolve(msg.kind === 'ega:get-page-context' ? reply : { ok: true }),
  );
}

function contextAsks(): unknown[] {
  return tabSend.mock.calls
    .map((c) => c[1] as Msg)
    .filter((m) => m.kind === 'ega:get-page-context');
}

type RouterReq = Parameters<ImageTranslateDispatchDeps['router']['handleImageTranslate']>[0];

function harness(over: Partial<ImageTranslateDispatchDeps> = {}, settings: Partial<Settings> = {}) {
  const sent: RouterReq[] = [];
  const tab: Msg[] = [];
  const broadcast: Msg[] = [];
  const run: ImageTranslateDispatchDeps['router']['handleImageTranslate'] = async (req, emit) => {
    sent.push(req);
    emit({ type: 'done', requestId: req.id, text: 'ok' });
  };
  const deps: ImageTranslateDispatchDeps = {
    tabId: 7,
    imageUrl: IMG,
    requestId: 'req-1',
    task: 'c-label',
    surface: 'tooltip',
    getSettings: async () => ({ ...DEFAULT_SETTINGS, ...settings }),
    getCustomTasks: async () => [labelTask()],
    router: { handleImageTranslate: run, handleImageExplain: run },
    broadcast: (m) => broadcast.push(m),
    sendToTab: (_id, m) => tab.push(m),
    logger: { error: vi.fn() },
    ...over,
  };
  return { deps, sent, tab, broadcast };
}

describe('an image request carries page context like a text request', () => {
  it('asks the tab for context anchored at the image, at the set level, and sends it to the router', async () => {
    tabAnswers({ context: CTX });
    const h = harness({}, { pageContextLevel: 'rich' });
    await dispatchImageTranslate(h.deps);
    expect(contextAsks()).toEqual([{ kind: 'ega:get-page-context', level: 'rich', imageUrl: IMG }]);
    expect(tabSend.mock.calls[0]?.[0]).toBe(7);
    expect(h.sent[0]).toMatchObject({ id: 'req-1', task: 'c-label', context: CTX });
  });

  it('Explain on an image carries it too', async () => {
    tabAnswers({ context: CTX });
    const h = harness({ task: 'explain' });
    await dispatchImageTranslate(h.deps);
    expect(h.sent[0]).toMatchObject({ context: CTX });
  });

  it('the tooltip result carries what was sent, so About this reply can show it', async () => {
    tabAnswers({ context: CTX });
    const h = harness();
    await dispatchImageTranslate(h.deps);
    expect(h.tab.at(-1)).toMatchObject({ kind: 'content:image-translate-result', context: CTX });
  });

  it('the side-panel seed carries it, live and queued, so the turn records what was sent', async () => {
    tabAnswers({ context: CTX });
    const h = harness({ surface: 'sidepanel' });
    const queued = vi.spyOn(chrome.storage.session, 'set');
    await dispatchImageTranslate(h.deps);
    expect(h.broadcast[0]).toMatchObject({ kind: 'sidepanel:seed-image-translate', context: CTX });
    expect(queued.mock.calls[0]?.[0]).toMatchObject({
      'ega.pendingImageSeed': { 'req-1': { context: CTX } },
    });
    expect(h.sent[0]).toMatchObject({ context: CTX });
  });

  it('cuts and type-checks what the tab replies before it goes anywhere', async () => {
    tabAnswers({ context: { pageTitle: 't'.repeat(5000), pageUrl: 42, headingTrail: [1, 'H'] } });
    const h = harness();
    await dispatchImageTranslate(h.deps);
    expect(h.sent[0]?.context).toEqual({ pageTitle: 't'.repeat(2000), headingTrail: ['H'] });
  });

  it('the tooltip shows its loading state before the page answers the context ask', async () => {
    vi.useFakeTimers();
    try {
      tabSend.mockImplementation(() => new Promise(() => {}));
      const h = harness();
      const run = dispatchImageTranslate(h.deps);
      await vi.advanceTimersByTimeAsync(0);
      expect(contextAsks()).toHaveLength(1);
      expect(h.tab.map((m) => m.kind)).toEqual(['content:image-translate-pending']);
      await vi.advanceTimersByTimeAsync(1000);
      await run;
      expect(h.tab.map((m) => m.kind)).toEqual([
        'content:image-translate-pending',
        'content:image-translate-result',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('names the tab host, so site rules match as on the text path', async () => {
    const h = harness({ pageHost: 'shop.example.com' });
    await dispatchImageTranslate(h.deps);
    expect(h.sent[0]).toMatchObject({ pageHost: 'shop.example.com' });
  });
});

describe('each off switch sends no page context', () => {
  async function runWith(
    over: Partial<ImageTranslateDispatchDeps>,
    settings: Partial<Settings> = {},
  ): Promise<ReturnType<typeof harness>> {
    tabAnswers({ context: CTX });
    const h = harness(over, settings);
    await dispatchImageTranslate(h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).not.toHaveProperty('context');
    return h;
  }

  it('"Send page context" off: the tab is never asked', async () => {
    await runWith({}, { contextEnabled: false });
    expect(contextAsks()).toEqual([]);
  });

  it('the built-in image Translate: its image prompt takes no page info, so the tab is never asked', async () => {
    const h = await runWith({ task: 'translate' });
    expect(contextAsks()).toEqual([]);
    expect(h.tab.at(-1)).not.toHaveProperty('context');
  });

  it("the task's own page-context switch is off: nothing is read, queued or saved", async () => {
    const h = await runWith({
      surface: 'sidepanel',
      getCustomTasks: async () => [labelTask({ pageContext: false })],
    });
    expect(contextAsks()).toEqual([]);
    expect(h.broadcast[0]).toMatchObject({ kind: 'sidepanel:seed-image-translate' });
    expect(h.broadcast[0]).not.toHaveProperty('context');
  });

  it('Explain with page context turned off on the Tasks tab: the tab is never asked', async () => {
    await runWith({ task: 'explain' }, { taskOverrides: { explain: { pageContext: false } } });
    expect(contextAsks()).toEqual([]);
  });

  it('a custom task that no longer exists, or a failed task read: the tab is never asked', async () => {
    await runWith({ getCustomTasks: async () => [] });
    await runWith({ getCustomTasks: () => Promise.reject(new Error('storage gone')) });
    expect(contextAsks()).toEqual([]);
  });

  it('an extension page with no tab: nothing to ask', async () => {
    await runWith({ tabId: -1 });
    expect(contextAsks()).toEqual([]);
  });

  it('the site is off or the image sits in a skipped region: the tab answers null', async () => {
    tabAnswers({ context: null });
    const h = harness();
    await dispatchImageTranslate(h.deps);
    expect(contextAsks()).toHaveLength(1);
    expect(h.sent[0]).not.toHaveProperty('context');
    expect(h.tab.at(-1)).not.toHaveProperty('context');
  });

  it('a page that never answers: after a second the image goes, without page info', async () => {
    vi.useFakeTimers();
    try {
      tabSend.mockImplementation(() => new Promise(() => {}));
      const h = harness();
      const run = dispatchImageTranslate(h.deps);
      await vi.advanceTimersByTimeAsync(999);
      expect(h.sent).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      await run;
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).not.toHaveProperty('context');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a tab with no content script: the image still goes, without page info', async () => {
    tabSend.mockRejectedValue(new Error('Could not establish connection.'));
    const h = harness();
    await dispatchImageTranslate(h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).not.toHaveProperty('context');
  });
});
