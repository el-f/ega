// @vitest-environment jsdom
// Side panel spec §5.1 (D-f): the bubble holds only the user's text; actions float in a toolbar.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { UserTurnData } from '@/sidepanel/state/conversation';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function turn(over: Partial<UserTurnData> = {}): UserTurnData {
  return {
    id: 'u1',
    role: 'user',
    kind: 'translate',
    status: 'idle',
    content: 'hola amigo',
    createdAt: 1,
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const toolbarKeys = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll('[data-ega-user-toolbar] [data-ega-action]')).map(
    (b) => b.getAttribute('data-ega-action') ?? '',
  );

describe('the user message', () => {
  it('the bubble holds the text only; the name starts with the text', () => {
    const { container } = render(UserTurn, { props: { turn: turn() } });
    const bubble = container.querySelector('[data-ega-user-bubble]');
    expect(bubble?.textContent.trim()).toBe('hola amigo');
    expect(bubble?.querySelector('button')).toBeNull();
    expect(container.querySelector('[data-ega-user-turn]')?.getAttribute('aria-label')).toBe(
      'You: hola amigo',
    );
  });

  it('names its task above the bubble only when it is given one', () => {
    const plain = render(UserTurn, { props: { turn: turn() } });
    expect(plain.container.querySelector('.ega-task-label')).toBeNull();
    document.body.innerHTML = '';
    const labelled = render(UserTurn, { props: { turn: turn(), taskLabel: 'Reword · Casual' } });
    expect(labelled.container.querySelector('.ega-task-label')?.textContent).toBe(
      'Reword · Casual',
    );
  });

  it('notes a cut message, and an image that is gone', () => {
    const cut = render(UserTurn, { props: { turn: turn({ trimmedTo: 2000 }) } });
    expect(cut.container.textContent).toContain('Only the first 2000 characters were sent.');
    document.body.innerHTML = '';
    const gone = render(UserTurn, {
      props: { turn: turn({ kind: 'image-translate', content: '[image]' }) },
    });
    expect(gone.container.textContent).toContain('Image not shown');
    document.body.innerHTML = '';
    const kept = render(UserTurn, {
      props: { turn: turn({ kind: 'image-translate', content: '[image]', imageDataUrl: PNG }) },
    });
    expect(kept.container.querySelector('img')).not.toBeNull();
  });

  // Spec §7: an Explain or Ask message keeps its typed note when its image is dropped for space; say an image went too.
  it('notes a dropped image on a message that also had a typed note', () => {
    const { container } = render(UserTurn, {
      props: { turn: turn({ kind: 'explain', content: 'And this one?', imageShed: true }) },
    });
    const bubble = container.querySelector('[data-ega-user-bubble]');
    expect(bubble?.textContent).toContain('Image not shown');
    expect(bubble?.textContent).toContain('And this one?');
  });

  it('marks the message being edited', () => {
    const { container } = render(UserTurn, { props: { turn: turn(), editing: true } });
    expect(container.querySelector('[data-ega-user-bubble]')?.classList.contains('editing')).toBe(
      true,
    );
  });
});

describe('the message toolbar', () => {
  it('is one toolbar of Copy, Edit and More', () => {
    const { container } = render(UserTurn, { props: { turn: turn(), latest: true } });
    expect(
      container.querySelector('[role="toolbar"][aria-label="Message actions"]'),
    ).not.toBeNull();
    expect(toolbarKeys(container)).toEqual(['copy', 'edit', 'more']);
  });

  it('the newest message edits in place; an older one edits from here and says how much goes', async () => {
    const onEdit = vi.fn();
    const newest = render(UserTurn, { props: { turn: turn(), latest: true, onEdit } });
    expect(newest.container.querySelector('[data-ega-edit]')?.getAttribute('aria-label')).toBe(
      'Edit',
    );
    await fireEvent.click(newest.container.querySelector('[data-ega-edit]') as HTMLElement);
    expect(onEdit).toHaveBeenCalledWith('u1');
    document.body.innerHTML = '';
    const older = render(UserTurn, { props: { turn: turn(), latest: false, laterCount: 3 } });
    const edit = older.container.querySelector('[data-ega-edit]');
    expect(edit?.getAttribute('aria-label')).toBe('Edit from here');
  });

  it('hides Edit while a reply runs and on an image message, instead of a disabled button', () => {
    const busy = render(UserTurn, { props: { turn: turn(), inflight: true } });
    expect(toolbarKeys(busy.container)).toEqual(['copy', 'more']);
    document.body.innerHTML = '';
    const img = render(UserTurn, {
      props: { turn: turn({ kind: 'image-translate', content: '[image]', imageDataUrl: PNG }) },
    });
    expect(toolbarKeys(img.container)).toEqual(['more']);
  });

  it('Copy writes the text', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { container } = render(UserTurn, { props: { turn: turn() } });
    await fireEvent.click(container.querySelector('[data-ega-copy-source]') as HTMLElement);
    expect(write).toHaveBeenCalledWith('hola amigo');
  });

  it('More holds Bookmark and Delete, like a reply', async () => {
    const onBookmark = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(UserTurn, { props: { turn: turn(), onBookmark, onDelete } });
    const open = async (): Promise<void> => {
      await fireEvent.keyDown(container.querySelector('[data-ega-action="more"]') as HTMLElement, {
        key: 'Enter',
      });
      await waitFor(() => {
        if (!document.querySelector('[role="menu"]')) throw new Error('menu not open');
      });
    };
    await open();
    await fireEvent.click(document.querySelector('[data-ega-bookmark]') as HTMLElement);
    expect(onBookmark).toHaveBeenCalledWith('u1');
    await open();
    await fireEvent.click(document.querySelector('[data-ega-delete]') as HTMLElement);
    expect(onDelete).toHaveBeenCalledWith('u1');
  });

  it('arrows move inside the toolbar, which is one tab stop', async () => {
    const { container } = render(UserTurn, { props: { turn: turn(), latest: true } });
    const stops = Array.from(
      container.querySelectorAll('[data-ega-user-toolbar] [data-ega-action]'),
    ).filter((b) => b.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    await fireEvent.keyDown(container.querySelector('[data-ega-action="copy"]') as HTMLElement, {
      key: 'ArrowRight',
    });
    expect(document.activeElement?.getAttribute('data-ega-action')).toBe('edit');
  });
});
