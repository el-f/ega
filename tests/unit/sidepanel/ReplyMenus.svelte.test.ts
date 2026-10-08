// @vitest-environment jsdom
// Side panel spec §1.6, §1.7, §5.4 (with X10): every reply has a Refine menu and a More menu.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
import { doneReply, openMenu, replyProps } from './_reply';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const items = (menu: HTMLElement): string[] =>
  Array.from(menu.querySelectorAll('[role^="menuitem"]')).map((i) => i.textContent.trim());

describe('Refine', () => {
  it('offers the task presets, Describe a change and the language items', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply(), { composerTarget: 'fr' }),
    });
    const menu = await openMenu(container, 'refine');
    expect(items(menu)).toEqual([
      'Shorter',
      'Less formal',
      'Keep slang',
      'Describe a change…',
      'Translate into French',
      'Translate into another language…',
    ]);
  });

  it('a preset sends its fixed body and label for this reply', async () => {
    const props = replyProps(doneReply());
    const { container } = render(AssistantTurn, { props });
    await openMenu(container, 'refine');
    await fireEvent.click(
      document.querySelector('[data-ega-refine-preset="shorter"]') as HTMLElement,
    );
    expect(props.onRefine).toHaveBeenCalledWith({
      turnId: 'a1',
      refinementBody: 'Make outputs shorter.',
      refinementLabel: 'Shorter',
    });
  });

  it('presets follow the task; a custom task gets none but can still describe a change', async () => {
    const ex = render(AssistantTurn, { props: replyProps(doneReply({ kind: 'explain' })) });
    expect(items(await openMenu(ex.container, 'refine')).slice(0, 2)).toEqual([
      'Shorter',
      'Simpler',
    ]);
    document.body.innerHTML = '';
    const custom = render(AssistantTurn, {
      props: replyProps(doneReply({ taskId: 'c-tweet' })),
    });
    expect(items(await openMenu(custom.container, 'refine'))[0]).toBe('Describe a change…');
  });

  it('offers "Translate into" only when the composer target differs from this reply', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply(), { composerTarget: 'en' }),
    });
    expect(items(await openMenu(container, 'refine'))).not.toContain('Translate into English');
  });

  it('Describe a change hands the reply to the composer', async () => {
    const props = replyProps(doneReply());
    const { container } = render(AssistantTurn, { props });
    await openMenu(container, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-describe-change]') as HTMLElement);
    expect(props.onDescribeChange).toHaveBeenCalledWith('a1');
  });

  it('another language runs only from its Translate button, not from the select', async () => {
    const props = replyProps(doneReply());
    const { container } = render(AssistantTurn, { props });
    await openMenu(container, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-translate-into-other]') as HTMLElement);
    const select = await waitFor(() => {
      const s = document.querySelector<HTMLSelectElement>('#rm-into-a1');
      if (!s) throw new Error('popover not open');
      return s;
    });
    await fireEvent.change(select, { target: { value: 'de' } });
    expect(props.onTranslateInto).not.toHaveBeenCalled();
    await fireEvent.click(document.querySelector('[data-ega-translate-into-run]') as HTMLElement);
    expect(props.onTranslateInto).toHaveBeenCalledWith('a1', 'de');
  });

  // V5-11: the menu closes as the popover opens, so without this nothing showed which button the popover belongs to.
  it('Refine reads as open while its Translate into popover is open', async () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply()) });
    const refine = container.querySelector<HTMLElement>('[data-ega-action="refine"]');
    await openMenu(container, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-translate-into-other]') as HTMLElement);
    const run = await waitFor(() => {
      const b = document.querySelector<HTMLElement>('[data-ega-translate-into-run]');
      if (!b) throw new Error('popover not open');
      return b;
    });
    expect(refine?.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(run);
    await waitFor(() => expect(refine?.hasAttribute('aria-pressed')).toBe(false));
  });

  // A dialog inside the reply's toolbar lost End, Home and the arrows to the toolbar's roving keys.
  it('the Translate into dialog sits outside the toolbar, so its keys stay in it', async () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply()) });
    await openMenu(container, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-translate-into-other]') as HTMLElement);
    const select = await waitFor(() => {
      const s = document.querySelector<HTMLSelectElement>('#rm-into-a1');
      if (!s) throw new Error('popover not open');
      return s;
    });
    expect(select.closest('[role="toolbar"]')).toBeNull();
    select.focus();
    await fireEvent.keyDown(select, { key: 'End' });
    expect(document.activeElement).toBe(select);
  });

  it('picking the reply’s own language adds a version instead of doing nothing', async () => {
    const props = replyProps(doneReply(), { composerTarget: 'en' });
    const { container } = render(AssistantTurn, { props });
    await openMenu(container, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-translate-into-other]') as HTMLElement);
    const run = await waitFor(() => {
      const b = document.querySelector<HTMLElement>('[data-ega-translate-into-run]');
      if (!b) throw new Error('popover not open');
      return b;
    });
    await fireEvent.click(run);
    expect(props.onTranslateInto).not.toHaveBeenCalled();
    expect(props.onRegenerate).toHaveBeenCalledWith('a1');
  });

  // Reword and Grammar keep the input's language, so a language re-run would do nothing or say something untrue.
  it('a Reword or Grammar reply offers no language items', async () => {
    for (const kind of ['reword', 'grammar'] as const) {
      const { container } = render(AssistantTurn, {
        props: replyProps(doneReply({ kind, detectedLang: 'es' }), {
          composerTarget: 'en',
          swapPair: { sourceLang: 'es', targetLang: 'en' },
        }),
      });
      const listed = items(await openMenu(container, 'refine'));
      expect(listed.some((t) => t.startsWith('Translate into') || t.startsWith('Swap'))).toBe(
        false,
      );
      // No separator is left dangling at the end of the menu.
      const menu = document.querySelector('[role="menu"]');
      expect(menu?.lastElementChild?.getAttribute('role')).not.toBe('separator');
      document.body.innerHTML = '';
    }
  });

  it('names the swap it can run, and runs it', async () => {
    const props = replyProps(doneReply(), {
      swapPair: { sourceLang: 'en', targetLang: 'es' },
    });
    const { container } = render(AssistantTurn, { props });
    await openMenu(container, 'refine');
    const swap = document.querySelector('[data-ega-swap-item]') as HTMLElement;
    expect(swap.textContent.trim()).toBe('Swap: English → Spanish');
    await fireEvent.click(swap);
    expect(props.onSwap).toHaveBeenCalledWith('a1');
  });

  it('a refined version offers Show changes, which turns the word diff on with no timer', async () => {
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
      ],
      activeVariantIdx: 1,
    });
    const { container } = render(AssistantTurn, { props: replyProps(turn) });
    expect(container.querySelector('[data-ega-diff]')).toBeNull();
    await openMenu(container, 'refine');
    await fireEvent.click(document.querySelector('[data-ega-show-changes]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-ega-diff="del"]')).not.toBeNull());
  });

  it('while another reply runs, the items stay but say why and do nothing', async () => {
    const props = replyProps(doneReply(), { inflight: true });
    const { container } = render(AssistantTurn, { props });
    const menu = await openMenu(container, 'refine');
    expect(menu.textContent).toContain('Wait for the current reply to finish.');
    const preset = document.querySelector('[data-ega-refine-preset="shorter"]') as HTMLElement;
    expect(preset.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(preset);
    expect(props.onRefine).not.toHaveBeenCalled();
  });

  it('an image reply offers only the language items', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply({ kind: 'image-translate' }), { hasImage: true }),
    });
    expect(items(await openMenu(container, 'refine'))).toEqual([
      'Translate into another language…',
    ]);
  });
});

