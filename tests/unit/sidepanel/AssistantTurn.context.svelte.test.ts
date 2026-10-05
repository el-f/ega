// @vitest-environment jsdom
import { asBackendIdUnsafe } from '@/shared/brands';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import type { PageContext } from '@/shared/types';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';

const ctx: PageContext = {
  pageUrl: 'https://x.test',
  pageTitle: 'X',
  beforeText: 'foo',
};

/** Opens the reply's details panel, where what was sent now lives. */
async function openedPreview(container: HTMLElement): Promise<Element | null> {
  const btn = container.querySelector<HTMLButtonElement>('[data-ega-inspector-toggle]');
  if (btn) await fireEvent.click(btn);
  return container.querySelector('[data-ega-context-preview]');
}

describe('AssistantTurn — what was sent parity', () => {
  // what was sent shows only on the latest turn — history turns flatten to
  // bare body, so these latest-turn cases pass isLatest.
  it('renders what was sent when turn.contextSent is set', async () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      contextSent: ctx,
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), isLatest: true },
    });
    expect(await openedPreview(container)).not.toBeNull();
  });

  it('renders what was sent when contextSent is null (context off)', async () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      contextSent: null,
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), isLatest: true },
    });
    expect(await openedPreview(container)).not.toBeNull();
  });

  it('keeps what was sent on a history turn, so "what was sent" is not only on the newest', async () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      contextSent: ctx,
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), isLatest: false },
    });
    expect(await openedPreview(container)).not.toBeNull();
  });

  it('omits what was sent when turn.contextSent is undefined', async () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(await openedPreview(container)).toBeNull();
  });

  it('does NOT render what was sent while status=streaming even if contextSent is set', async () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'streaming',
      content: 'partial',
      contextSent: ctx,
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(await openedPreview(container)).toBeNull();
  });

  it('does NOT render what was sent while status=pending even if contextSent is set', async () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'pending',
      content: '',
      contextSent: ctx,
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(await openedPreview(container)).toBeNull();
  });
});

function row(c: HTMLElement, label: string): string | null {
  const dt = [...c.querySelectorAll('dt')].find((d) => d.textContent.trim() === label);
  return dt?.nextElementSibling?.textContent.replace(/\s+/g, ' ').trim() ?? null;
}

const doneTurn = (extra: Partial<Turn> = {}): Turn =>
  ({
    createdAt: 1,
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    content: 'hello',
    contextSent: ctx,
    ...extra,
  }) as Turn;

// The router drops page info for a task with page context off, so the panel must not show the stored copy.
describe('AssistantTurn — page info follows the task the shown reply ran', () => {
  it('a variant re-run as a task without page context says none was sent', async () => {
    const turn = doneTurn({
      variants: [
        { id: 'v0', status: 'done', content: 'hello' },
        { id: 'v1', status: 'done', content: 'short', task: 'summarize' },
      ],
      activeVariantIdx: 1,
    });
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    expect((await openedPreview(container))?.textContent).toContain('None sent.');
    expect(container.textContent).not.toContain('x.test');
  });

  it('a reply whose task had page context turned off says none was sent', async () => {
    const taskViews = SHIPPED_TASK_VIEWS.map((v) =>
      v.id === 'translate' ? { ...v, pageContext: false } : v,
    );
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), taskViews },
    });
    expect((await openedPreview(container))?.textContent).toContain('None sent.');
  });

  it('trusts what the router recorded at send time over the switch as it is now', async () => {
    const taskViews = SHIPPED_TASK_VIEWS.map((v) =>
      v.id === 'translate' ? { ...v, pageContext: false } : v,
    );
    const meta = { backendId: asBackendIdUnsafe('anthropic'), cacheHit: false, latencyMs: 1 };
    const sent = render(AssistantTurn, {
      props: {
        turn: doneTurn({ meta: { ...meta, pageContextSent: true } }),
        onRetry: vi.fn(),
        taskViews,
      },
    });
    expect((await openedPreview(sent.container))?.textContent).toContain('x.test');
    sent.unmount();
    const dropped = render(AssistantTurn, {
      props: { turn: doneTurn({ meta: { ...meta, pageContextSent: false } }), onRetry: vi.fn() },
    });
    expect((await openedPreview(dropped.container))?.textContent).toContain('None sent.');
  });

  it('shows the page info for a task that sends it', async () => {
    const { container } = render(AssistantTurn, { props: { turn: doneTurn(), onRetry: vi.fn() } });
    expect((await openedPreview(container))?.textContent).toContain('x.test');
  });

  it('describes an image turn as an image read with the built-in prompt', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: doneTurn({ contextSent: null }),
        onRetry: vi.fn(),
        hasImage: true,
        sentText: '[image]',
      },
    });
    await openedPreview(container);
    expect(row(container, 'Your text')).toBe('An image');
    expect(row(container, 'Instructions')).toBe('Image prompt (built in)');
    expect(row(container, 'Page info')).toBe('Not sent with images.');
  });

  // No backend could read the image, so only the caption went, as text, with history and page info.
  it('describes the caption, not an image, when the router sent it down the text path', async () => {
    const meta = {
      backendId: asBackendIdUnsafe('anthropic'),
      cacheHit: false,
      latencyMs: 1,
      imageArm: 'text' as const,
      historyTurns: 2,
      pageContextSent: true,
    };
    const { container } = render(AssistantTurn, {
      props: {
        turn: doneTurn({ meta }),
        onRetry: vi.fn(),
        hasImage: true,
        sentText: 'what does this sign say?',
      },
    });
    await openedPreview(container);
    expect(row(container, 'Your text')).toBe('what does this sign say?');
    expect(row(container, 'Instructions')).toMatch(/^Translate prompt/);
    expect(row(container, 'Earlier messages')).toBe('2 from this conversation');
    expect(container.textContent).toContain('x.test');
  });
});
