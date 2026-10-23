// @vitest-environment jsdom
// Ask about a reply, design Revision 2: the reply's Ask button and mark, an answer's meta line, and the quote.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
import type { AskAbout } from '@/shared/ask-about';
import type { Turn, UserTurnData } from '@/sidepanel/state/conversation';
import { doneReply, metaText, openMenu, replyProps } from './_reply';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const ABOUT: AskAbout = {
  turnId: 'a1',
  task: 'Translate',
  languages: 'Arabizi (Levantine) → English',
  original: 'mar7aba, kifak?',
  result: '**Hi**, how are you?\nSecond line',
};
const ask = (c: HTMLElement): HTMLElement | null =>
  c.querySelector<HTMLElement>('[data-ega-reply] [data-ega-action="ask"]');

describe('the Ask button', () => {
  it('sits second in the row of a finished reply, not pressed, and asks about that reply', async () => {
    const props = replyProps(doneReply());
    const { container } = render(AssistantTurn, { props });
    const btn = ask(container);
    expect(btn?.getAttribute('aria-label')).toBe('Ask about this');
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(btn as HTMLElement);
    expect(props.onAsk).toHaveBeenCalledWith('a1');
  });

  it('is not offered while the reply runs, after it failed or stopped, or when it is empty', () => {
    const cases = [
      doneReply({ status: 'pending', content: '' }),
      doneReply({ status: 'streaming', content: 'Hel' }),
      doneReply({ status: 'error', content: '', error: { code: 'NETWORK', message: 'x' } }),
      doneReply({ status: 'error', content: 'Hel', error: { code: 'ABORTED', message: '' } }),
      doneReply({ content: '' }),
    ];
    for (const turn of cases) {
      const { container, unmount } = render(AssistantTurn, { props: replyProps(turn) });
      expect(ask(container)).toBeNull();
      unmount();
    }
  });

  it('is not offered when the Ask task is off', () => {
    const views = SHIPPED_TASK_VIEWS.map((v) => (v.id === 'ask' ? { ...v, disabled: true } : v));
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply(), { taskViews: views }),
    });
    expect(ask(container)).toBeNull();
  });

  it('the reply asked about shows Ask pressed, the bar, and says so in its name', () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply(), { asked: true, isLatest: false }),
    });
    const article = container.querySelector('[data-ega-reply]');
    expect(article?.hasAttribute('data-ega-ask-target')).toBe(true);
    expect(article?.classList.contains('asked')).toBe(true);
    expect(article?.getAttribute('aria-label')).toBe('Ega reply, asked about');
    expect(ask(container)?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('an answer to a question', () => {
  it('its meta line reads "Answer" and the model, not languages', () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply({ kind: 'ask' })) });
    expect(metaText(container).slice(0, 2)).toEqual(['Answer', 'Claude Haiku 4.5']);
    expect(metaText(container)).not.toContain('Spanish → English');
  });

  it('streams under "Answering…"', () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply({ kind: 'ask', status: 'pending', content: '' })),
    });
    expect(metaText(container)).toEqual(['Answering…']);
  });

  it('About this reply lists what it was asked about under What was sent', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply({ kind: 'ask' }), { questionAbout: ABOUT, sentText: 'why?' }),
    });
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const row = await screen.findByText('Asked about');
    expect(row.nextElementSibling?.textContent).toBe('Hi, how are you?');
  });

  it('a version re-run as another task was not about the reply, so About does not say it was', async () => {
    const turn = doneReply({
      kind: 'ask',
      variants: [
        { id: 'v1', status: 'done', content: 'Because.' },
        { id: 'v2', status: 'done', content: 'Hello, friend.', task: 'translate' },
      ],
      activeVariantIdx: 1,
    });
    const { container } = render(AssistantTurn, {
      props: replyProps(turn, { questionAbout: ABOUT }),
    });
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    await screen.findByText('What was sent');
    expect(screen.queryByText('Asked about')).toBeNull();
  });
});

describe('the quote on a question', () => {
  const question = (over: Partial<UserTurnData> = {}): UserTurnData => ({
    id: 'u2',
    role: 'user',
    kind: 'ask',
    status: 'idle',
    content: 'what makes it Levantine?',
    createdAt: 3,
    about: ABOUT,
    ...over,
  });

  it('is a button named by the quoted line, then "Go to the reply"; pressing it shows that reply', async () => {
    const onQuote = vi.fn();
    const { container } = render(UserTurn, { props: { turn: question(), onQuote } });
    const quote = container.querySelector<HTMLElement>('[data-ega-ask-quote]');
    expect(quote?.tagName).toBe('BUTTON');
    // Markdown is gone and only the first line shows.
    expect(quote?.textContent).toBe('Hi, how are you?, Go to the reply');
    expect(quote?.querySelector('.ega-sr-only')?.textContent).toBe(', Go to the reply');
    await fireEvent.click(quote as HTMLElement);
    expect(onQuote).toHaveBeenCalledWith('a1');
  });

  it('a removed reply reads "Reply removed", as plain text', () => {
    const { container } = render(UserTurn, { props: { turn: question(), aboutGone: true } });
    expect(container.querySelector('[data-ega-ask-quote]')).toBeNull();
    const gone = container.querySelector('[data-ega-ask-quote-gone]');
    expect(gone?.tagName).toBe('SPAN');
    expect(gone?.textContent).toBe('Reply removed');
  });

  it('a quoted reply outside the rendered window is shown first, then focused and flashed', async () => {
    const turns = [
      {
        id: 'u1',
        role: 'user',
        kind: 'translate',
        status: 'idle',
        content: 'mar7aba',
        createdAt: 1,
      },
      doneReply({ id: 'a1', content: 'Hi there', attachedToTurnId: 'u1', createdAt: 2 }),
      question({ about: { ...ABOUT, result: 'Hi there' } }),
      doneReply({
        id: 'a2',
        kind: 'ask',
        content: 'Because.',
        attachedToTurnId: 'u2',
        createdAt: 4,
      }),
    ] as Turn[];
    const { container } = render(ConversationStream, {
      props: {
        turns,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
        renderWindow: 2,
      },
    });
    expect(container.querySelector('[data-turn-id="a1"]')).toBeNull();
    await fireEvent.click(container.querySelector('[data-ega-ask-quote]') as HTMLElement);
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('[data-turn-id="a1"]')),
    );
    expect(container.querySelector('[data-turn-id="a1"]')?.classList.contains('flash')).toBe(true);
  });

  it('a message with no reply to quote has no quote', () => {
    const { about: _about, ...plain } = question();
    const { container } = render(UserTurn, { props: { turn: plain } });
    expect(container.querySelector('[data-ega-ask-quote], [data-ega-ask-quote-gone]')).toBeNull();
  });
});
