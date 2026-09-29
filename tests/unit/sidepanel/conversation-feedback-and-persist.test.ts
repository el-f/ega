// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { saveThread, MAX_TURNS_PER_THREAD } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import { toastStore } from '@/shared/components/toastStore';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
  vi.restoreAllMocks();
});

describe('a blocked re-run says so instead of doing nothing', () => {
  it('names the running reply when a target-language pick cannot land', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const c = createConversation();
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const before = startCalls().length;
    expect(await c.langVariant(asLangIdUnsafe('fr'))).toBe(false);
    expect(startCalls()).toHaveLength(before);
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Wait for the current reply/);
  });

  it('disables the pencil while a reply streams, and says when it comes back', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'u1',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: 'hola',
    };
    const { container } = render(UserTurn, { props: { turn, inflight: true } });
    const pencil = container.querySelector<HTMLButtonElement>('[data-ega-edit]');
    expect(pencil?.disabled).toBe(true);
    expect(pencil?.getAttribute('aria-label')).toBe('Edit when this reply finishes');
  });
});

describe('a language pick carries the variant the reader is looking at', () => {
  it('re-answers with the same refinement instead of dropping it', async () => {
    const c = createConversation();
    const assistantId = await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const first = startCalls()[0]?.['requestId'] as string;
    c.applyChunk({ type: 'done', requestId: first });
    expect(await c.refine({ turnId: assistantId, refinementBody: 'shorter' })).toBe(true);
    const second = startCalls()[1]?.['requestId'] as string;
    c.applyChunk({ type: 'done', requestId: second });

    expect(await c.langVariant(asLangIdUnsafe('fr'))).toBe(true);
    const third = startCalls()[2];
    expect(third?.['targetLang']).toBe('fr');
    expect((third?.['options'] as Record<string, unknown>)['refinement']).toBe('shorter');
  });
});

describe('the store says what it dropped and what it could not read', () => {
  it('reports the turns the caps trimmed', async () => {
    const turns: Turn[] = [];
    for (let i = 0; i < MAX_TURNS_PER_THREAD + 4; i++) {
      turns.push({
        createdAt: i + 1,
        id: `t${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        kind: 'translate',
        status: i % 2 === 0 ? 'idle' : 'done',
        content: `body ${i}`,
        ...(i % 2 === 0 ? {} : { attachedToTurnId: `t${i - 1}` }),
      });
    }
    const res = await saveThread('https://trim.test', turns, {
      knownIds: new Set(turns.map((t) => t.id)),
      deletedAt: new Map(),
      revivedAt: new Map(),
    });
    expect(res.droppedTurns).toBe(4);
  });

  it('tells the panel when a stored thread cannot be read', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    await chrome.storage.local.set({ 'ega:conv:t:https://broken.test': { nonsense: true } });
    const c = createConversation();
    await c.setActiveOrigin('https://broken.test');
    expect(c.turns).toHaveLength(0);
    expect(push.mock.calls.some((call) => /could not be read/.test(call[0].message))).toBe(true);
  });
});

describe('a settled answer is written straight away', () => {
  it('does not wait out the save debounce', async () => {
    const c = createConversation();
    await c.setActiveOrigin('https://save.test');
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const requestId = startCalls()[0]?.['requestId'] as string;
    c.applyChunk({ type: 'delta', requestId, text: 'hello' });
    c.applyChunk({ type: 'done', requestId });
    await vi.waitFor(async () => {
      const stored = (await chrome.storage.local.get('ega:conv:t:https://save.test'))[
        'ega:conv:t:https://save.test'
      ] as { turns?: unknown[] } | undefined;
      const done = stored?.turns?.some((t) => (t as Record<string, unknown>)['status'] === 'done');
      if (done !== true) throw new Error('not written yet');
    });
  });
});

describe('the composer keeps its image, not just its text', () => {
  it('restores an attached image on the next mount', async () => {
    const { writeComposerDraftImage, readComposerDraftImage, clearComposerDraftImage } =
      await import('@/sidepanel/state/composer-draft');
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(await writeComposerDraftImage(png)).toBe(true);
    expect(await readComposerDraftImage()).toBe(png);
    await clearComposerDraftImage();
    expect(await readComposerDraftImage()).toBeNull();
  });

  it('refuses an image past the cap the thread store would strip it at', async () => {
    const { writeComposerDraftImage, readComposerDraftImage } =
      await import('@/sidepanel/state/composer-draft');
    const huge = `data:image/png;base64,${'A'.repeat(300 * 1024)}`;
    expect(await writeComposerDraftImage(huge)).toBe(false);
    expect(await readComposerDraftImage()).toBeNull();
  });
});

describe('clearing a filter leaves the reader where they were', () => {
  it('treats a filtered list that grew as no new turn', async () => {
    const ConversationStream = (await import('@/sidepanel/conversation/ConversationStream.svelte'))
      .default;
    const turn = (id: string): Turn => ({
      createdAt: 1,
      id,
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: id,
    });
    const { container, rerender } = render(ConversationStream, {
      props: {
        turns: [turn('u1')],
        latestTurnId: 'u9',
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    await tick();
    const scroller = container.querySelector<HTMLElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
    scroller.scrollTop = 100;

    // Same newest turn, more rows: this is a filter clearing, not an answer arriving.
    await rerender({
      turns: [turn('u1'), turn('u2')],
      latestTurnId: 'u9',
      focusedTurnId: null,
      onRetry: vi.fn(),
      onFocusChange: vi.fn(),
    });
    await tick();
    await tick();
    expect(scroller.scrollTop).toBe(100);
  });
});

describe('a handoff that stops a running reply says so', () => {
  it('is wired through the panel, not the conversation container', async () => {
    const src = (await import('node:fs')).readFileSync('src/sidepanel/SidePanel.svelte', 'utf8');
    expect(src).toMatch(/warnIfStoppingInflight/);
    expect(src).toMatch(/Stopped the current reply to answer your new selection/);
    expect(src).toMatch(/Language, task and tone set from your selection/);
  });
});
