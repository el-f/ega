// @vitest-environment jsdom
// Ask about a reply (spec S1, S3, S4, S7; design Revision 2): the panel's Ask mode end to end, with the worker mocked.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { MAX_TURNS_PER_THREAD, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { toastStore } from '@/shared/components/toastStore';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import type { Msg } from '@/shared/messages';
import type { TranslationChunk } from '@/shared/types';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { openMenu } from './_reply';
import { nearTheByteCap } from './_near-cap';
import { pickHeaderMenuItem } from './_header-menu';
import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
import { updateSettings } from '@/shared/storage';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn().mockResolvedValue(true),
}));
const confirmMock = confirmDialog as unknown as Mock;

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

const toasts = (push: { mock: { calls: Array<[{ message: string }]> } }): string[] =>
  push.mock.calls.map(([m]) => m.message);

/** Two finished exchanges; returns both replies. */
async function twoExchanges(c: HTMLElement): Promise<[HTMLElement, HTMLElement]> {
  const first = await firstExchange(c);
  const s = await send(c, 'shu 3am ta3mel?');
  await chunk({ type: 'done', requestId: s.requestId, text: 'What are you up to?' });
  return [first, replies(c)[1] as HTMLElement];
}

/** Refine → Regenerate on the first reply in the thread; returns the request it started. */
async function regenerate(c: HTMLElement): Promise<Start> {
  await openMenu(c, 'refine');
  await fireEvent.click(document.querySelector('[data-ega-regenerate]') as HTMLElement);
  await settle();
  return starts().at(-1) as Start;
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  confirmMock.mockClear();
  confirmMock.mockResolvedValue(true);
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

  it('`a` on a reply that failed says nothing: it has finished, and waiting will not help', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const c = await mounted();
    const s = await send(c, 'mar7aba');
    await chunk({ type: 'error', requestId: s.requestId, code: 'NETWORK', message: 'x' });
    const failed = replies(c)[0] as HTMLElement;
    failed.focus();
    await fireEvent.keyDown(failed, { key: 'a' });
    await settle();
    expect(toasts(push)).not.toContain('Ask when this reply finishes.');
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

  it('another reply picked while the answer streams stays the target when the answer ends', async () => {
    const c = await mounted();
    const [first, second] = await twoExchanges(c);
    await fireEvent.click(askOn(second));
    await settle();
    const q = await send(c, 'why?');
    await chunk({ type: 'delta', requestId: q.requestId, text: 'Bec' });
    await fireEvent.click(askOn(first));
    await settle();
    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    expect(target(c)).toBe(first);
    const next = await send(c, 'and this one?');
    expect(next.options.askAbout?.['result']).toBe('Hi, how are you?');
  });

  it('a reply picked again while the question is still being sent stays the target', async () => {
    const c = await mounted();
    const [first, second] = await twoExchanges(c);
    await fireEvent.click(askOn(first));
    await settle();
    let release: () => void = () => {};
    sendMessage.mockImplementation((m: { kind?: string }) =>
      m.kind === 'translate:start'
        ? new Promise((resolve) => (release = () => resolve({ ok: true })))
        : Promise.resolve({ ok: true }),
    );
    await type(c, 'why?');
    await fireEvent.click(c.querySelector('[data-ega-send]') as HTMLElement);
    await settle();
    // A, then B, then A again: the last pick is newer than the question, though it names the same reply.
    await fireEvent.click(askOn(second));
    await settle();
    await fireEvent.click(askOn(first));
    await settle();
    release();
    await settle();
    await chunk({
      type: 'done',
      requestId: (starts().at(-1) as Start).requestId,
      text: 'Because.',
    });
    expect(target(c)).toBe(first);
  });

  it('a question about a version with no answer is refused, and the typed question stays', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const c = await mounted();
    const reply = await firstExchange(c);
    await fireEvent.click(askOn(reply));
    await settle();
    // Regenerate the reply asked about, and the new version fails.
    const again = await regenerate(c);
    await chunk({ type: 'error', requestId: again.requestId, code: 'NETWORK', message: 'x' });
    expect(target(c)).toBe(reply);
    const before = starts().length;

    await type(c, 'why?');
    await fireEvent.click(c.querySelector('[data-ega-send]') as HTMLElement);
    await settle();
    expect(starts()).toHaveLength(before);
    expect(toasts(push)).toContain('This version has no answer to ask about.');
    expect(box(c).value).toBe('why?');
    expect(banner(c)).toContain('Asking about this reply');
  });

  it('deleting the reply asked about takes it out of every later request; Undo brings it back', async () => {
    const push = vi.spyOn(toastStore, 'push');
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
    // The answer's re-run asks the question alone: the deleted reply goes nowhere.
    const again = await regenerate(c);
    expect(again.options['task']).toBe('ask');
    expect(again.options.askAbout).toBeUndefined();
    expect(JSON.stringify(again.options)).not.toContain('Hi, how are you?');
    await chunk({ type: 'done', requestId: again.requestId, text: 'Because, again.' });

    const deleted = push.mock.calls.find(([m]) => m.message === 'Message and reply deleted');
    deleted?.[0].action?.onClick();
    await settle();
    expect(c.querySelector('[data-ega-ask-quote]')?.textContent).toContain('Hi, how are you?');
    const answer = replies(c).at(-1) as HTMLElement;
    await openMenu(answer, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-regenerate]') as HTMLElement);
    await settle();
    expect(starts().at(-1)?.options.askAbout?.['result']).toBe('Hi, how are you?');
  });

  it('About on a version run while the reply was deleted says it sent nothing of it, also once Undo brought the reply back', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const c = await mounted();
    await fireEvent.click(askOn(await firstExchange(c)));
    await settle();
    const q = await send(c, 'why?');
    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    await openMenu(c, 'more');
    await fireEvent.click(document.querySelector('[role="menu"] [data-ega-delete]') as HTMLElement);
    await settle();
    const again = await regenerate(c);
    expect(again.options.askAbout).toBeUndefined();
    await chunk({ type: 'done', requestId: again.requestId, text: 'Because, again.' });
    push.mock.calls.find(([m]) => m.message === 'Message and reply deleted')?.[0].action?.onClick();
    await settle();

    const answer = replies(c).at(-1) as HTMLElement;
    const askedRow = async (): Promise<string> => {
      await openMenu(answer, 'more');
      await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
      return waitFor(() => {
        const row = answer.querySelector('[data-ega-asked-about] dd');
        if (!row) throw new Error('About not open');
        return row.textContent;
      });
    };
    // The reply is back and quoted above, so "no longer in this conversation" would be false here.
    expect(c.querySelector('[data-ega-ask-quote]')?.textContent).toContain('Hi, how are you?');
    expect(await askedRow()).toBe(
      'Not sent. The reply was no longer in this conversation when this version ran.',
    );
    await fireEvent.click(answer.querySelector('[data-ega-variant-prev]') as HTMLElement);
    await settle();
    // The first version did send the reply, and the reply is back to read it from.
    await waitFor(() =>
      expect(answer.querySelector('[data-ega-asked-about] dd')?.textContent).toContain(
        'Hi, how are you?',
      ),
    );
  });

  describe('two deletes, undone one at a time', () => {
    /** A reply, then a question about it with its answer "Because.". */
    async function asked(c: HTMLElement): Promise<void> {
      await fireEvent.click(askOn(await firstExchange(c)));
      await settle();
      const q = await send(c, 'why?');
      await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    }
    /** Deletes the exchange of the message at `index`, from its own More menu. */
    async function deleteMessage(c: HTMLElement, index: number): Promise<void> {
      const more = c.querySelectorAll<HTMLElement>('[data-ega-user-turn] [data-ega-action="more"]');
      await fireEvent.keyDown(more[index] as HTMLElement, { key: 'Enter' });
      const del = await waitFor(() => {
        const el = document.querySelector<HTMLElement>('[role="menu"] [data-ega-delete]');
        if (!el) throw new Error('menu not open');
        return el;
      });
      await fireEvent.click(del);
      await settle();
    }
    const undos = (push: { mock: { calls: unknown[][] } }): Array<() => void> =>
      (push.mock.calls as Array<[{ action?: { label: string; onClick: () => void } }]>)
        .filter(([m]) => m.action?.label === 'Undo')
        .map(([m]) => (m.action as { onClick: () => void }).onClick);
    /** Regenerate on the answer "Because.", finished, so the next one can run; returns its request. */
    async function regenerateAnswer(c: HTMLElement): Promise<Start> {
      const answer = replies(c).find((r) => r.textContent.includes('Because')) as HTMLElement;
      await openMenu(answer, 'refine');
      await fireEvent.click(document.querySelector('[data-ega-regenerate]') as HTMLElement);
      await settle();
      const again = starts().at(-1) as Start;
      await chunk({ type: 'done', requestId: again.requestId, text: 'Because, again.' });
      return again;
    }

    it('the question undone while its reply is still deleted sends and stores nothing of that reply', async () => {
      const push = vi.spyOn(toastStore, 'push');
      const c = await mounted();
      await asked(c);
      await deleteMessage(c, 1);
      await deleteMessage(c, 0);
      const [undoQuestion, undoReply] = undos(push);
      undoQuestion?.();
      await settle();

      expect(c.textContent).toContain('why?');
      expect(c.querySelector('[data-ega-ask-quote]')).toBeNull();
      expect(JSON.stringify(await chrome.storage.local.get(null))).not.toContain(
        'Hi, how are you?',
      );
      const again = await regenerateAnswer(c);
      expect(JSON.stringify(again.options)).not.toContain('Hi, how are you?');

      undoReply?.();
      await settle();
      expect(c.querySelector('[data-ega-ask-quote]')?.textContent).toContain('Hi, how are you?');
      expect((await regenerateAnswer(c)).options.askAbout?.['result']).toBe('Hi, how are you?');
    });

    it('the reply undone before its question: the question comes back after it, with its quote', async () => {
      const push = vi.spyOn(toastStore, 'push');
      const c = await mounted();
      await asked(c);
      await deleteMessage(c, 0);
      await deleteMessage(c, 0);
      const [undoReply, undoQuestion] = undos(push);
      undoReply?.();
      await settle();
      undoQuestion?.();
      await settle();

      expect(replies(c).map((r) => r.textContent.includes('Hi, how are you?'))).toEqual([
        true,
        false,
      ]);
      expect(c.querySelector('[data-ega-ask-quote]')?.textContent).toContain('Hi, how are you?');
      expect((await regenerateAnswer(c)).options.askAbout?.['result']).toBe('Hi, how are you?');
    });
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

  it('a question whose reply was deleted is a plain bubble, and About on its answer says the reply is gone', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const c = await mounted();
    const reply = await firstExchange(c);
    await fireEvent.click(askOn(reply));
    await settle();
    const q = await send(c, 'why?');
    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });

    await openMenu(c, 'more');
    await fireEvent.click(document.querySelector('[role="menu"] [data-ega-delete]') as HTMLElement);
    await settle();
    const bubble = c.querySelector('[data-ega-user-bubble]');
    expect(bubble?.querySelector('.ega-ask-quote')).toBeNull();
    expect(bubble?.textContent.trim()).toBe('why?');
    await openMenu(c, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    await waitFor(() =>
      expect(c.querySelector('[data-ega-asked-about] dd')?.textContent).toBe(
        'A reply that is no longer in this conversation',
      ),
    );

    push.mock.calls.find(([m]) => m.message === 'Message and reply deleted')?.[0].action?.onClick();
    await settle();
    expect(c.querySelector('[data-ega-ask-quote]')?.textContent).toContain('Hi, how are you?');
  });

  describe('an edited question', () => {
    /** A reply, a question about it with its answer "Because.". */
    async function asked(c: HTMLElement): Promise<void> {
      await fireEvent.click(askOn(await firstExchange(c)));
      await settle();
      const q = await send(c, 'why?');
      await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    }
    /** The pencil on the question, then the new text sent; returns its request. */
    async function editQuestion(c: HTMLElement): Promise<Start> {
      const pencils = c.querySelectorAll<HTMLElement>('.ega-user-turn [data-ega-edit]');
      await fireEvent.click(pencils[pencils.length - 1] as HTMLElement);
      await settle();
      expect(box(c).value).toBe('why?');
      return send(c, 'why so casual?');
    }
    const question = (c: HTMLElement): HTMLElement | undefined =>
      [...c.querySelectorAll<HTMLElement>('[data-ega-user-turn]')].at(-1);
    async function askedRow(c: HTMLElement): Promise<string> {
      const answer = replies(c).at(-1) as HTMLElement;
      await openMenu(answer, 'more');
      await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
      return waitFor(() => {
        const row = answer.querySelector('[data-ega-asked-about] dd');
        if (!row) throw new Error('About not open');
        return row.textContent;
      });
    }

    it('stays about its reply: the re-send carries the reply, and the bubble keeps the quote', async () => {
      const c = await mounted();
      await asked(c);
      const edited = await editQuestion(c);
      expect(edited.text).toBe('why so casual?');
      expect(edited.options['task']).toBe('ask');
      expect(edited.options.askAbout?.['result']).toBe('Hi, how are you?');
      expect(question(c)?.textContent).toContain('why so casual?');
      expect(question(c)?.querySelector('[data-ega-ask-quote]')?.textContent).toContain(
        'Hi, how are you?',
      );
    });

    it('whose reply was deleted sends nothing of it, and About says so, also after Undo', async () => {
      const push = vi.spyOn(toastStore, 'push');
      const c = await mounted();
      await asked(c);
      await openMenu(c, 'more');
      await fireEvent.click(
        document.querySelector('[role="menu"] [data-ega-delete]') as HTMLElement,
      );
      await settle();
      const edited = await editQuestion(c);
      expect(edited.options['task']).toBe('ask');
      expect(edited.options.askAbout).toBeUndefined();
      expect(JSON.stringify(edited.options)).not.toContain('Hi, how are you?');
      await chunk({ type: 'done', requestId: edited.requestId, text: 'Because, casually.' });
      const unsent =
        'Not sent. The reply was no longer in this conversation when this version ran.';
      expect(await askedRow(c)).toBe(unsent);

      push.mock.calls
        .find(([m]) => m.message === 'Message and reply deleted')?.[0]
        .action?.onClick();
      await settle();
      expect(question(c)?.querySelector('[data-ega-ask-quote]')?.textContent).toContain(
        'Hi, how are you?',
      );
      // About is still open, and with the reply back it still says nothing of it was sent.
      await waitFor(() =>
        expect(replies(c).at(-1)?.querySelector('[data-ega-asked-about] dd')?.textContent).toBe(
          unsent,
        ),
      );
    });
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

  it('Done asking while the question is still being sent keeps the draft from before Ask', async () => {
    const c = await mounted();
    await asking(c);
    let release: () => void = () => {};
    sendMessage.mockImplementation((m: { kind?: string }) =>
      m.kind === 'translate:start'
        ? new Promise((resolve) => (release = () => resolve({ ok: true })))
        : Promise.resolve({ ok: true }),
    );
    await type(c, 'why?');
    await fireEvent.click(c.querySelector('[data-ega-send]') as HTMLElement);
    await settle();
    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    release();
    await settle();
    expect(banner(c)).toBeNull();
    expect(box(c).value).toBe('my draft');
  });

  describe('an edit, which ends Ask mode first like Esc and Describe a change', () => {
    const waiting =
      'Your earlier draft is waiting. Press Esc to stop asking, then clear the draft to edit your last message.';
    /** Ask on the only reply, with `draft` typed before and `question` typed after; focus leaves the box. */
    async function askWith(c: HTMLElement, draft: string, question: string): Promise<void> {
      const reply = await firstExchange(c);
      await type(c, draft);
      await fireEvent.click(askOn(reply));
      await settle();
      await type(c, question);
      box(c).blur();
    }

    it('from the pencil drops a typed question, as Esc does, and starts', async () => {
      const c = await mounted();
      await askWith(c, '', 'my long question');
      await fireEvent.click(c.querySelector('.ega-user-turn [data-ega-edit]') as HTMLElement);
      await settle();
      expect(banner(c)).toContain('Editing your message');
      expect(box(c).value).toBe('mar7aba, kifak?');
    });

    it('from a stray `e` keeps a typed question and says how to edit', async () => {
      const push = vi.spyOn(toastStore, 'push');
      const c = await mounted();
      await askWith(c, '', 'my long question');
      await fireEvent.keyDown(window, { key: 'e' });
      await settle();
      expect(toasts(push)).toEqual([
        'Send or clear your question first to edit your last message.',
      ]);
      expect(banner(c)).toContain('Asking about this reply');
      expect(box(c).value).toBe('my long question');
    });

    it('is refused while the draft from before Ask waits, and the toast says how to clear the way', async () => {
      for (const question of ['my long question', '']) {
        const push = vi.spyOn(toastStore, 'push');
        const c = await mounted();
        await askWith(c, 'my draft', question);
        await fireEvent.click(c.querySelector('.ega-user-turn [data-ega-edit]') as HTMLElement);
        await settle();
        expect(toasts(push)).toEqual([waiting]);
        expect(banner(c)).toContain('Asking about this reply');
        expect(box(c).value).toBe(question);

        // Following it: Esc brings the draft back, and with the box cleared the edit starts.
        await fireEvent.keyDown(window, { key: 'Escape' });
        await settle();
        expect(box(c).value).toBe('my draft');
        await type(c, '');
        await fireEvent.click(c.querySelector('.ega-user-turn [data-ega-edit]') as HTMLElement);
        await settle();
        expect(banner(c)).toContain('Editing your message');
        expect(toasts(push)).toEqual([waiting]);
        push.mockRestore();
        document.body.innerHTML = '';
        await chrome.storage.local.clear();
        await chrome.storage.session.clear();
      }
    });

    it('starts when nothing typed would be lost', async () => {
      const c = await mounted();
      await askWith(c, '', '');
      await fireEvent.keyDown(window, { key: 'e' });
      await settle();
      expect(banner(c)).toContain('Editing your message');
      expect(box(c).value).toBe('mar7aba, kifak?');
    });

    it('of an older message is refused while the draft from before Ask waits, before any confirm', async () => {
      const push = vi.spyOn(toastStore, 'push');
      const c = await mounted();
      const [, second] = await twoExchanges(c);
      await type(c, 'my draft');
      await fireEvent.click(askOn(second));
      await settle();
      await type(c, 'my long question');
      await fireEvent.click(c.querySelector('.ega-user-turn [data-ega-edit]') as HTMLElement);
      await settle();
      expect(confirmMock).not.toHaveBeenCalled();
      expect(toasts(push)).toContain(
        'Your earlier draft is waiting. Press Esc to stop asking, then clear the draft to edit this message.',
      );
      expect(box(c).value).toBe('my long question');
    });
  });

  it('an older message’s edit cancelled at its confirm keeps Ask mode', async () => {
    const c = await mounted();
    const [, second] = await twoExchanges(c);
    await fireEvent.click(askOn(second));
    await settle();
    confirmMock.mockResolvedValueOnce(false);
    await fireEvent.click(c.querySelector('.ega-user-turn [data-ega-edit]') as HTMLElement);
    await settle();
    expect(confirmMock).toHaveBeenCalledOnce();
    expect(banner(c)).toContain('Asking about this reply');

    // Confirmed, the edit starts: Ask mode ends first and the message fills the box.
    await fireEvent.click(c.querySelector('.ega-user-turn [data-ega-edit]') as HTMLElement);
    await settle();
    expect(banner(c)).toContain('Editing your message');
    expect(box(c).value).toBe('mar7aba, kifak?');
  });

  it('an Undo of a delete made before Ask began keeps Ask mode and the typed question', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const c = await mounted();
    const [first] = await twoExchanges(c);
    const more = c.querySelectorAll<HTMLElement>('[data-ega-user-turn] [data-ega-action="more"]');
    await fireEvent.keyDown(more[1] as HTMLElement, { key: 'Enter' });
    await fireEvent.click(
      await waitFor(() => {
        const el = document.querySelector<HTMLElement>('[role="menu"] [data-ega-delete]');
        if (!el) throw new Error('menu not open');
        return el;
      }),
    );
    await settle();
    await fireEvent.click(askOn(first));
    await settle();
    await type(c, 'my question');
    push.mock.calls.find(([m]) => m.message === 'Message and reply deleted')?.[0].action?.onClick();
    await settle();
    expect(replies(c)).toHaveLength(2);
    expect(banner(c)).toContain('Asking about this reply');
    expect(box(c).value).toBe('my question');
  });

  it('an Ask exchange that lands from elsewhere ends it too', async () => {
    const c = await mounted();
    await asking(c);
    await writePendingPopupHandoff({
      sourceText: 'what is this page about?',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'ask',
      tone: 'neutral',
      response: 'delivered answer',
    });
    await waitFor(() => expect(c.textContent).toContain('delivered answer'));
    await waitFor(() => expect(banner(c)).toBeNull());
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

describe('Ask from the page tooltip', () => {
  /** What the tooltip's Ask writes: a finished Levantine reply, into Spanish so the pickers move. */
  const fromTooltip = (extra: Record<string, unknown> = {}): Promise<void> =>
    writePendingPopupHandoff({
      sourceText: 'mar7aba, kifak?',
      sourceLang: 'auto',
      targetLang: 'es',
      task: 'translate',
      tone: 'neutral',
      response: 'Hola, ¿qué tal?',
      ask: true,
      reply: { detectedLang: 'arabizi', detectedDetail: 'Levantine', confidence: 0.93 },
      ...extra,
    });
  const seeded = (c: HTMLElement): HTMLElement | undefined =>
    replies(c).find((r) => r.textContent.includes('Hola, ¿qué tal?'));

  it('lands the exchange and asks about it, focus in the field, the pickers set with no toast', async () => {
    const push = vi.spyOn(toastStore, 'push');
    await fromTooltip();
    const c = await mounted();
    await waitFor(() => expect(banner(c)).toContain('Asking about this reply'));
    const reply = seeded(c);
    expect(target(c)).toBe(reply);
    expect(reply?.textContent).toContain('Levantine');
    expect(document.activeElement).toBe(box(c));
    await waitFor(() => expect(said(c)).toBe('Asking about the reply: Hola, ¿qué tal?'));
    expect(push.mock.calls.map(([m]) => m.message)).not.toContainEqual(
      expect.stringMatching(/Language, task and tone set/),
    );

    const q = await send(c, 'what makes it Levantine?');
    expect(q.options['task']).toBe('ask');
    expect(q.options.askAbout?.['original']).toBe('mar7aba, kifak?');
    expect(String(q.options.askAbout?.['languages'])).toContain('Levantine');
    expect(String(q.options.askAbout?.['languages'])).toContain('Spanish');
  });

  it('while asking, it moves the question to the new reply; the typed text stays', async () => {
    const c = await mounted();
    const first = await firstExchange(c);
    await type(c, 'my draft');
    await fireEvent.click(askOn(first));
    await settle();
    await type(c, 'half a question');
    await fromTooltip();
    await waitFor(() => expect(target(c)).toBe(seeded(c)));
    await settle();
    expect(banner(c)).toContain('Asking about this reply');
    expect(box(c).value).toBe('half a question');
    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    expect(box(c).value).toBe('my draft');
  });

  it('during a described change only the exchange lands', async () => {
    const c = await mounted();
    await firstExchange(c);
    await openMenu(c, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-describe-change]') as HTMLElement);
    await settle();
    await fromTooltip();
    await waitFor(() => expect(seeded(c)).toBeDefined());
    await settle();
    expect(banner(c)).toContain('Changing this reply');
    expect(target(c)).toBeNull();
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
    const { echoed } = await slip(c);
    const offer = echoed.querySelector<HTMLElement>('[data-ega-ask-instead]');
    expect(offer?.textContent).toBe('Ask instead');
    await fireEvent.click(offer as HTMLElement);
    await settle();

    const q = starts().at(-1) as Start;
    expect(q.text).toBe('what does it mean');
    expect(q.options['task']).toBe('ask');
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

  it('text typed while the answer runs stays in the field', async () => {
    const c = await mounted();
    const { echoed } = await slip(c);
    await fireEvent.click(echoed.querySelector('[data-ega-ask-instead]') as HTMLElement);
    await settle();
    const q = starts().at(-1) as Start;
    box(c).focus();
    await type(c, 'a follow-up');
    await chunk({ type: 'done', requestId: q.requestId, text: 'It asks what kifak means.' });
    expect(banner(c)).toContain('Asking about this reply');
    expect(target(c)).toBe(echoed);
    expect(box(c).value).toBe('a follow-up');
    // Nothing is lost on the way out either: the text was the draft.
    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    expect(box(c).value).toBe('a follow-up');
  });

  it('text typed meanwhile and then sent as the question does not come back after Done asking', async () => {
    const c = await mounted();
    const { echoed } = await slip(c);
    await fireEvent.click(echoed.querySelector('[data-ega-ask-instead]') as HTMLElement);
    await settle();
    const q = starts().at(-1) as Start;
    await type(c, 'a follow-up');
    await chunk({ type: 'done', requestId: q.requestId, text: 'It asks what kifak means.' });
    const sent = await send(c, 'a follow-up');
    expect(sent.options['task']).toBe('ask');
    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    expect(box(c).value).toBe('');
  });

  it('text typed meanwhile, then extended and sent, is no draft either, in the box or in storage', async () => {
    const c = await mounted();
    const { echoed } = await slip(c);
    await fireEvent.click(echoed.querySelector('[data-ega-ask-instead]') as HTMLElement);
    await settle();
    const q = starts().at(-1) as Start;
    await type(c, 'a fol');
    await chunk({ type: 'done', requestId: q.requestId, text: 'It asks what kifak means.' });
    const sent = await send(c, 'a follow-up');
    expect(sent.options['task']).toBe('ask');
    expect(JSON.stringify(await chrome.storage.session.get(null))).not.toContain('a fol');
    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    expect(box(c).value).toBe('');
  });

  it('paging back to the translation while the answer runs still starts Ask mode when it lands', async () => {
    const c = await mounted();
    const { echoed } = await slip(c);
    await fireEvent.click(echoed.querySelector('[data-ega-ask-instead]') as HTMLElement);
    await settle();
    const q = starts().at(-1) as Start;
    await chunk({ type: 'delta', requestId: q.requestId, text: 'It asks' });
    await fireEvent.click(echoed.querySelector('[data-ega-variant-prev]') as HTMLElement);
    await settle();
    expect(echoed.querySelector('.ega-pager-count')?.textContent).toBe('1/2');
    expect(banner(c)).toBeNull();

    await chunk({ type: 'done', requestId: q.requestId, text: 'It asks what kifak means.' });
    expect(banner(c)).toContain('Asking about this reply');
    expect(target(c)).toBe(echoed);
  });

  it('a later start leaves focus on another reply alone', async () => {
    const c = await mounted();
    const { first, echoed } = await slip(c);
    await fireEvent.click(echoed.querySelector('[data-ega-ask-instead]') as HTMLElement);
    await settle();
    const q = starts().at(-1) as Start;
    first.focus();
    await chunk({ type: 'done', requestId: q.requestId, text: 'It asks what kifak means.' });
    expect(banner(c)).toContain('Asking about this reply');
    expect(document.activeElement).toBe(first);
  });

  it('More → Ask instead is the same action', async () => {
    const c = await mounted();
    await slip(c);
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
    expect(q.options.askAbout?.['result']).toBe('Hi, how are you?');
  });
});

describe('the version and the task a question is about', () => {
  // R2-6: the version shown at Send is the one asked about; the quote is frozen, and its click does not page.
  it('a question asks about the version shown, and its quote leads back without paging', async () => {
    const c = await mounted();
    const reply = await firstExchange(c);
    const again = await regenerate(c);
    await chunk({ type: 'done', requestId: again.requestId, text: 'Hello, how are you?' });
    await fireEvent.click(reply.querySelector('[data-ega-variant-prev]') as HTMLElement);
    await settle();
    expect(reply.querySelector('.ega-pager-count')?.textContent).toBe('1/2');

    await fireEvent.click(askOn(reply));
    await settle();
    const q = await send(c, 'why?');
    expect(q.options.askAbout?.['result']).toBe('Hi, how are you?');
    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });

    await fireEvent.click(reply.querySelector('[data-ega-variant-next]') as HTMLElement);
    await settle();
    const quote = c.querySelector<HTMLElement>('[data-ega-ask-quote]') as HTMLElement;
    expect(quote.textContent).toContain('Hi, how are you?');
    await fireEvent.click(quote);
    await settle();
    expect(document.activeElement).toBe(reply);
    expect(reply.querySelector('.ega-pager-count')?.textContent).toBe('2/2');
    expect(reply.textContent).toContain('Hello, how are you?');
  });

  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const dispatch = { sourceLang: 'auto', targetLang: 'en', stream: true };
  // S1-1 and R2-10: every finished reply can be asked about, and its about block names its task.
  it.each([
    {
      name: 'Explain, with its notes',
      user: { kind: 'explain', content: 'kifak' },
      reply: { kind: 'explain', notes: [{ label: 'Dialect', text: 'Levantine' }] },
      task: 'Explain',
      original: 'kifak',
    },
    {
      name: 'Summarize',
      user: { kind: 'summarize', content: 'a long text' },
      reply: { kind: 'summarize' },
      task: 'Summarize',
      original: 'a long text',
    },
    {
      name: 'a custom task',
      user: { kind: 'translate', taskId: 'c-tweet', content: 'a long text' },
      reply: { kind: 'translate', taskId: 'c-tweet' },
      task: 'Tweet summary',
      original: 'a long text',
    },
    {
      name: 'an image, with no original text and no placeholder',
      user: { kind: 'image-translate', content: IMAGE_TURN_PLACEHOLDER, imageDataUrl: image },
      reply: { kind: 'image-translate' },
      task: 'Translate image',
      original: '',
    },
  ])('$name', async ({ user, reply, task, original }) => {
    await chrome.storage.local.set({
      'ega.customTasks': [
        {
          id: 'c-tweet',
          label: 'Tweet summary',
          system: 'Summarize as one tweet.',
          user: '{{text}}',
          output: 'plain',
          pageContext: false,
          image: false,
          glossary: false,
          createdAt: 1,
        },
      ],
    });
    await saveThread('https://a.test', [
      { id: 'u1', role: 'user', status: 'idle', createdAt: 1, dispatch, ...user },
      {
        id: 'a1',
        role: 'assistant',
        status: 'done',
        createdAt: 2,
        content: 'The answer.',
        attachedToTurnId: 'u1',
        ...reply,
      },
    ] as Turn[]);
    const c = await mounted();
    const target = await waitFor(() => {
      const r = replies(c)[0];
      if (!r) throw new Error('not loaded');
      return r;
    });
    await fireEvent.click(askOn(target));
    await settle();
    const q = await send(c, 'what does it say?');
    expect(q.options['task']).toBe('ask');
    expect(q.options.askAbout?.['task']).toBe(task);
    expect(q.options.askAbout?.['original']).toBe(original);
    expect(q.options.askAbout?.['result']).toBe('The answer.');
    if (user.kind === 'explain') expect(q.options.askAbout?.['notes']).toContain('Levantine');
    expect(JSON.stringify(q)).not.toContain(IMAGE_TURN_PLACEHOLDER);
  });
});

describe('re-runs of an answer to a question', () => {
  /** The first reply, a question about it, and the answer's request. */
  async function question(c: HTMLElement, text = 'why?'): Promise<Start> {
    await fireEvent.click(askOn(await firstExchange(c)));
    await settle();
    return send(c, text);
  }
  const history = [
    { role: 'user', content: 'mar7aba, kifak?' },
    { role: 'assistant', content: 'Hi, how are you?' },
  ];
  const answer = (c: HTMLElement): HTMLElement => replies(c).at(-1) as HTMLElement;

  // R2-4: Retry, a Refine preset and Describe a change all send the reply and the history again.
  it('Retry, a Refine preset and Describe a change each send the reply asked about and the history', async () => {
    const c = await mounted();
    const q = await question(c);
    await chunk({ type: 'error', requestId: q.requestId, code: 'NETWORK', message: 'x' });

    await fireEvent.click(answer(c).querySelector('[data-ega-retry]') as HTMLElement);
    await settle();
    const retried = starts().at(-1) as Start;
    expect(retried.requestId).not.toBe(q.requestId);
    for (const r of [retried]) {
      expect(r.options['task']).toBe('ask');
      expect(r.options.askAbout?.['result']).toBe('Hi, how are you?');
      expect(r.options['conversationHistory']).toEqual(history);
    }
    await chunk({ type: 'done', requestId: retried.requestId, text: 'Because.' });

    await openMenu(answer(c), 'refine');
    await fireEvent.click(document.querySelector('[data-ega-refine-preset]') as HTMLElement);
    await settle();
    const preset = starts().at(-1) as Start;
    expect(preset.options['refinement']).toBeDefined();
    await chunk({ type: 'done', requestId: preset.requestId, text: 'Short: because.' });

    await openMenu(answer(c), 'refine');
    await fireEvent.click(document.querySelector('[data-ega-describe-change]') as HTMLElement);
    await settle();
    const described = await send(c, 'say it in French');
    expect(described.options['refinement']).toBe('say it in French');
    for (const r of [preset, described]) {
      expect(r.options['task']).toBe('ask');
      expect(r.options.askAbout?.['result']).toBe('Hi, how are you?');
      expect(r.options['conversationHistory']).toEqual(history);
    }
  });

  // R2-14: pasted text is asked, and "Translate instead" on its answer sends the text alone.
  it('pasted text is asked; Translate instead on its answer sends that text alone, as Translate', async () => {
    const c = await mounted();
    await fireEvent.click(askOn(await firstExchange(c)));
    await settle();
    const pasted = 'shu 3am ta3mel?\nw kifak?';
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { items: [], files: [], getData: (t: string) => (t === 'text/plain' ? pasted : '') },
    });
    box(c).dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
    const q = await send(c, pasted);
    expect(q.text).toBe(pasted);
    expect(q.options['task']).toBe('ask');
    await chunk({ type: 'done', requestId: q.requestId, text: 'It asks what you are up to.' });

    await openMenu(answer(c), 'more');
    const item = document.querySelector<HTMLElement>('[data-ega-answer-again="translate"]');
    expect(item?.textContent.trim()).toBe('Translate instead');
    await fireEvent.click(item as HTMLElement);
    await settle();
    const again = starts().at(-1) as Start;
    expect(again.text).toBe(pasted);
    expect(again.options['task']).toBeUndefined();
    expect(again.options.askAbout).toBeUndefined();
    expect(again.options['conversationHistory']).toBeUndefined();

    // About on that version names no reply: it asked about none.
    await chunk({ type: 'done', requestId: again.requestId, text: 'What are you up to?' });
    await openMenu(answer(c), 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    await waitFor(() => expect(answer(c).querySelector('[data-ega-inspector]')).not.toBeNull());
    expect(answer(c).querySelector('[data-ega-asked-about]')).toBeNull();
  });

  it('Ask instead on its Translate version asks about the reply its quote shows, not the newest one', async () => {
    const c = await mounted();
    const [first] = await twoExchanges(c);
    await fireEvent.click(askOn(first));
    await settle();
    const q = await send(c, 'why?');
    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    await openMenu(answer(c), 'more');
    await fireEvent.click(
      document.querySelector('[data-ega-answer-again="translate"]') as HTMLElement,
    );
    await settle();
    await chunk({ type: 'done', requestId: (starts().at(-1) as Start).requestId, text: 'Why?' });

    await openMenu(answer(c), 'more');
    await fireEvent.click(document.querySelector('[data-ega-answer-again="ask"]') as HTMLElement);
    await settle();
    const again = starts().at(-1) as Start;
    expect(again.options['task']).toBe('ask');
    expect(again.options.askAbout?.['result']).toBe('Hi, how are you?');
    await chunk({ type: 'done', requestId: again.requestId, text: 'Because, again.' });
    const quote = [...c.querySelectorAll('[data-ega-ask-quote]')].at(-1);
    expect(quote?.textContent).toContain('Hi, how are you?');
    await openMenu(answer(c), 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    await waitFor(() =>
      expect(answer(c).querySelector('[data-ega-asked-about] dd')?.textContent).toBe(
        'Hi, how are you?',
      ),
    );
  });
});

describe('Ask mode while an answer runs, under a filter, across conversations and a close', () => {
  async function asking(c: HTMLElement): Promise<{ reply: HTMLElement; q: Start }> {
    const reply = await firstExchange(c);
    await fireEvent.click(askOn(reply));
    await settle();
    const q = await send(c, 'why?');
    await chunk({ type: 'delta', requestId: q.requestId, text: 'Bec' });
    return { reply, q };
  }
  const cancels = (): unknown[] =>
    (sendMessage.mock.calls as Array<[Record<string, unknown>]>).filter(
      ([m]) => m['kind'] === 'translate:cancel',
    );

  // R2-11: Esc stops the running answer first, and Ask mode stays.
  it('Esc while the answer streams stops it and keeps asking about the same reply', async () => {
    const c = await mounted();
    const { reply } = await asking(c);
    box(c).focus();
    await fireEvent.keyDown(box(c), { key: 'Escape' });
    await settle();
    expect(cancels()).toHaveLength(1);
    expect(banner(c)).toContain('Asking about this reply');
    expect(target(c)).toBe(reply);
  });

  // R2-20: Done asking leaves the mode; the answer keeps streaming, and the mode does not come back with it.
  it('Done asking while the answer streams leaves the mode, and the answer finishes without moving it', async () => {
    const c = await mounted();
    const { q } = await asking(c);
    await fireEvent.click(c.querySelector('[aria-label="Done asking"]') as HTMLElement);
    await settle();
    expect(banner(c)).toBeNull();
    await chunk({ type: 'delta', requestId: q.requestId, text: 'ause.' });
    await chunk({ type: 'done', requestId: q.requestId });
    expect(cancels()).toEqual([]);
    expect(replies(c).at(-1)?.textContent).toContain('Because.');
    expect(banner(c)).toBeNull();
    expect(target(c)).toBeNull();
  });

  // R2-8: the bookmark filter hides the quoted reply, so the quote clears it.
  it('a quote whose reply the bookmark filter hides clears the filter, then shows the reply', async () => {
    const c = await mounted();
    const { q } = await asking(c);
    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    const more = c.querySelectorAll<HTMLElement>('[data-ega-user-turn] [data-ega-action="more"]');
    await fireEvent.keyDown(more[1] as HTMLElement, { key: 'Enter' });
    await fireEvent.click(
      await waitFor(() => {
        const el = document.querySelector<HTMLElement>('[role="menu"] [data-ega-bookmark]');
        if (!el) throw new Error('menu not open');
        return el;
      }),
    );
    await settle();
    await pickHeaderMenuItem(c, '[data-ega-bookmark-filter]');
    await settle();
    expect(replies(c).some((r) => r.textContent.includes('Hi, how are you?'))).toBe(false);

    await fireEvent.click(c.querySelector('[data-ega-ask-quote]') as HTMLElement);
    await settle();
    const shown = replies(c).find((r) => r.textContent.includes('Hi, how are you?'));
    expect(shown).toBeDefined();
    expect(document.activeElement).toBe(shown);
  });

  // S3-3 and R2-13e: another conversation of the same site, opened from the list, ends the mode.
  it('another conversation of this site, opened from the list, ends it', async () => {
    await saveThread('https://a.test', [
      { id: 'o1', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'older' },
      {
        id: 'o2',
        role: 'assistant',
        kind: 'translate',
        status: 'done',
        createdAt: 2,
        content: 'older reply',
        attachedToTurnId: 'o1',
      },
    ] as Turn[]);
    const c = await mounted();
    await waitFor(() => expect(c.textContent).toContain('older reply'));
    await fireEvent.click(c.querySelector('[data-ega-new-conversation]') as HTMLElement);
    await settle();
    const { q } = await asking(c);
    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    expect(banner(c)).toContain('Asking about this reply');

    await fireEvent.click(c.querySelector('[data-ega-header-site]') as HTMLElement);
    const open = await waitFor(() => {
      const b = document.querySelector<HTMLElement>(
        '[data-ega-conv-row="https://a.test"] [data-ega-conv-open]',
      );
      if (!b) throw new Error('row not shown');
      return b;
    });
    await fireEvent.click(open);
    await waitFor(() => expect(c.textContent).toContain('older reply'));
    await settle();
    expect(banner(c)).toBeNull();
  });

  // R2-13d: an Ask handoff while editing lands only the exchange.
  it('a tooltip Ask while a message is being edited lands only the exchange', async () => {
    const c = await mounted();
    await firstExchange(c);
    await fireEvent.keyDown(window, { key: 'e' });
    await settle();
    expect(banner(c)).toContain('Editing your message');
    await writePendingPopupHandoff({
      sourceText: 'from the page',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      response: 'Delivered.',
      ask: true,
    });
    await waitFor(() => expect(c.textContent).toContain('Delivered.'));
    await settle();
    expect(banner(c) ?? '').not.toContain('Asking about this reply');
    expect(target(c)).toBeNull();
  });

  // R2-13g: a close in Ask mode keeps the draft from before Ask, never the question.
  it('a close in Ask mode leaves the draft from before Ask stored, and the panel opens on it', async () => {
    const first = render(SidePanel);
    await waitFor(() => {
      if (!first.container.querySelector('#sp-text')) throw new Error('not mounted');
    });
    await settle();
    const c = first.container;
    const reply = await firstExchange(c);
    await type(c, 'my draft');
    await fireEvent.click(askOn(reply));
    await settle();
    await type(c, 'a question I never sent');
    first.unmount();
    await settle();
    const stored = JSON.stringify(await chrome.storage.session.get(null));
    expect(stored).toContain('my draft');
    expect(stored).not.toContain('a question I never sent');

    const again = await mounted();
    expect(box(again).value).toBe('my draft');
    expect(banner(again)).toBeNull();
  });
});

describe("the store's size cap", () => {
  /** The message box's hidden description while Ask mode is on (R2-15). */
  const askLine = (c: HTMLElement): string | undefined =>
    box(c).getAttribute('aria-describedby')?.split(' ').includes('sp-ask-line')
      ? c.querySelector('#sp-ask-line')?.textContent
      : undefined;

  it('a question whose save trims the reply it asks about keeps Ask mode, which then moves to the answer', async () => {
    await nearTheByteCap('https://a.test');
    const c = await mounted();
    await type(c, 'my draft');
    await fireEvent.click(askOn(replies(c)[0]));
    await settle();
    const q = await send(c, 'why?');
    expect(q.options['task']).toBe('ask');
    await waitFor(() => expect(c.querySelector('[data-turn-id="a0"]')).toBeNull(), {
      timeout: 3000,
    });
    expect(banner(c)).toContain('Asking about this reply');
    expect(askLine(c)).toBe('Asking about a reply removed to save space');
    expect(box(c).value).toBe('');

    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    expect(banner(c)).toContain('Asking about this reply');
    expect(target(c)).toBe(replies(c).at(-1));
    await waitFor(() => expect(said(c)).toBe('Now asking about the new answer'));
    expect(box(c).value).toBe('');
  });

  // 300 stored messages make the mount slow, so this one gets more time.
  it('a question at 300 messages that trims the reply it asks about keeps Ask mode too', async () => {
    const exchanges = Array.from({ length: MAX_TURNS_PER_THREAD / 2 }, (_, i) => [
      { id: `u${i}`, role: 'user', kind: 'translate', status: 'idle', createdAt: 2 * i + 1 },
      {
        id: `a${i}`,
        role: 'assistant',
        kind: 'translate',
        status: 'done',
        createdAt: 2 * i + 2,
        content: `reply ${i}`,
        attachedToTurnId: `u${i}`,
      },
    ]);
    await saveThread(
      'https://a.test',
      exchanges.flat().map((t) => ({ content: `text ${t.id}`, ...t })) as Turn[],
    );
    const c = await mounted();
    // A search brings the oldest reply on screen without drawing all 300 messages.
    await fireEvent.click(c.querySelector('[data-ega-search-toggle]') as HTMLElement);
    await settle();
    await fireEvent.input(c.querySelector('[data-ega-search]') as HTMLInputElement, {
      target: { value: 'reply 0' },
    });
    await settle();
    await fireEvent.click(askOn(c.querySelector<HTMLElement>('[data-turn-id="a0"]') ?? undefined));
    await settle();
    const q = await send(c, 'and the first one?');
    expect(q.options.askAbout?.['result']).toBe('reply 0');
    expect(c.querySelector('[data-turn-id="a0"]')).toBeNull();
    expect(banner(c)).toContain('Asking about this reply');
    expect(askLine(c)).toBe('Asking about a reply removed to save space');

    await chunk({ type: 'done', requestId: q.requestId, text: 'Because.' });
    expect(target(c)).toBe(replies(c).at(-1));
    await waitFor(() => expect(said(c)).toBe('Now asking about the new answer'));
  }, 20_000);
});

describe('the shortcut sheet', () => {
  const sheetTerms = (): string[] =>
    Array.from(document.querySelectorAll('.shortcut-row dt')).map((d) => d.textContent);

  it('lists `a` while the Ask task is on, and not once it is off', async () => {
    await mounted();
    await fireEvent.keyDown(window, { key: '?' });
    await waitFor(() => expect(sheetTerms()).toContain('Ask about the focused reply'));
    await fireEvent.keyDown(window, { key: 'Escape' });
    await settle();

    await updateSettings({ disabledTasks: ['ask'] });
    await settle();
    await fireEvent.keyDown(window, { key: '?' });
    await waitFor(() => expect(sheetTerms()).toContain('Regenerate the focused reply'));
    expect(sheetTerms()).not.toContain('Ask about the focused reply');
  });
});
