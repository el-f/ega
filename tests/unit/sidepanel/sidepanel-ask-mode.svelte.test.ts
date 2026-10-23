// @vitest-environment jsdom
// Ask about a reply (spec S1, S3, S4, S7; design Revision 2): the panel's Ask mode end to end, with the worker mocked.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { toastStore } from '@/shared/components/toastStore';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import type { Msg } from '@/shared/messages';
import type { TranslationChunk } from '@/shared/types';
import { openMenu } from './_reply';

const tabsQuery = chrome.tabs.query as unknown as Mock;
const sendMessage = chrome.runtime.sendMessage as Mock;

type Start = {
  requestId: string;
  text: string;
  options: Record<string, unknown> & { askAbout?: Record<string, unknown> };
};

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  await tick();
}

function starts(): Start[] {
  return (sendMessage.mock.calls as Array<[Record<string, unknown>]>)
    .map(([m]) => m)
    .filter((m) => m['kind'] === 'translate:start') as unknown as Start[];
}

async function chunk(c: TranslationChunk): Promise<void> {
  (chrome.runtime.onMessage as unknown as { emit: (...a: unknown[]) => void }).emit(
    { kind: 'translate:chunk', chunk: c } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await settle();
}

async function mounted(): Promise<HTMLElement> {
  const { container } = render(SidePanel);
  await waitFor(() => {
    if (!container.querySelector('#sp-text')) throw new Error('not mounted');
  });
  await settle();
  return container;
}

const box = (c: HTMLElement): HTMLTextAreaElement =>
  c.querySelector<HTMLTextAreaElement>('#sp-text') as HTMLTextAreaElement;

async function type(c: HTMLElement, text: string): Promise<void> {
  await fireEvent.input(box(c), { target: { value: text } });
  await tick();
}

/** Types and sends; returns the request it started. */
async function send(c: HTMLElement, text: string): Promise<Start> {
  await type(c, text);
  await fireEvent.click(c.querySelector('[data-ega-send]') as HTMLElement);
  await settle();
  const s = starts().at(-1);
  if (!s) throw new Error('nothing sent');
  return s;
}

const replies = (c: HTMLElement): HTMLElement[] => [
  ...c.querySelectorAll<HTMLElement>('[data-ega-reply]'),
];
const askOn = (reply: HTMLElement | undefined): HTMLElement =>
  reply?.querySelector<HTMLElement>('[data-ega-action="ask"]') as HTMLElement;
const banner = (c: HTMLElement): string | null =>
  c.querySelector('[data-ega-mode-banner]')?.textContent.trim() ?? null;
const target = (c: HTMLElement): HTMLElement | null =>
  c.querySelector<HTMLElement>('[data-ega-ask-target]');
const said = (c: HTMLElement): string => c.querySelector('[data-ega-mode-said]')?.textContent ?? '';

/** One finished Translate exchange that detected Levantine Arabizi. */
async function firstExchange(c: HTMLElement): Promise<HTMLElement> {
  const s = await send(c, 'mar7aba, kifak?');
  await chunk({
    type: 'done',
    requestId: s.requestId,
    text: 'Hi, how are you?',
    detectedLang: 'arabizi',
    detectedDetail: 'Levantine',
  });
  const r = replies(c)[0];
  if (!r) throw new Error('no reply');
  return r;
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
  tabsQuery.mockResolvedValue([{ id: 1, url: 'https://a.test/page' }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('entering Ask mode', () => {
  it('Ask on a reply: the banner, the mark, the empty field with the ask placeholder, focus in it', async () => {
    const c = await mounted();
    const reply = await firstExchange(c);
    await type(c, 'half a thought');
    await fireEvent.click(askOn(reply));
    await settle();

    expect(banner(c)).toContain('Asking about this reply');
    expect(c.querySelector('[data-ega-mode-chip]')).toBeNull();
    expect(target(c)).toBe(reply);
    expect(reply.getAttribute('aria-label')).toBe('Ega reply, asked about');
    expect(askOn(reply).getAttribute('aria-pressed')).toBe('true');
    expect(box(c).value).toBe('');
    expect(box(c).placeholder).toBe('Ask about this reply');
    expect(document.activeElement).toBe(box(c));
    await waitFor(() => expect(said(c)).toBe('Asking about the reply: Hi, how are you?'));
  });

  it('Ask on another reply while asking moves only the target; the typed question stays', async () => {
    const c = await mounted();
    const first = await firstExchange(c);
    const s = await send(c, 'shu 3am ta3mel?');
    await chunk({ type: 'done', requestId: s.requestId, text: 'What are you up to?' });
    const second = replies(c)[1] as HTMLElement;
    await type(c, 'my draft');
    await fireEvent.click(askOn(first));
    await settle();
    await type(c, 'half a question');
    await fireEvent.click(askOn(second));
    await settle();
    expect(target(c)).toBe(second);
    expect(box(c).value).toBe('half a question');
    await waitFor(() => expect(said(c)).toBe('Asking about the reply: What are you up to?'));
    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    expect(box(c).value).toBe('my draft');
  });

  it('`a` on the focused reply starts it; on a reply still running it says to wait', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const c = await mounted();
    const reply = await firstExchange(c);
    reply.focus();
    await fireEvent.keyDown(reply, { key: 'a' });
    await settle();
    expect(target(c)).toBe(reply);

    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    const s = await send(c, 'shu 3am ta3mel?');
    await chunk({ type: 'delta', requestId: s.requestId, text: 'What are' });
    const running = replies(c)[1] as HTMLElement;
    running.focus();
    await fireEvent.keyDown(running, { key: 'a' });
    await settle();
    expect(push.mock.calls.map(([m]) => m.message)).toContain('Ask when this reply finishes.');
    expect(banner(c)).toBeNull();
  });
});

describe('asking', () => {
  it('a question goes out as Ask with the reply it is about and the history; its bubble quotes the reply', async () => {
    const c = await mounted();
    const reply = await firstExchange(c);
    await fireEvent.click(askOn(reply));
    await settle();
    const q = await send(c, 'what makes it Levantine?');

    expect(q.text).toBe('what makes it Levantine?');
    expect(q.options['task']).toBe('ask');
    const about = q.options.askAbout;
    expect(about?.['turnId']).toBe(reply.getAttribute('data-turn-id'));
    expect(about?.['task']).toBe('Translate');
    expect(about?.['original']).toBe('mar7aba, kifak?');
    expect(about?.['result']).toBe('Hi, how are you?');
    expect(String(about?.['languages'])).toContain('Levantine');
    expect(q.options['conversationHistory']).toEqual([
      { role: 'user', content: 'mar7aba, kifak?' },
      { role: 'assistant', content: 'Hi, how are you?' },
    ]);

    const question = [...c.querySelectorAll<HTMLElement>('[data-ega-user-turn]')].at(-1);
    expect(question?.querySelector('[data-ega-ask-quote]')?.textContent).toContain(
      'Hi, how are you?',
    );
    expect(question?.querySelector('.ega-task-label')).toBeNull();
    // Still asking; the field is clear for the next question.
    expect(banner(c)).toContain('Asking about this reply');
    expect(box(c).value).toBe('');
  });

  it('the mark moves only when the answer ends done with text', async () => {
    const c = await mounted();
    const reply = await firstExchange(c);
    await fireEvent.click(askOn(reply));
    await settle();

    // A failed answer leaves the target where it was.
    const failed = await send(c, 'why?');
    await chunk({ type: 'delta', requestId: failed.requestId, text: 'Bec' });
    expect(target(c)).toBe(reply);
    await chunk({ type: 'error', requestId: failed.requestId, code: 'NETWORK', message: 'x' });
    expect(target(c)).toBe(reply);
    expect(banner(c)).toContain('Asking about this reply');

    const ok = await send(c, 'and kifak?');
    expect(target(c)).toBe(reply);
    await chunk({ type: 'done', requestId: ok.requestId, text: 'It means how are you.' });
    const answer = replies(c).at(-1);
    expect(target(c)).toBe(answer);
    await waitFor(() => expect(said(c)).toBe('Now asking about the new answer'));
    // The next question is about the answer, not the first reply.
    const next = await send(c, 'say it formally');
    expect(next.options.askAbout?.['result']).toBe('It means how are you.');
    expect(next.options.askAbout?.['task']).toBe('Ask');
  });

  it('pressing the quote scrolls to its reply, clearing a search that hid it, and focuses it', async () => {
    const c = await mounted();
    const reply = await firstExchange(c);
    await fireEvent.click(askOn(reply));
    await settle();
    const q = await send(c, 'what makes it Levantine?');
    await chunk({ type: 'done', requestId: q.requestId, text: 'The word kifak.' });

    await fireEvent.click(c.querySelector('[data-ega-search-toggle]') as HTMLElement);
    await settle();
    const search = c.querySelector<HTMLInputElement>('[data-ega-search]') as HTMLInputElement;
    await fireEvent.input(search, { target: { value: 'kifak.' } });
    await settle();
    expect(replies(c).some((r) => r.textContent.includes('Hi, how are you?'))).toBe(false);

    await fireEvent.click(c.querySelector('[data-ega-ask-quote]') as HTMLElement);
    await settle();
    const shown = replies(c).find((r) => r.textContent.includes('Hi, how are you?'));
    expect(shown).toBeDefined();
    expect(document.activeElement).toBe(shown);
    expect(shown?.classList.contains('flash')).toBe(true);
  });

  it('a quote whose reply was deleted reads "Reply removed"', async () => {
    const c = await mounted();
    const reply = await firstExchange(c);
    await fireEvent.click(askOn(reply));
    await settle();
    const q = await send(c, 'why?');
    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });

    await openMenu(c, 'more');
    await fireEvent.click(document.querySelector('[role="menu"] [data-ega-delete]') as HTMLElement);
    await settle();
    expect(c.querySelector('[data-ega-ask-quote]')).toBeNull();
    expect(c.querySelector('[data-ega-ask-quote-gone]')?.textContent).toBe('Reply removed');
  });
});

describe('leaving Ask mode', () => {
  async function asking(c: HTMLElement): Promise<HTMLElement> {
    const reply = await firstExchange(c);
    await type(c, 'my draft');
    await fireEvent.click(askOn(reply));
    await settle();
    expect(banner(c)).toContain('Asking about this reply');
    return reply;
  }
  const chip = (c: HTMLElement): string =>
    c.querySelector('[data-ega-mode-chip] [data-ega-user-name]')?.textContent ?? '';

  it('Done asking puts the draft and the task back, and says where the composer is', async () => {
    const c = await mounted();
    await asking(c);
    await type(c, 'a question I drop');
    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    expect(banner(c)).toBeNull();
    expect(box(c).value).toBe('my draft');
    expect(chip(c)).toBe('Translate → English');
    expect(document.activeElement).toBe(box(c));
    await waitFor(() => expect(said(c)).toBe('Back to Translate to English'));
  });

  it('Esc with nothing running leaves it and drops the typed question', async () => {
    const c = await mounted();
    await asking(c);
    await type(c, 'not sent');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await settle();
    expect(banner(c)).toBeNull();
    expect(box(c).value).toBe('my draft');
  });

  it('pressing the pressed Ask leaves it and keeps focus on the button', async () => {
    const c = await mounted();
    const reply = await asking(c);
    const btn = askOn(reply);
    btn.focus();
    await fireEvent.click(btn);
    await settle();
    expect(banner(c)).toBeNull();
    expect(box(c).value).toBe('my draft');
    expect(askOn(reply).getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(askOn(reply));
  });

  it('deleting the reply asked about ends it with no extra toast', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const c = await mounted();
    await asking(c);
    await openMenu(c, 'more');
    await fireEvent.click(document.querySelector('[role="menu"] [data-ega-delete]') as HTMLElement);
    await settle();
    expect(banner(c)).toBeNull();
    expect(box(c).value).toBe('my draft');
    const messages = push.mock.calls.map(([m]) => m.message);
    expect(messages).toContain('Message and reply deleted');
    expect(messages.filter((m) => /ask/i.test(m))).toEqual([]);
  });

  it('a new conversation ends it', async () => {
    const c = await mounted();
    await asking(c);
    await fireEvent.click(c.querySelector('[data-ega-new-conversation]') as HTMLElement);
    await settle();
    expect(banner(c)).toBeNull();
  });

  it('a switch to another site ends it', async () => {
    await saveThread('https://b.test', [
      { id: 'bu', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'beta' },
      {
        id: 'ba',
        role: 'assistant',
        kind: 'translate',
        status: 'done',
        createdAt: 2,
        content: 'beta reply',
        attachedToTurnId: 'bu',
      },
    ] as Turn[]);
    const c = await mounted();
    await asking(c);
    tabsQuery.mockResolvedValue([{ id: 2, url: 'https://b.test/other' }]);
    (chrome.tabs.onActivated as unknown as { emit: (i: unknown) => void }).emit({
      tabId: 2,
      windowId: 1,
    });
    await waitFor(() => expect(c.textContent).toContain('beta reply'));
    await settle();
    expect(banner(c)).toBeNull();
  });

  it('an exchange that lands from the page ends it', async () => {
    const c = await mounted();
    await asking(c);
    await writePendingPopupHandoff({
      sourceText: 'from the page',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      response: 'delivered',
    });
    await waitFor(() => expect(c.textContent).toContain('delivered'));
    await waitFor(() => expect(banner(c)).toBeNull());
  });

  it('Describe a change ends it first; leaving the change brings back the draft from before Ask', async () => {
    const c = await mounted();
    await asking(c);
    await type(c, 'typed question');
    await openMenu(c, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-describe-change]') as HTMLElement);
    await settle();
    expect(banner(c)).toContain('Changing this reply');
    expect(box(c).value).toBe('');
    expect(target(c)).toBeNull();
    await fireEvent.click(c.querySelector('[aria-label="Cancel change"]') as HTMLElement);
    await settle();
    expect(box(c).value).toBe('my draft');
  });
});

describe('Ask instead', () => {
  /** A first reply, then a question typed in Translate that came back unchanged. */
  async function slip(c: HTMLElement): Promise<{ first: HTMLElement; echoed: HTMLElement }> {
    const first = await firstExchange(c);
    const s = await send(c, 'what does it mean');
    await chunk({
      type: 'done',
      requestId: s.requestId,
      text: 'what does it mean',
      detectedLang: 'en',
    });
    return { first, echoed: replies(c)[1] as HTMLElement };
  }

  it('asks the same text about the reply before it, as a version, then asks about the answer', async () => {
    const c = await mounted();
    const { first, echoed } = await slip(c);
    const offer = echoed.querySelector<HTMLElement>('[data-ega-ask-instead]');
    expect(offer?.textContent).toBe('Ask instead');
    await fireEvent.click(offer as HTMLElement);
    await settle();

    const q = starts().at(-1) as Start;
    expect(q.text).toBe('what does it mean');
    expect(q.options['task']).toBe('ask');
    expect(q.options.askAbout?.['turnId']).toBe(first.getAttribute('data-turn-id'));
    expect(q.options.askAbout?.['result']).toBe('Hi, how are you?');
    expect(q.options['conversationHistory']).toEqual([
      { role: 'user', content: 'mar7aba, kifak?' },
      { role: 'assistant', content: 'Hi, how are you?' },
    ]);
    // Not in Ask mode until the answer lands done with text.
    expect(banner(c)).toBeNull();

    await chunk({ type: 'done', requestId: q.requestId, text: 'It asks what kifak means.' });
    expect(echoed.querySelector('.ega-pager-count')?.textContent).toBe('2/2');
    expect(banner(c)).toContain('Asking about this reply');
    expect(target(c)).toBe(echoed);
    expect(echoed.querySelector('[data-ega-ask-instead]')).toBeNull();
  });

  it('More → Ask instead is the same action', async () => {
    const c = await mounted();
    const { first } = await slip(c);
    const more = [
      ...c.querySelectorAll<HTMLElement>('[data-ega-reply] [data-ega-action="more"]'),
    ][1];
    await fireEvent.keyDown(more as HTMLElement, { key: 'Enter' });
    const item = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-ega-answer-again="ask"]');
      if (!el) throw new Error('menu not open');
      return el;
    });
    expect(item.textContent.trim()).toBe('Ask instead');
    await fireEvent.click(item);
    await settle();
    const q = starts().at(-1) as Start;
    expect(q.options['task']).toBe('ask');
    expect(q.options.askAbout?.['turnId']).toBe(first.getAttribute('data-turn-id'));
  });
});
