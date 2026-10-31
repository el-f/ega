// @vitest-environment jsdom
// Side panel spec §5.2: answer first, one meta line, one action row; older replies keep the row's space.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import { answerSpecFor } from '@/shared/answer/spec';
import { loadMarkdownRenderer } from '@/shared/components/markdown-loader';
import type { AnswerSnapshot } from '@/shared/types';
import { doneReply, meta, metaText, openMenu, replyProps } from './_reply';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** A custom task's answer: a text main answer and one text note per key. */
function customAnswer(main: string, notes: Record<string, string> = {}): AnswerSnapshot {
  const note = (key: string) =>
    ({ key, label: key, kind: 'text', role: 'notes', required: true }) as const;
  return {
    spec: {
      id: 'custom:break-this',
      version: 1,
      join: 'after-build',
      fields: [
        { key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true },
        ...Object.keys(notes).map(note),
      ],
    },
    fields: { answer: main, ...notes },
  };
}

/** Every Markdown block on the page has rendered: the shared renderer loaded and its callbacks flushed. */
async function markdownSettled(): Promise<void> {
  await loadMarkdownRenderer();
  await new Promise((resolve) => setTimeout(resolve));
  await tick();
}

describe('the answer', () => {
  it('a done reply renders its text, not a card header', async () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply()) });
    await waitFor(() =>
      expect(container.querySelector('.ega-answer')?.textContent).toContain('Hello, friend.'),
    );
    expect(container.querySelector('[data-ega-reply]')?.getAttribute('aria-label')).toBe(
      'Ega reply',
    );
    expect(container.querySelector('[data-ega-timestamp]')).toBeNull();
  });

  it('before the first token: three bars and the task gerund in the meta slot, the row space kept', () => {
    const turn = doneReply({ status: 'pending', content: '', kind: 'explain' });
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    expect(container.querySelectorAll('.ega-skeleton-bar')).toHaveLength(3);
    expect(metaText(container)).toEqual(['Explaining…']);
    expect(container.querySelector('.ega-reply-actions-slot')).not.toBeNull();
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });

  it('streams plain text with a caret, hidden from assistive tech until it settles', () => {
    const turn = doneReply({ status: 'streaming', content: 'Hel' });
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    const plain = container.querySelector('.ega-plain');
    expect(plain?.getAttribute('aria-hidden')).toBe('true');
    expect(plain?.querySelector('.ega-cursor')).not.toBeNull();
    expect(container.querySelector('.ega-md')).toBeNull();
  });

  it('an empty answer says what to do, and keeps the normal row', async () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply({ content: '' })) });
    expect(container.querySelector('[data-ega-empty-body]')?.textContent).toBe(
      'No answer came back. Try Regenerate.',
    );
    // The copy names Regenerate, and the name of the row's menu says Regenerate is in it.
    expect(container.querySelector('[data-ega-action="refine"]')?.getAttribute('aria-label')).toBe(
      'Regenerate or refine',
    );
    // Nothing came back, so there is nothing to be confident about (V5-05).
    expect(metaText(container).some((t) => t.includes('confiden'))).toBe(false);
    // Nothing to ask about either; Regenerate is where the line says, first in Refine.
    expect(container.querySelector('[data-ega-action="ask"]')).toBeNull();
    const menu = await openMenu(container, 'refine');
    expect(menu.querySelector('[data-ega-regenerate]')).not.toBeNull();
  });

  it('shows raw HTML in a prose answer and its notes as text', async () => {
    const turn = doneReply({
      content: '<h1>Title</h1>',
      notes: [{ key: 'n', label: 'Note', text: '<h2>n</h2>' }],
    });
    const { container } = render(AssistantTurn, {
      props: replyProps(turn, { sentText: 'mar7aba habibi' }),
    });
    const reply = container.querySelector('[data-ega-reply]') as HTMLElement;
    // The fallback <pre> shows the text raw, so wait for both Markdown passes to land.
    await waitFor(() => {
      expect(reply.querySelectorAll('.ega-md')).toHaveLength(2);
      expect(reply.querySelector('.ega-md-fallback')).toBeNull();
    });
    expect(reply.querySelector('h1, h2')).toBeNull();
    expect(reply.textContent).toContain('<h1>Title</h1>');
    expect(reply.textContent).toContain('<h2>n</h2>');
  });

  it("shows a custom task's answer and text fields exactly as the model sent them; built-in notes keep Markdown", async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const regex = String.raw`/^\w+([\.-]?\w+)*@\w+$/`;
    const math = 'a * b * c\na*b*c';
    const main = `Main: ${regex} and a*b*c\n**second** line`;
    const custom = doneReply({
      content: main,
      notes: [
        { key: 'fix', label: 'Fix', text: regex },
        { key: 'math', label: 'Math', text: math },
      ],
      answer: customAnswer(main, { fix: regex, math }),
    });
    const { container } = render(AssistantTurn, { props: replyProps(custom) });
    await markdownSettled();
    expect(container.querySelector('.ega-answer')?.textContent).toBe(main);
    expect(container.querySelector('.ega-answer')?.getAttribute('dir')).toBe('auto');
    const note = (key: string) =>
      container.querySelector<HTMLElement>(`[data-ega-note="${key}"] .answer-note-text`);
    expect(note('fix')?.textContent).toBe(regex);
    expect(note('math')?.textContent).toBe(math);
    expect(note('fix')?.querySelector('[dir="auto"]')).not.toBeNull();
    expect(container.querySelector('.ega-md, em, strong')).toBeNull();
    await fireEvent.click(container.querySelector('[data-ega-action="copy"]') as HTMLElement);
    expect(write).toHaveBeenCalledWith(main);

    document.body.innerHTML = '';
    const builtIn = render(AssistantTurn, {
      props: replyProps(
        doneReply({
          kind: 'explain',
          notes: [{ key: 'explain', label: 'Context & subtext', text: '`sort` sorts in place.' }],
          answer: { spec: answerSpecFor('explain'), fields: { translation: 'Hello, friend.' } },
        }),
      ),
    });
    await waitFor(() =>
      expect(
        builtIn.container.querySelector('[data-ega-note="explain"] .ega-md code')?.textContent,
      ).toBe('sort'),
    );
  });

  it('a custom answer that is one fenced block shows its code as a block, and Copy takes the code', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const code = String.raw`const re = /^\w+([\.-]?\w+)*$/;`;
    const content = `\`\`\`js\n${code}\n\`\`\``;
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply({ content, answer: customAnswer(content) })),
    });
    const answer = container.querySelector('.ega-answer') as HTMLElement;
    await waitFor(() => expect(answer.querySelector('.ega-md pre > code')).not.toBeNull());
    expect(answer.querySelector('pre > code')?.textContent.trim()).toBe(code);
    await fireEvent.click(container.querySelector('[data-ega-action="copy"]') as HTMLElement);
    expect(write).toHaveBeenCalledWith(code);
  });

  it.each([
    ['a code answer', '```html\n<h1>Comment thread fixture</h1>\n```', null],
    [
      'a half-prose answer',
      'The page title:\n\n```html\n<h1>Comment thread fixture</h1>\n```',
      'The page title:',
    ],
  ])('renders %s through Markdown: the fence is a code block', async (_name, content, prose) => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply({ content }), { sentText: '<h1>Comment thread fixture</h1>' }),
    });
    const answer = container.querySelector('.ega-answer') as HTMLElement;
    await waitFor(() => expect(answer.querySelector('.ega-md pre > code')).not.toBeNull());
    expect(answer.querySelector('pre > code')?.textContent).toContain(
      '<h1>Comment thread fixture</h1>',
    );
    expect(answer.querySelector('h1')).toBeNull();
    expect(answer.textContent).not.toContain('```');
    expect(answer.querySelector('.ega-md > p')?.textContent ?? null).toBe(prose);
  });

  it('notes sit under the answer with a sentence-case label', () => {
    const turn = doneReply({ kind: 'explain', explain: 'Levantine slang.' });
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    expect(container.querySelector('.answer-note-label')?.textContent).toBe('Context & subtext');
  });
  it('renders the saved main list and custom note labels after the task changes', () => {
    const turn = doneReply({
      content: 'First\nSecond',
      notes: [{ key: 'points', label: 'Original label', items: ['Useful'] }],
      answer: {
        spec: {
          id: 'custom:deleted',
          version: 1,
          join: 'after-build',
          fields: [{ key: 'answer', label: 'Answer', kind: 'list', role: 'main', required: true }],
        },
        fields: { answer: ['First', 'Second'], hidden: 'For JSON only' },
      },
    });
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    expect([...container.querySelectorAll('.ega-answer li')].map((li) => li.textContent)).toEqual([
      'First',
      'Second',
    ]);
    expect(container.querySelector('[data-ega-note="points"]')?.textContent).toContain(
      'Original label',
    );
    expect(container.textContent).not.toContain('For JSON only');
  });

  it('marks the answer with the language it is in; a rewrite takes the input language', () => {
    const t = render(AssistantTurn, { props: replyProps(doneReply()) });
    expect(t.container.querySelector('.ega-answer')?.getAttribute('lang')).toBe('en');
    document.body.innerHTML = '';
    const r = render(AssistantTurn, {
      props: replyProps(doneReply({ kind: 'reword', detectedLang: 'fr' }), { targetLang: 'en' }),
    });
    expect(r.container.querySelector('.ega-answer')?.getAttribute('lang')).toBe('fr');
  });
});

