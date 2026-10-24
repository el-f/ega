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
import { askedAboutFor, linkedQuote } from '@/sidepanel/state/thread-view';
import { doneReply, metaText, openMenu, replyProps } from './_reply';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const ABOUT: AskAbout = {
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

  it('is not offered while the reply runs, after it failed or stopped, or when it has no text to quote', () => {
    const cases = [
      doneReply({ status: 'pending', content: '' }),
      doneReply({ status: 'streaming', content: 'Hel' }),
      doneReply({ status: 'error', content: '', error: { code: 'NETWORK', message: 'x' } }),
      doneReply({ status: 'error', content: 'Hel', error: { code: 'ABORTED', message: '' } }),
      doneReply({ content: '' }),
      doneReply({ content: '* * *' }),
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
  it('About this reply names the language it answered in, not the sent pair', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply({ kind: 'ask' }), {
        targetLang: 'en',
      }),
    });
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const row = await screen.findByText('Languages');
    expect(row.nextElementSibling?.textContent).toBe('Answered in English');
  });

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
      props: replyProps(doneReply({ kind: 'ask' }), {
        askedAboutOf: () => ABOUT,
        sentText: 'why?',
      }),
    });
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const row = await screen.findByText('Asked about');
    expect(row.nextElementSibling?.textContent).toBe('Hi, how are you?');
  });

  it('About says so when the reply asked about is gone, and when a version sent nothing of it', async () => {
    const cases = [
      ['gone', 'A reply that is no longer in this conversation'],
      ['unsent', 'Not sent. The reply was no longer in this conversation when this version ran.'],
    ] as const;
    // An "Ask instead" version asks too, though its message was translated.
    const askInstead = doneReply({
      variants: [
        { id: 'v1', status: 'done', content: 'Hi.' },
        { id: 'v2', status: 'done', content: 'Because.', task: 'ask' },
      ],
      activeVariantIdx: 1,
    });
    for (const [asked, text] of cases) {
      for (const turn of [doneReply({ kind: 'ask' }), askInstead]) {
        const props = replyProps(turn, { askedAboutOf: () => asked });
        const { container, unmount } = render(AssistantTurn, { props });
        await openMenu(container, 'more');
        await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
        const row = await screen.findByText('Asked about');
        expect(row.nextElementSibling?.textContent).toBe(text);
        unmount();
        document.body.innerHTML = '';
      }
    }
  });

  it('a version re-run as another task was not about the reply, so About does not say it was', async () => {
    const turn = doneReply({
      id: 'a2',
      kind: 'ask',
      attachedToTurnId: 'u2',
      variants: [
        { id: 'v1', status: 'done', content: 'Because.' },
        { id: 'v2', status: 'done', content: 'Hello, friend.', task: 'translate' },
      ],
      activeVariantIdx: 1,
    });
    const question: UserTurnData = {
      id: 'u2',
      role: 'user',
      kind: 'ask',
      status: 'idle',
      content: 'why?',
      createdAt: 2,
      about: { turnId: 'a1' },
    };
    const thread: Turn[] = [doneReply(), question, turn];
    const labels = { views: SHIPPED_TASK_VIEWS, varieties: [] };
    const { container } = render(AssistantTurn, {
      props: replyProps(turn, { askedAboutOf: (t: Turn) => askedAboutFor(thread, t, labels) }),
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
    about: { turnId: 'a1' },
    ...over,
  });
  /** The reply the question asks about, as the thread holds it. */
  const asked = doneReply({ id: 'a1', content: ABOUT.result });

  it('is a button named by the quoted line, then "go to the reply"; pressing it shows that reply', async () => {
    const onQuote = vi.fn();
    const { container } = render(UserTurn, {
      props: { turn: question(), quoted: linkedQuote(question(), [asked]), onQuote },
    });
    const quote = container.querySelector<HTMLElement>('[data-ega-ask-quote]');
    expect(quote?.tagName).toBe('BUTTON');
    // Markdown is gone and only the first line shows; the name starts with it and has no stray space.
    expect(quote?.textContent).toBe('Hi, how are you?');
    expect(quote?.getAttribute('aria-label')).toBe('Hi, how are you?, go to the reply');
    await fireEvent.click(quote as HTMLElement);
    expect(onQuote).toHaveBeenCalledWith('a1');
  });

  it('marks its one-line text as the part that may end in an ellipsis, with the full text in the name', () => {
    const { container } = render(UserTurn, {
      props: { turn: question(), quoted: linkedQuote(question(), [asked]) },
    });
    const text = container.querySelector<HTMLElement>('.ega-ask-quote-text');
    expect(text?.hasAttribute('data-ega-truncates')).toBe(true);
    // The design check reads the full text off the button's name when the line is cut.
    expect(container.querySelector('[data-ega-ask-quote]')?.getAttribute('aria-label')).toContain(
      text?.textContent,
    );
  });

  // R2-27: a placeholder in a quote bar reads like a rendering bug, and the user who deleted the reply knows.
  it('a question with no reply left to link is a plain bubble: no quote, no placeholder', () => {
    for (const turn of [question()]) {
      const { container, unmount } = render(UserTurn, {
        props: { turn, quoted: linkedQuote(turn, [turn]) },
      });
      expect(container.querySelector('.ega-ask-quote')).toBeNull();
      expect(container.querySelector('[data-ega-user-bubble]')?.textContent.trim()).toBe(
        'what makes it Levantine?',
      );
      unmount();
    }
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
      question(),
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

  it('a question whose reply the storage cap dropped has no quote, and About on its answer says the reply is gone', async () => {
    const turns = [
      question({ id: 'u2', about: { turnId: 'a0' } }),
      doneReply({ id: 'a2', kind: 'ask', content: 'Because.', attachedToTurnId: 'u2' }),
    ] as Turn[];
    const { container } = render(ConversationStream, {
      props: { turns, focusedTurnId: null, onRetry: vi.fn(), onFocusChange: vi.fn() },
    });
    expect(container.querySelector('[data-ega-ask-quote]')).toBeNull();
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const row = await screen.findByText('Asked about');
    expect(row.nextElementSibling?.textContent).toBe(
      'A reply that is no longer in this conversation',
    );
  });

  it('the quote and About read the reply live from the whole thread, filters aside', async () => {
    const all = [
      { id: 'u1', role: 'user', kind: 'translate', status: 'idle', content: 'hola', createdAt: 1 },
      doneReply({ id: 'a1', content: 'Hello there', attachedToTurnId: 'u1', createdAt: 2 }),
      question({ id: 'u2' }),
      doneReply({ id: 'a2', kind: 'ask', content: 'Because.', attachedToTurnId: 'u2' }),
    ] as Turn[];
    // A search shows only the question's exchange; the reply it asks about is still in the thread.
    const { container } = render(ConversationStream, {
      props: {
        turns: all.slice(2),
        thread: all,
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-ask-quote]')?.textContent).toBe('Hello there');
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const row = await screen.findByText('Asked about');
    expect(row.nextElementSibling?.textContent).toBe('Hello there');
  });

  it('a message with no reply to quote has no quote', () => {
    const { about: _about, ...plain } = question();
    const { container } = render(UserTurn, { props: { turn: plain } });
    expect(container.querySelector('.ega-ask-quote')).toBeNull();
  });
});

describe('"Already in" and Ask instead, on the meta line', () => {
  const offer = (c: HTMLElement): HTMLElement | null =>
    c.querySelector<HTMLElement>('[data-ega-ask-instead]');
  // The text came back in the language it was sent to.
  const echo = (over: Parameters<typeof doneReply>[0] = {}) =>
    doneReply({ content: 'what does it mean', detectedLang: 'en', ...over });

  it('a Translate that found its text already in its target offers to ask it instead', async () => {
    const props = replyProps(echo());
    const { container } = render(AssistantTurn, { props });
    expect(metaText(container)[0]).toBe('Already in English·Ask instead');
    expect(offer(container)?.textContent).toBe('Ask instead');
    // "English → English" would repeat it.
    expect(container.querySelector('[data-ega-direction]')).toBeNull();
    expect(container.querySelector('[data-ega-meta-stop]')).toBeNull();
    await fireEvent.click(offer(container) as HTMLElement);
    expect(props.onTaskSwitch).toHaveBeenCalledWith('a1', 'ask');
  });

  it('is not offered when the text was in another language, or in more than one', () => {
    for (const turn of [
      echo({ detectedLang: 'es' }),
      echo({
        detectedLangs: [{ id: 'en' }, { id: 'arabizi' }] as never,
      }),
    ]) {
      const { container, unmount } = render(AssistantTurn, { props: replyProps(turn) });
      expect(offer(container)).toBeNull();
      unmount();
    }
  });

  it('is not offered on another task, an image, a reply with nothing to replay, or with Ask off', () => {
    const off = SHIPPED_TASK_VIEWS.map((v) => (v.id === 'ask' ? { ...v, disabled: true } : v));
    const cases = [
      replyProps(echo({ kind: 'explain' })),
      replyProps(echo({ kind: 'image-translate' }), { hasImage: true }),
      replyProps(echo(), { canRetry: false }),
      replyProps(echo(), { taskViews: off }),
    ];
    for (const props of cases) {
      const { container, unmount } = render(AssistantTurn, { props });
      expect(offer(container)).toBeNull();
      unmount();
    }
  });

  it('waits while another reply runs, since the re-run would not start', () => {
    const { container } = render(AssistantTurn, { props: replyProps(echo(), { inflight: true }) });
    expect(offer(container)).toBeNull();
  });

  it('is gone once the reply has an Ask version, even paged back to the translation', () => {
    const turn = echo({
      variants: [
        { id: 'v1', status: 'done', content: 'what does it mean', detectedLang: 'en' },
        { id: 'v2', status: 'done', content: 'It asks for a meaning.', task: 'ask' },
      ],
      activeVariantIdx: 0,
    });
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    expect(offer(container)).toBeNull();
    expect(metaText(container)[0]).toBe('English → English');
  });

  it('another status takes the slot first', () => {
    const turn = echo({
      variants: [
        { id: 'v1', status: 'done', content: 'what does it mean', detectedLang: 'en' },
        { id: 'v2', status: 'pending', content: '', refinementBody: 'Make outputs shorter.' },
      ],
      activeVariantIdx: 0,
    });
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    expect(metaText(container)[0]).toBe('Version 2 loading…');
    expect(offer(container)).toBeNull();
  });
});
