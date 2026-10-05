// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn, UserTurnData, AssistantTurnData } from '@/sidepanel/state/conversation';

const u = (over: Partial<UserTurnData> = {}): UserTurnData => ({
  createdAt: Date.now(),
  id: 'u1',
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content: 'hola',
  ...over,
});

const a = (over: Partial<AssistantTurnData> = {}): AssistantTurnData => ({
  createdAt: Date.now(),
  id: 'a1',
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content: 'hello',
  attachedToTurnId: 'u1',
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('timestamps keep up with the clock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-reads the age as the stream ticks', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { container } = render(ConversationStream, {
      props: {
        turns: [u({ createdAt: start })],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    await tick();
    expect(container.querySelector('[data-ega-timestamp]')?.textContent).toBe('just now');

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await tick();
    expect(container.querySelector('[data-ega-timestamp]')?.textContent).not.toBe('just now');
  });

  it('exposes the absolute time to a machine, not only to a hover', () => {
    const created = 1_700_000_000_000;
    const { container } = render(UserTurn, { props: { turn: u({ createdAt: created }) } });
    const el = container.querySelector('[data-ega-timestamp]');
    expect(el?.tagName).toBe('TIME');
    expect(el?.getAttribute('datetime')).toBe(new Date(created).toISOString());
  });
});

describe('an empty result offers the way out of it', () => {
  it('clears the search from the empty state', async () => {
    const onClearSearch = vi.fn();
    const { container } = render(ConversationStream, {
      props: {
        turns: [],
        emptySearch: true,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
        onClearSearch,
      },
    });
    const cta = container.querySelector<HTMLButtonElement>('[data-ega-no-search-matches] button');
    expect(cta?.textContent.trim()).toBe('Clear search');
    await fireEvent.click(cta as HTMLButtonElement);
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('turns the bookmark filter off from the empty state', async () => {
    const onClearBookmarkFilter = vi.fn();
    const { container } = render(ConversationStream, {
      props: {
        turns: [],
        emptyBookmarkFilter: true,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
        onClearBookmarkFilter,
      },
    });
    const cta = container.querySelector<HTMLButtonElement>('[data-ega-no-bookmarks] button');
    expect(cta?.textContent.trim()).toBe('Show all messages');
    await fireEvent.click(cta as HTMLButtonElement);
    expect(onClearBookmarkFilter).toHaveBeenCalledTimes(1);
  });

  it('says nothing clickable when the panel wires no handler', () => {
    const { container } = render(ConversationStream, {
      props: {
        turns: [],
        emptySearch: true,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-no-search-matches] button')).toBeNull();
  });
});

describe('a user turn says what it actually was', () => {
  it('names the tone a reword was sent with', () => {
    const { container } = render(UserTurn, {
      props: { turn: u({ kind: 'reword', tone: 'formal' }) },
    });
    expect(container.querySelector('.ega-kind-badge')?.textContent).toContain('Formal');
  });

  it('offers no copy button on an image turn whose only text is the marker', () => {
    const { container } = render(UserTurn, {
      props: { turn: u({ content: '[image]', imageDataUrl: 'data:image/png;base64,AAA' }) },
    });
    expect(container.querySelector('[data-ega-copy-source]')).toBeNull();
  });

  it('keeps copy when the image was sent with notes', () => {
    const { container } = render(UserTurn, {
      props: {
        turn: u({ content: 'what does this say?', imageDataUrl: 'data:image/png;base64,AAA' }),
      },
    });
    expect(container.querySelector('[data-ega-copy-source]')).not.toBeNull();
  });
});

describe('the re-run controls say what they do', () => {
  it('offers one re-run control on a done reply, not Retry beside Regenerate', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: a(), onRetry: vi.fn(), onRegenerate: vi.fn(), canRetry: true },
    });
    const footer = container.querySelector('.ega-turn-actions');
    expect(footer?.querySelectorAll('[data-ega-regenerate]').length).toBe(1);
    expect(footer?.querySelector('[data-ega-action="retry"]')).toBeNull();
  });

  it('explains that an image has no source language to swap', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: a(),
        onRetry: vi.fn(),
        isLatest: true,
        canRetry: true,
        onSwap: vi.fn(),
        hasImage: true,
      },
    });
    const swap = container.querySelector<HTMLButtonElement>('[data-ega-swap]');
    expect(swap?.getAttribute('aria-disabled')).toBe('true');
    expect(swap?.getAttribute('data-tooltip')).toBe('Images have no source language to swap');
  });

  it('labels the pinned explanation instead of leaving a gray block', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: a({ explain: 'the idiom means X' }), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-explain]')?.textContent).toContain(
      'Context & subtext',
    );
  });

  it('hides the explanation while the skeleton is still up', () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: a({ status: 'pending', content: '', explain: 'the idiom means X' }),
        onRetry: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-explain]')).toBeNull();
  });

  it('opens the full refinement from the keyboard', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: a({
          variants: [
            {
              id: 'a1:v1',
              status: 'done',
              content: 'hello',
              refinementBody: 'make it much shorter and drop every adjective from the answer',
            },
          ] as NonNullable<Turn['variants']>,
          activeVariantIdx: 0,
        }),
        onRetry: vi.fn(),
        isLatest: true,
      },
    });
    const chip = container.querySelector<HTMLButtonElement>('[data-ega-refinement-chip]');
    expect(chip?.tagName).toBe('BUTTON');
    expect(chip?.textContent).toContain('…');
    await fireEvent.click(chip as HTMLButtonElement);
    await tick();
    expect(container.querySelector('[data-ega-refinement-chip]')?.textContent).toContain(
      'drop every adjective',
    );
  });
});