describe('the meta line', () => {
  it('reads direction, model and confidence, in that order', () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply()) });
    expect(metaText(container)).toEqual(['Spanish → English', 'Claude Haiku 4.5', '93% confident']);
  });

  it('a link the panel answered itself says so, with no languages and no Regenerate', async () => {
    const link = 'https://example.com/docs';
    const {
      confidence: _c,
      meta: _m,
      detectedLang: _d,
      ...turn
    } = doneReply({
      content: link,
      variants: [{ id: 'a1:v1', status: 'done', content: link, nothingToTranslate: true }],
    });
    const { container } = render(AssistantTurn, {
      props: replyProps(turn, { sourceLang: 'es', recordsDetails: true }),
    });
    expect(metaText(container)).toEqual(['Nothing to translate']);
    expect(container.querySelector('.ega-answer')?.textContent).toContain(link);
    const menu = await openMenu(container, 'refine');
    expect(menu.querySelector('[data-ega-regenerate]')).toBeNull();
  });

  it('a link the panel answered itself has no About, which would say it was sent', async () => {
    const link = 'https://example.com/docs';
    const v1 = { id: 'a1:v1', status: 'done' as const, content: 'Hello, friend.', meta: meta() };
    const v2 = {
      id: 'a1:v2',
      status: 'done' as const,
      content: link,
      nothingToTranslate: true as const,
    };
    const modelReply = doneReply({ variants: [v1, v2], activeVariantIdx: 0 });
    const { meta: _m, confidence: _c, detectedLang: _d, ...rest } = modelReply;
    const localReply = { ...rest, content: link, activeVariantIdx: 1 };
    const { container, rerender } = render(AssistantTurn, {
      props: replyProps(modelReply, { recordsDetails: false }),
    });
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-ega-inspector]')).not.toBeNull());

    // Flipping to the local version hides About opened on the model one.
    await rerender({ turn: localReply });
    expect(container.querySelector('[data-ega-inspector]')).toBeNull();
    const menu = await openMenu(container, 'more');
    expect(menu.querySelector('[data-ega-about]')).toBeNull();
    expect(menu.textContent).not.toContain('About this reply');
  });

  it('cuts a cue-word detail from an older reply, and About keeps it whole', async () => {
    const detail = 'Levantine (kifak, shu, 3am, ktir, 3njad)';
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply({ detectedLang: 'arabizi', detectedDetail: detail })),
    });
    expect(metaText(container)[0]).toBe('Arabizi — Levantine (kifak, shu, 3am… → English');
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const about = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-ega-inspector]');
      if (!el) throw new Error('About not open');
      return el;
    });
    expect(about.textContent).toContain(`Arabizi — ${detail} → English`);
  });

  it('names both languages of mixed text', () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(
        doneReply({
          detectedLang: 'arabizi',
          detectedLangs: [{ id: 'arabizi', detail: 'Levantine' }, { id: 'en' }],
        }),
      ),
    });
    expect(metaText(container)[0]).toBe('Arabizi (Levantine) + English → English');
  });

  it('names a detail that came with no language', () => {
    const turn = doneReply({ detectedDetail: 'Venetian Italian' });
    delete turn.detectedLang;
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    expect(metaText(container)[0]).toBe('Venetian Italian → English');
  });

  it('follows the confidence setting: off hides it, below the threshold hides it', () => {
    const off = render(AssistantTurn, {
      props: replyProps(doneReply(), { confidence: { show: false, threshold: 0 } }),
    });
    expect(metaText(off.container)).not.toContain('93% confident');
    document.body.innerHTML = '';
    const low = render(AssistantTurn, {
      props: replyProps(doneReply({ confidence: 0.42 }), {
        confidence: { show: true, threshold: 0.5 },
      }),
    });
    expect(metaText(low.container).join(' ')).not.toMatch(/confiden/);
  });

  it('names a fallback, a saved answer and a bookmark', () => {
    const fallback = doneReply({
      bookmarked: true,
      meta: meta({
        backendId: 'gemini' as never,
        modelId: 'gemini-2.5-flash',
        attempts: [
          { backendId: 'anthropic' as never, status: 'error', code: 'SERVER', latencyMs: 1 },
          { backendId: 'gemini' as never, status: 'ok', latencyMs: 1 },
        ],
      }),
    });
    const { container } = render(AssistantTurn, { props: replyProps(fallback) });
    expect(metaText(container).slice(0, 3)).toEqual([
      'Bookmarked',
      'Answered by Gemini',
      'Anthropic failed',
    ]);
    document.body.innerHTML = '';
    const cached = render(AssistantTurn, {
      props: replyProps(doneReply({ meta: meta({ cacheHit: true }) })),
    });
    expect(metaText(cached.container)).toContain('Saved answer');
  });

  it('names what made the shown version', () => {
    const turn = doneReply({
      content: 'Hi.',
      variants: [
        { id: 'v1', status: 'done', content: 'Hello there.' },
        {
          id: 'v2',
          status: 'done',
          content: 'Hi.',
          refinementBody: 'Make outputs shorter.',
          refinementLabel: 'Shorter',
        },
        { id: 'v3', status: 'done', content: 'Hi', task: 'explain' },
      ],
      activeVariantIdx: 1,
    });
    const { container, rerender } = render(AssistantTurn, { props: replyProps(turn) });
    expect(metaText(container)).toContain('Shorter');
    void rerender(replyProps({ ...turn, activeVariantIdx: 2 }));
    return waitFor(() => expect(metaText(container)).toContain('As Explain'));
  });

  it('says which hidden version is loading', () => {
    const turn = doneReply({
      variants: [
        { id: 'v1', status: 'done', content: 'Hello' },
        { id: 'v2', status: 'pending', content: '' },
      ],
      activeVariantIdx: 0,
    });
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    expect(metaText(container)[0]).toBe('Version 2 loading…');
  });
});

