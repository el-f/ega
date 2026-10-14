// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import type { Msg } from '@/shared/messages';
import type { Turn } from '@/sidepanel/state/conversation';

const sendMessage = chrome.runtime.sendMessage as Mock;

beforeEach(() => {
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
  // jsdom lays nothing out: put the reply's start far down, so following keeps it in view (R57).
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = this.matches('[data-ega-reply]') ? replyTop : 0;
    return {
      top,
      bottom: top,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  replyTop = 5000;
});

/** Where the newest reply starts, in viewport pixels. */
let replyTop = 5000;

function lastRequestId(): string {
  const startCall = [...(sendMessage.mock.calls as Array<[unknown]>)]
    .reverse()
    .find(([msg]) => (msg as Msg | null)?.kind === 'translate:start');
  const requestId = (startCall?.[0] as { requestId?: string } | null)?.requestId;
  if (!requestId) throw new Error('translate:start not dispatched');
  return requestId;
}

function fakeGeometry(el: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

describe('ConversationStream — re-scroll when the last turn settles', () => {
  it('follows the stream when done mounts the footer (near-bottom reader)', async () => {
    const c = createConversation();
    await c.send({
      content: 'q',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const { container } = render(ConversationStream, {
      props: {
        turns: c.turns as readonly Turn[],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    fakeGeometry(scroller, 1000, 80);

    const requestId = lastRequestId();
    c.applyChunk({ type: 'delta', requestId, text: 'hi' });
    await tick();
    await tick();
    // Reader parked near the bottom before the terminal frame.
    scroller.scrollTop = 920;

    // done leaves content identical — only the status flip can trigger the re-scroll.
    c.applyChunk({ type: 'done', requestId, confidence: 1 });
    await tick();
    await tick();
    expect(scroller.scrollTop).toBe(1000);
  });

  it('leaves a reader alone who scrolled up past 80px', async () => {
    const c = createConversation();
    await c.send({
      content: 'q',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const { container } = render(ConversationStream, {
      props: {
        turns: c.turns as readonly Turn[],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    fakeGeometry(scroller, 1000, 80);

    const requestId = lastRequestId();
    c.applyChunk({ type: 'delta', requestId, text: 'hi' });
    await tick();
    await tick();
    scroller.scrollTop = 100;

    c.applyChunk({ type: 'done', requestId, confidence: 1 });
    await tick();
    await tick();
    expect(scroller.scrollTop).toBe(100);
  });
});

/** Height that grows with the rendered text, so the pre-effect measures the frame before the delta lands and the post-tick scroll sees the taller one — the order a real layout gives. */
function growingGeometry(el: HTMLElement, clientHeight: number): void {
  const base = 1000 - 10 * el.textContent.length;
  Object.defineProperty(el, 'scrollHeight', {
    get: () => base + 10 * el.textContent.length,
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

describe('ConversationStream — a delta append follows only a reader at the bottom', () => {
  async function streamingTurn(): Promise<{
    c: ReturnType<typeof createConversation>;
    scroller: HTMLDivElement;
    requestId: string;
  }> {
    const c = createConversation();
    await c.send({
      content: 'q',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const { container } = render(ConversationStream, {
      props: {
        turns: c.turns as readonly Turn[],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    const requestId = lastRequestId();
    c.applyChunk({ type: 'delta', requestId, text: 'hi' });
    await tick();
    await tick();
    growingGeometry(scroller, 80);
    return { c, scroller, requestId };
  }

  it('sticks to the bottom when the reader was there before the delta', async () => {
    const { c, scroller, requestId } = await streamingTurn();
    scroller.scrollTop = 920;
    c.applyChunk({ type: 'delta', requestId, text: ' there' });
    await tick();
    await tick();
    expect(scroller.scrollHeight).toBe(1060);
    expect(scroller.scrollTop).toBe(1060);
  });

  it('follows a reader whose pre-delta distance was inside the threshold the delta pushed past', async () => {
    const { c, scroller, requestId } = await streamingTurn();
    // 70px from the bottom before the delta, 230px after it: only a pre-update measurement follows.
    scroller.scrollTop = 850;
    c.applyChunk({ type: 'delta', requestId, text: ' there my friend' });
    await tick();
    await tick();
    expect(scroller.scrollHeight).toBe(1160);
    expect(scroller.scrollTop).toBe(1160);
  });

  it('does not move a reader who had scrolled up', async () => {
    const { c, scroller, requestId } = await streamingTurn();
    scroller.scrollTop = 100;
    c.applyChunk({ type: 'delta', requestId, text: ' there' });
    await tick();
    await tick();
    expect(scroller.scrollHeight).toBe(1060);
    expect(scroller.scrollTop).toBe(100);
  });
});

describe('ConversationStream — jump-to-latest affordance', () => {
  const u = (id: string, content: string): Turn => ({
    createdAt: 1,
    id,
    role: 'user',
    kind: 'translate',
    status: 'idle',
    content,
  });
  const a = (id: string, content: string, attached: string): Turn => ({
    createdAt: 1,
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    content,
    attachedToTurnId: attached,
  });

  it('shows the button once scrolled >80px from the bottom, and jumps on click', async () => {
    const { container } = render(ConversationStream, {
      props: {
        turns: [u('u1', 'hi'), a('a1', 'reply', 'u1')],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    // Flush mount effects so the scroll listener is attached.
    await tick();
    expect(container.querySelector('[data-ega-jump-latest]')).toBeNull();

    fakeGeometry(scroller, 1000, 100);
    scroller.scrollTop = 0;
    await fireEvent.scroll(scroller);
    await tick();

    const jump = container.querySelector<HTMLButtonElement>('[data-ega-jump-latest]');
    expect(jump).not.toBeNull();

    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
    if (!jump) throw new Error('jump button missing');
    await fireEvent.click(jump);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
  });

  it('stays at the bottom when the panel is resized, and leaves a scrolled-up reader alone', async () => {
    const observers: Array<() => void> = [];
    const original = globalThis.ResizeObserver;
    class CapturingResizeObserver {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = CapturingResizeObserver as unknown as typeof ResizeObserver;
    try {
      const { container } = render(ConversationStream, {
        props: {
          turns: [u('u1', 'hi'), a('a1', 'reply', 'u1')],
          focusedTurnId: null,
          onRetry: vi.fn(),
          onFocusChange: vi.fn(),
        },
      });
      const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
      if (!scroller) throw new Error('scroller not found');
      await tick();
      fakeGeometry(scroller, 1000, 100);

      // A reader at the bottom: a narrower panel makes the thread taller, so follow it.
      scroller.scrollTop = 900;
      await fireEvent.scroll(scroller);
      await tick();
      fakeGeometry(scroller, 1600, 100);
      observers.forEach((cb) => cb());
      expect(scroller.scrollTop).toBe(1600);

      // A reader who scrolled up keeps their place.
      scroller.scrollTop = 0;
      await fireEvent.scroll(scroller);
      await tick();
      fakeGeometry(scroller, 2000, 100);
      observers.forEach((cb) => cb());
      expect(scroller.scrollTop).toBe(0);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it('hides the button when back at the bottom', async () => {
    const { container } = render(ConversationStream, {
      props: {
        turns: [u('u1', 'hi'), a('a1', 'reply', 'u1')],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    // Flush mount effects so the scroll listener is attached.
    await tick();
    fakeGeometry(scroller, 1000, 100);
    scroller.scrollTop = 0;
    await fireEvent.scroll(scroller);
    await tick();
    expect(container.querySelector('[data-ega-jump-latest]')).not.toBeNull();

    scroller.scrollTop = 900;
    await fireEvent.scroll(scroller);
    await tick();
    expect(container.querySelector('[data-ega-jump-latest]')).toBeNull();
  });
});

describe('ConversationStream — following stops before the start of the reply leaves the view (R57)', () => {
  it('a reply taller than the view keeps its first line in sight and offers Jump to latest', async () => {
    const c = createConversation();
    await c.send({
      content: 'q',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const { container } = render(ConversationStream, {
      props: {
        turns: c.turns as readonly Turn[],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    const requestId = lastRequestId();
    c.applyChunk({ type: 'delta', requestId, text: 'hi' });
    await tick();
    await tick();
    growingGeometry(scroller, 80);
    scroller.scrollTop = 920;
    // The reply starts 100px into the content: scrolling to the end would push it out.
    replyTop = 100 - 920;
    c.applyChunk({ type: 'delta', requestId, text: ' there, a long answer' });
    await tick();
    await tick();
    await tick();
    expect(scroller.scrollTop).toBe(920);
    expect(container.querySelector('[data-ega-jump-latest]')).not.toBeNull();
  });
});
