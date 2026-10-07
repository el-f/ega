// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

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

describe('ConversationStream — no svelte:window self-registration', () => {
  it('does not register its own window keydown listener (single-handler contract)', () => {
    // SidePanel owns the only window keydown listener; ConversationStream registers its handler through it.
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    render(ConversationStream, {
      props: {
        turns: [u('u1', 'hello'), a('a1', 'world', 'u1')],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const keydownCalls = addEventSpy.mock.calls.filter(([event]) => event === 'keydown');
    // ConversationStream must not add its own window keydown listener
    expect(keydownCalls).toHaveLength(0);
    addEventSpy.mockRestore();
  });

  it('registers navigation handler via onRegisterKeydownHandler when provided', async () => {
    const turns = [u('u1', 'first'), u('u2', 'second')];
    const registered: { handler: ((e: KeyboardEvent) => void) | null } = { handler: null };
    const focusChange = vi.fn();

    render(ConversationStream, {
      props: {
        turns,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: focusChange,
        onRegisterKeydownHandler: (h: (e: KeyboardEvent) => void) => {
          registered.handler = h;
        },
      },
    });

    await tick();
    expect(registered.handler).not.toBeNull();

    // Simulate parent routing a 'j' keydown to the registered handler
    const jEvent = new KeyboardEvent('keydown', { key: 'j', bubbles: true });
    if (!registered.handler) throw new Error('handler not registered');
    registered.handler(jEvent);

    expect(focusChange).toHaveBeenCalledWith('u1');
  });

  // "Instructions sent" and a long quote are focusable scroll boxes; the arrows scroll them (spec §5.7).
  it('leaves the arrow keys to a focused box that scrolls', async () => {
    const registered: { handler: ((e: KeyboardEvent) => void) | null } = { handler: null };
    const focusChange = vi.fn();
    const { container } = render(ConversationStream, {
      props: {
        turns: [u('u1', 'hello'), a('a1', 'world', 'u1')],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: focusChange,
        onRegisterKeydownHandler: (h: (e: KeyboardEvent) => void) => {
          registered.handler = h;
        },
      },
    });
    await tick();
    const box = document.createElement('pre');
    box.tabIndex = 0;
    box.style.overflowY = 'auto';
    Object.defineProperty(box, 'scrollHeight', { value: 400 });
    Object.defineProperty(box, 'clientHeight', { value: 100 });
    container.querySelector('[data-turn-id="a1"]')?.append(box);
    if (!registered.handler) throw new Error('handler not registered');
    for (const key of ['ArrowDown', 'ArrowUp']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'target', { value: box });
      registered.handler(e);
      expect(e.defaultPrevented, key).toBe(false);
    }
    expect(focusChange).not.toHaveBeenCalled();
    // j still moves between messages: it is not a scroll key.
    const j = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    Object.defineProperty(j, 'target', { value: box });
    registered.handler(j);
    expect(focusChange).toHaveBeenCalledWith('u1');
  });

  it('drops the ring when focus leaves the stream, so r cannot fire on an unseen turn', async () => {
    const focusChange = vi.fn();
    const onRetry = vi.fn();
    const registered: { handler: ((e: KeyboardEvent) => void) | null } = { handler: null };
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    const { container } = render(ConversationStream, {
      props: {
        turns: [u('u1', 'hello'), a('a1', 'world', 'u1')],
        focusedTurnId: 'a1',
        onRetry,
        onFocusChange: focusChange,
        onRegisterKeydownHandler: (h: (e: KeyboardEvent) => void) => {
          registered.handler = h;
        },
      },
    });
    await tick();

    const stream = container.querySelector('.ega-conv-stream');
    if (!stream) throw new Error('.ega-conv-stream not found');
    stream.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    expect(focusChange).toHaveBeenCalledWith(null);

    // A move between two turns inside the stream keeps the ring.
    focusChange.mockClear();
    const inside = container.querySelector('[data-turn-id="u1"]');
    stream.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: inside }));
    expect(focusChange).not.toHaveBeenCalled();

    outside.remove();
  });
});