describe('the action row', () => {
  it('is one toolbar of Copy, Ask, Refine and More, with one tab stop', async () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply()) });
    const row = container.querySelector('[role="toolbar"][aria-label="Reply actions"]');
    const keys = Array.from(row?.querySelectorAll('[data-ega-action]') ?? []).map((b) =>
      b.getAttribute('data-ega-action'),
    );
    expect(keys).toEqual(['copy', 'ask', 'refine', 'more']);
    const stops = Array.from(row?.querySelectorAll('[data-ega-action]') ?? []).filter(
      (b) => b.getAttribute('tabindex') === '0',
    );
    expect(stops).toHaveLength(1);
    await fireEvent.keyDown(row?.querySelector('[data-ega-action="copy"]') as HTMLElement, {
      key: 'End',
    });
    expect(document.activeElement?.getAttribute('data-ega-action')).toBe('more');
  });

  it('Regenerate leads the Refine menu; while another reply runs it stays and says why', async () => {
    const props = replyProps(doneReply());
    const { container } = render(AssistantTurn, { props });
    let menu = await openMenu(container, 'refine');
    const first = menu.querySelector('[role^="menuitem"]');
    expect(first?.textContent.trim()).toBe('Regenerate');
    await fireEvent.click(first as HTMLElement);
    expect(props.onRegenerate).toHaveBeenCalledWith('a1');
    document.body.innerHTML = '';
    const busy = render(AssistantTurn, { props: { ...props, inflight: true } });
    menu = await openMenu(busy.container, 'refine');
    const item = menu.querySelector('[data-ega-regenerate]') as HTMLElement;
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(menu.textContent).toContain('Wait for the current reply to finish.');
    await fireEvent.click(item);
    expect(props.onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('a reply with nothing to replay has no Refine, so no Regenerate', () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply(), { canRetry: false }),
    });
    expect(container.querySelector('[data-ega-action="refine"]')).toBeNull();
    expect(container.querySelector('[data-ega-action="more"]')).not.toBeNull();
  });

  it('an older reply is marked so its row hides until hover or focus, with its space kept', () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply(), { isLatest: false }),
    });
    expect(container.querySelector('[data-ega-reply]')?.classList.contains('older')).toBe(true);
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it('Copy writes the answer; a refused clipboard says so in the meta line', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { container } = render(AssistantTurn, { props: replyProps(doneReply()) });
    await fireEvent.click(container.querySelector('[data-ega-action="copy"]') as HTMLElement);
    expect(write).toHaveBeenCalledWith('Hello, friend.');
    await waitFor(() =>
      expect(container.querySelector('[data-ega-action="copy"]')?.getAttribute('aria-label')).toBe(
        'Copied',
      ),
    );
    write.mockRejectedValueOnce(new Error('denied'));
    document.body.innerHTML = '';
    const again = render(AssistantTurn, { props: replyProps(doneReply()) });
    await fireEvent.click(again.container.querySelector('[data-ega-action="copy"]') as HTMLElement);
    await waitFor(() => expect(metaText(again.container)[0]).toBe("Couldn't copy. Try again."));
  });

  it('Copy of a code answer writes the code without its fence lines', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const content = '```html\n<body>\n    <p id="c1">Hello</p>\n</body>\n```';
    const { container } = render(AssistantTurn, { props: replyProps(doneReply({ content })) });
    await fireEvent.click(container.querySelector('[data-ega-action="copy"]') as HTMLElement);
    expect(write).toHaveBeenCalledWith('<body>\n    <p id="c1">Hello</p>\n</body>');
  });
});