describe('More', () => {
  it('lists About, the Answer again tasks without this one, Bookmark, and Delete last', async () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply()) });
    const list = items(await openMenu(container, 'more'));
    expect(list[0]).toMatch(/^(Read aloud|About this reply)$/);
    expect(list).toContain('Explain instead');
    expect(list).toContain('Fix grammar instead');
    expect(list).toContain('Suggest replies instead');
    expect(list).not.toContain('Translate instead');
    expect(list.at(-2)).toBe('Bookmark');
    expect(list.at(-1)).toBe('Delete');
  });

  it('answering again runs that task on this reply', async () => {
    const props = replyProps(doneReply());
    const { container } = render(AssistantTurn, { props });
    await openMenu(container, 'more');
    await fireEvent.click(
      document.querySelector('[data-ega-answer-again="explain"]') as HTMLElement,
    );
    expect(props.onTaskSwitch).toHaveBeenCalledWith('a1', 'explain');
  });

  it('an image reply re-runs only as a task that reads images', async () => {
    const { container } = render(AssistantTurn, {
      props: replyProps(doneReply({ kind: 'image-translate' }), {
        hasImage: true,
        taskViews: SHIPPED_TASK_VIEWS,
      }),
    });
    const list = items(await openMenu(container, 'more'));
    expect(list.filter((l) => l.endsWith('instead'))).toEqual(['Explain instead']);
  });

  it('About opens under the row with focus on its heading; Close gives focus back to More', async () => {
    const { container } = render(AssistantTurn, { props: replyProps(doneReply()) });
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const heading = await waitFor(() => {
      const h = container.querySelector<HTMLElement>('[data-ega-inspector-title]');
      if (!h) throw new Error('About not open');
      return h;
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await fireEvent.click(
      container.querySelector('[data-ega-inspector] [aria-label="Close"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-ega-action')).toBe('more'),
    );
  });

  // The switch lives in Settings → Advanced → Diagnostics; the first tab has nothing to change.
  // A handed-off answer carries no record: no meta on the turn or on its version.
  const noRecord = (): ReturnType<typeof doneReply> => {
    const { meta: _meta, variants, ...rest } = doneReply();
    return { ...rest, variants: (variants ?? []).map(({ meta: _m, ...v }) => v) };
  };
  it('About on a reply with no record offers the switch only when it is off, and opens Advanced', async () => {
    const off = render(AssistantTurn, {
      props: replyProps(noRecord(), { recordsDetails: false }),
    });
    await openMenu(off.container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const settings = await waitFor(() => {
      const b = off.container.querySelector<HTMLElement>('[data-ega-instructions] button');
      if (!b) throw new Error('no Settings button');
      return b;
    });
    await fireEvent.click(settings);
    await waitFor(async () =>
      expect(await chrome.storage.local.get('ega.pendingOptionsTab')).toEqual({
        'ega.pendingOptionsTab': 'advanced',
      }),
    );
    document.body.innerHTML = '';
    const on = render(AssistantTurn, {
      props: replyProps(noRecord(), { recordsDetails: true }),
    });
    await openMenu(on.container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
    const line = await waitFor(() => {
      const l = on.container.querySelector('[data-ega-instructions]');
      if (!l) throw new Error('About not open');
      return l;
    });
    expect(line.textContent).toContain('Not recorded for this reply.');
    expect(line.querySelector('button')).toBeNull();
  });

  it('Bookmark and Delete act on this reply', async () => {
    const props = replyProps(doneReply());
    const { container } = render(AssistantTurn, { props });
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-bookmark]') as HTMLElement);
    expect(props.onBookmark).toHaveBeenCalledWith('a1');
    await openMenu(container, 'more');
    await fireEvent.click(document.querySelector('[data-ega-delete]') as HTMLElement);
    expect(props.onDelete).toHaveBeenCalledWith('a1');
  });
});
