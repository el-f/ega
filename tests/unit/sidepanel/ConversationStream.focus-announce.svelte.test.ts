// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

type StreamProps = ComponentProps<typeof ConversationStream>;

// createdAt climbs the way real turns do — the announcer uses it to spot an older turn.
const u = (id: string, content: string, createdAt = 1_000): Turn => ({
  createdAt,
  id,
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content,
});
const a = (
  id: string,
  content: string,
  attached: string,
  status: Turn['status'] = 'done',
  createdAt = 1_000,
): Turn => ({
  createdAt,
  id,
  role: 'assistant',
  kind: 'translate',
  status,
  content,
  attachedToTurnId: attached,
});

afterEach(() => vi.restoreAllMocks());

describe('ConversationStream — j/k moves real focus', () => {
  it('focuses the turn element and scrolls it into view', async () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const turns = [u('u1', 'hi'), a('a1', 'reply', 'u1')];
    const { container, rerender } = render(ConversationStream, {
      props: {
        turns,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    await tick();
    scrollSpy.mockClear();

    await rerender({
      turns,
      focusedTurnId: 'a1',
      onRetry: vi.fn(),
      onFocusChange: vi.fn(),
    });
    await tick();

    const article = container.querySelector<HTMLElement>('[data-turn-id="a1"]');
    expect(article).not.toBeNull();
    expect(document.activeElement).toBe(article);
    expect(scrollSpy.mock.instances).toContain(article);
  });

  it('does not steal focus when nothing is focused', async () => {
    const turns = [u('u1', 'hi'), a('a1', 'reply', 'u1')];
    const { container } = render(ConversationStream, {
      props: {
        turns,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    await tick();
    expect(container.querySelector('[data-turn-id]:focus')).toBeNull();
  });
});

describe('ConversationStream — one announcer, not the whole thread', () => {
  function props(over: Partial<StreamProps> = {}): StreamProps {
    return {
      turns: [u('u1', 'hi'), a('a1', 'the reply', 'u1')],
      focusedTurnId: null,
      onRetry: vi.fn(),
      onFocusChange: vi.fn(),
      ...over,
    };
  }

  it('keeps the announcer mounted when an empty result replaces the stream', async () => {
    const { container } = render(ConversationStream, {
      props: props({ turns: [], emptySearch: true, filterSummary: '0 matches' }),
    });
    await tick();
    expect(container.querySelector('[data-ega-no-search-matches]')).not.toBeNull();
    expect(container.querySelector('[data-ega-stream-live]')?.textContent).toBe('0 matches');
  });

  it('says the reply started, not only that it finished', async () => {
    const turns = [u('u1', 'hi'), a('a1', '', 'u1', 'pending', 2_000)];
    const { container, rerender } = render(ConversationStream, { props: props({ turns }) });
    await tick();
    expect(container.querySelector('[data-ega-stream-live]')?.textContent).toBe('Translating…');

    const settled = [u('u1', 'hi'), a('a1', 'done text', 'u1', 'done', 2_000)];
    await rerender(props({ turns: settled }));
    await tick();
    expect(container.querySelector('[data-ega-stream-live]')?.textContent).toBe('done text');
  });

  it('the scroller does not announce its own children', () => {
    const { container } = render(ConversationStream, { props: props() });
    const log = container.querySelector('[role="log"]');
    expect(log?.getAttribute('aria-live')).toBe('off');
  });

  it('announces a newly settled assistant turn once, and not again on a filter change', async () => {
    const turns = [u('u1', 'hi'), a('a1', 'first answer', 'u1')];
    const { container, rerender } = render(ConversationStream, { props: props({ turns }) });
    await tick();
    const live = container.querySelector('[data-ega-stream-live]');
    expect(live).not.toBeNull();
    // A restored thread must not read itself out on open.
    expect(live?.textContent).toBe('');

    const grown = [
      ...turns,
      u('u2', 'again', 2_000),
      a('a2', 'second answer', 'u2', 'streaming', 2_000),
    ];
    await rerender(props({ turns: grown }));
    await tick();
    expect(live?.textContent).toBe('');

    const settled = [
      ...turns,
      u('u2', 'again', 2_000),
      a('a2', 'second answer', 'u2', 'done', 2_000),
    ];
    await rerender(props({ turns: settled }));
    await tick();
    expect(live?.textContent).toBe('second answer');

    // The bookmark filter narrows the list — the region must not repeat the thread.
    await rerender(props({ turns: [u('u1', 'hi'), a('a1', 'first answer', 'u1')] }));
    await tick();
    expect(live?.textContent).toBe('second answer');
  });

  it('announces the filter result count the panel renders', async () => {
    const { container, rerender } = render(ConversationStream, { props: props() });
    await tick();
    await rerender(props({ filterSummary: '2 matches' }));
    await tick();
    expect(container.querySelector('[data-ega-stream-live]')?.textContent).toBe('2 matches');
  });
});

describe('ConversationStream — one layout read per update', () => {
  it('measures the scroller once while a delta streams in', async () => {
    let reads = 0;
    const turns = [u('u1', 'hi'), a('a1', 'partial', 'u1', 'streaming')];
    const { container, rerender } = render(ConversationStream, {
      props: {
        turns,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    const scroller = container.querySelector<HTMLDivElement>('.ega-conv-stream');
    if (!scroller) throw new Error('scroller not found');
    Object.defineProperty(scroller, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get() {
        reads++;
        return 1000;
      },
    });
    await tick();
    await tick();

    reads = 0;
    await rerender({
      turns: [u('u1', 'hi'), a('a1', 'partial and more', 'u1', 'streaming')],
      focusedTurnId: null,
      onRetry: vi.fn(),
      onFocusChange: vi.fn(),
    });
    await tick();
    await tick();

    // One measurement before the DOM write, one value to scroll to. Three blocks each measuring is the bug.
    expect(reads).toBeLessThanOrEqual(2);
  });
});