describe('versions', () => {
  const three = (): ReturnType<typeof doneReply> =>
    doneReply({
      variants: [
        { id: 'v1', status: 'done', content: 'One' },
        { id: 'v2', status: 'done', content: 'Two' },
        { id: 'v3', status: 'done', content: 'Three' },
      ],
      activeVariantIdx: 1,
      content: 'Two',
    });

  it('a pager at the end of the row reads 2/3 and names the version', () => {
    const { container } = render(AssistantTurn, { props: replyProps(three()) });
    expect(container.querySelector('.ega-pager-count')?.textContent).toBe('2/3');
    expect(container.querySelector('[data-ega-variant-nav]')?.textContent).toContain(
      'Version 2 of 3',
    );
    expect(container.querySelector('[data-ega-reply]')?.getAttribute('aria-label')).toBe(
      'Ega reply, version 2 of 3',
    );
  });

  // 1/12 to 10/12 would widen the count and move the next arrow (R63).
  it('the count holds the width of the last version', () => {
    const { container } = render(AssistantTurn, { props: replyProps(three()) });
    const sizers = container.querySelectorAll('.ega-pager-count [data-label]');
    expect([...sizers].map((s) => s.getAttribute('data-label'))).toEqual(['3/3']);
  });

  it('pages both ways and marks the ends', async () => {
    const props = replyProps(three());
    const { container, rerender } = render(AssistantTurn, { props });
    await fireEvent.click(container.querySelector('[data-ega-variant-prev]') as HTMLElement);
    await fireEvent.click(container.querySelector('[data-ega-variant-next]') as HTMLElement);
    expect(props.onSelectVariant.mock.calls).toEqual([
      ['a1', 0],
      ['a1', 2],
    ]);
    await rerender({ ...props, turn: { ...three(), activeVariantIdx: 0 } });
    expect(container.querySelector('[data-ega-variant-prev]')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
    await fireEvent.click(container.querySelector('[data-ega-variant-prev]') as HTMLElement);
    expect(props.onSelectVariant).toHaveBeenCalledTimes(2);
  });

  it('a version that is still running keeps the pager, so the earlier one can be read', async () => {
    const running = doneReply({
      status: 'streaming',
      content: 'Tw',
      variants: [
        { id: 'v1', status: 'done', content: 'One' },
        { id: 'v2', status: 'streaming', content: 'Tw' },
      ],
      activeVariantIdx: 1,
    });
    const props = replyProps(running);
    const { container } = render(AssistantTurn, { props });
    // Only the pager: Copy, Regenerate, Refine and More wait for the reply to land.
    expect(container.querySelector('[data-ega-action="copy"]')).toBeNull();
    expect(container.querySelector('.ega-pager-count')?.textContent).toBe('2/2');
    await fireEvent.click(container.querySelector('[data-ega-variant-prev]') as HTMLElement);
    expect(props.onSelectVariant).toHaveBeenCalledWith('a1', 0);
  });

  it('a failed or stopped version keeps the pager beside its error actions', async () => {
    const failed = doneReply({
      status: 'error',
      content: '',
      error: { code: 'NETWORK', message: 'fetch failed' },
      variants: [
        { id: 'v1', status: 'done', content: 'One' },
        { id: 'v2', status: 'error', content: '', error: { code: 'NETWORK', message: 'x' } },
      ],
      activeVariantIdx: 1,
    });
    const props = replyProps(failed);
    const { container, rerender } = render(AssistantTurn, { props });
    const row = container.querySelector('.ega-error-actions');
    expect(row?.querySelector('[data-ega-retry]')).not.toBeNull();
    expect(row?.querySelector('.ega-pager-count')?.textContent).toBe('2/2');
    await fireEvent.click(row?.querySelector('[data-ega-variant-prev]') as HTMLElement);
    expect(props.onSelectVariant).toHaveBeenCalledWith('a1', 0);

    const stopped = { ...failed, error: { code: 'ABORTED' as const, message: '' } };
    await rerender({ ...props, turn: stopped });
    expect(container.querySelector('[data-ega-cancelled]')).not.toBeNull();
    expect(container.querySelector('.ega-error-actions .ega-pager-count')?.textContent).toBe('2/2');
  });
});

// Each state draws its own pager (action row, error row, running slot): a state change must not drop focus to <body>.
describe('focus on the pager', () => {
  const NET = { code: 'NETWORK' as const, message: 'fetch failed' };
  const shown = (
    idx: 0 | 1,
    second: 'error' | 'streaming' | 'done',
  ): ReturnType<typeof doneReply> => {
    const v2 =
      second === 'error'
        ? { id: 'v2', status: 'error' as const, content: '', error: NET }
        : { id: 'v2', status: second, content: second === 'done' ? 'Two' : 'Tw' };
    const variants = [{ id: 'v1', status: 'done' as const, content: 'One' }, v2];
    return idx === 0
      ? doneReply({ variants, activeVariantIdx: 0, content: 'One' })
      : doneReply({
          variants,
          activeVariantIdx: 1,
          status: v2.status,
          content: v2.content,
          ...(second === 'error' ? { error: NET } : {}),
        });
  };

  it('paging between a done and a failed version keeps focus on the same arrow', async () => {
    const props = replyProps(shown(0, 'error'));
    const { container, rerender } = render(AssistantTurn, { props });
    (container.querySelector('[data-ega-variant-next]') as HTMLElement).focus();
    await rerender({ ...props, turn: shown(1, 'error') });
    await tick();
    expect(document.activeElement).toBe(
      container.querySelector('.ega-error-actions [data-ega-variant-next]'),
    );
    (container.querySelector('[data-ega-variant-prev]') as HTMLElement).focus();
    await rerender({ ...props, turn: shown(0, 'error') });
    await tick();
    expect(document.activeElement).toBe(
      container.querySelector('.ega-reply-actions [data-ega-variant-prev]'),
    );
  });

  it('a version that finishes while its pager has focus keeps it there', async () => {
    const props = replyProps(shown(1, 'streaming'));
    const { container, rerender } = render(AssistantTurn, { props });
    (container.querySelector('[data-ega-variant-prev]') as HTMLElement).focus();
    await rerender({ ...props, turn: shown(1, 'done') });
    await tick();
    expect(document.activeElement).toBe(
      container.querySelector('.ega-reply-actions [data-ega-variant-prev]'),
    );
  });

  it('paging onto a running version keeps focus on the arrow, not the reply', async () => {
    const props = replyProps(shown(0, 'streaming'));
    const { container, rerender } = render(AssistantTurn, { props });
    (container.querySelector('[data-ega-variant-next]') as HTMLElement).focus();
    await rerender({ ...props, turn: shown(1, 'streaming') });
    await tick();
    expect(document.activeElement).toBe(
      container.querySelector('.ega-reply-actions-slot [data-ega-variant-next]'),
    );
  });
});

describe('focus after a re-run', () => {
  it('moves to the reply when the button that started it unmounts', async () => {
    const props = replyProps(doneReply());
    const { container, rerender } = render(AssistantTurn, { props });
    (document.activeElement as HTMLElement | null)?.blur();
    await rerender({ ...props, turn: doneReply({ status: 'pending', content: '' }) });
    await tick();
    expect(document.activeElement).toBe(container.querySelector('[data-ega-reply]'));
  });

  it('leaves focus alone when it is somewhere else', async () => {
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    const props = replyProps(doneReply());
    const { rerender } = render(AssistantTurn, { props });
    elsewhere.focus();
    await rerender({ ...props, turn: doneReply({ status: 'pending', content: '' }) });
    await tick();
    expect(document.activeElement).toBe(elsewhere);
  });
});
