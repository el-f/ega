// @vitest-environment jsdom
// About this reply's "Page info" row says what left the device: the router's record first, then the task's switch.
import { asBackendIdUnsafe } from '@/shared/brands';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import type { PageContext } from '@/shared/types';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
import { openMenu } from './_reply';

afterEach(() => {
  document.body.innerHTML = '';
});

const ctx: PageContext = {
  pageUrl: 'https://x.test',
  pageTitle: 'X',
  beforeText: 'foo',
};

const turnWith = (extra: Partial<Turn> = {}): Turn =>
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

/** Opens More → About this reply and returns the details section. */
async function openAbout(container: HTMLElement): Promise<HTMLElement> {
  await openMenu(container, 'more');
  await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
  return waitFor(() => {
    const about = container.querySelector<HTMLElement>('[data-ega-inspector]');
    if (!about) throw new Error('About not open');
    return about;
  });
}

function row(c: HTMLElement, label: string): string | null {
  const dt = [...c.querySelectorAll('dt')].find((d) => d.textContent.trim() === label);
  return dt?.nextElementSibling?.textContent.replace(/\s+/g, ' ').trim() ?? null;
}

describe('About this reply — page info', () => {
  it('shows the page info a reply sent', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: turnWith(), onRetry: vi.fn(), isLatest: true },
    });
    expect(row(await openAbout(container), 'Page info')).toContain('x.test');
  });

  it('says none was sent when page info was off', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: turnWith({ contextSent: null }), onRetry: vi.fn(), isLatest: true },
    });
    expect(row(await openAbout(container), 'Page info')).toBe('None sent');
  });

  it('works the same on an older reply, not only the newest', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: turnWith(), onRetry: vi.fn(), isLatest: false },
    });
    expect(row(await openAbout(container), 'Page info')).toContain('x.test');
  });

  it('says it was not recorded when the reply holds no page info record', async () => {
    const { contextSent: _drop, ...noRecord } = turnWith() as Turn & { contextSent?: unknown };
    const { container } = render(AssistantTurn, {
      props: { turn: noRecord as Turn, onRetry: vi.fn() },
    });
    expect(row(await openAbout(container), 'Page info')).toBe('Not recorded');
  });

  it('offers no About while the reply is still running', () => {
    for (const status of ['streaming', 'pending'] as const) {
      const { container } = render(AssistantTurn, {
        props: {
          turn: turnWith({ status, content: status === 'pending' ? '' : 'partial' }),
          onRetry: vi.fn(),
        },
      });
      expect(container.querySelector('[data-ega-action="more"]')).toBeNull();
      expect(container.querySelector('[data-ega-inspector]')).toBeNull();
      document.body.innerHTML = '';
    }
  });
});

// The router drops page info for a task with page context off, so the panel must not show the stored copy.
describe('About this reply — page info follows the task the shown version ran', () => {
  it('a version re-run as a task without page context says none was sent', async () => {
    const turn = turnWith({
      variants: [
        { id: 'v0', status: 'done', content: 'hello' },
        { id: 'v1', status: 'done', content: 'short', task: 'summarize' },
      ],
      activeVariantIdx: 1,
    });
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    const about = await openAbout(container);
    expect(row(about, 'Page info')).toBe('None sent');
    expect(about.textContent).not.toContain('x.test');
  });

  it('a reply whose task had page context turned off says none was sent', async () => {
    const taskViews = SHIPPED_TASK_VIEWS.map((v) =>
      v.id === 'translate' ? { ...v, pageContext: false } : v,
    );
    const { container } = render(AssistantTurn, {
      props: { turn: turnWith(), onRetry: vi.fn(), taskViews },
    });
    expect(row(await openAbout(container), 'Page info')).toBe('None sent');
  });

  it('trusts what the router recorded at send time over the switch as it is now', async () => {
    const taskViews = SHIPPED_TASK_VIEWS.map((v) =>
      v.id === 'translate' ? { ...v, pageContext: false } : v,
    );
    const meta = { backendId: asBackendIdUnsafe('anthropic'), cacheHit: false, latencyMs: 1 };
    const sent = render(AssistantTurn, {
      props: {
        turn: turnWith({ meta: { ...meta, pageContextSent: true } }),
        onRetry: vi.fn(),
        taskViews,
      },
    });
    expect(row(await openAbout(sent.container), 'Page info')).toContain('x.test');
    sent.unmount();
    document.body.innerHTML = '';
    const dropped = render(AssistantTurn, {
      props: { turn: turnWith({ meta: { ...meta, pageContextSent: false } }), onRetry: vi.fn() },
    });
    expect(row(await openAbout(dropped.container), 'Page info')).toBe('None sent');
  });

  it('describes an image read with the built-in prompt: an image, and no page info', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: turnWith({ contextSent: null }),
        onRetry: vi.fn(),
        hasImage: true,
        sentText: '[image]',
      },
    });
    const about = await openAbout(container);
    expect(row(about, 'Your text')).toBe('An image');
    expect(row(about, 'Page info')).toBe('Not sent with images');
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
        turn: turnWith({ meta }),
        onRetry: vi.fn(),
        hasImage: true,
        sentText: 'what does this sign say?',
      },
    });
    const about = await openAbout(container);
    expect(row(about, 'Your text')).toBe('what does this sign say?');
    expect(row(about, 'Earlier messages')).toBe('2 from this conversation');
    expect(row(about, 'Page info')).toContain('x.test');
  });
});
