// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { ComponentProps } from 'svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import type { Settings } from '@/shared/types';
import type { ContextMenuItem } from '@/shared/context-menu';

type OnPatch = ComponentProps<typeof ContextMenuManager>['onPatch'];

function makeProps(overrides: { s?: Partial<Settings>; onPatch?: Mock<OnPatch> } = {}): {
  s: Settings;
  onPatch: Mock<OnPatch>;
} {
  return {
    s: { ...DEFAULT_SETTINGS, ...overrides.s } as Settings,
    onPatch: overrides.onPatch ?? vi.fn<OnPatch>(),
  };
}

/** Renders the card with an onPatch that feeds each write back in, as the options tab does. */
function renderLive(s: Partial<Settings> = {}) {
  let current = makeProps({ s }).s;
  const onPatch = vi.fn<OnPatch>(async (p: Partial<Settings>) => {
    current = { ...current, ...p } as Settings;
    await view.rerender({ s: current, onPatch });
  });
  const view = render(ContextMenuManager, { props: { s: current, onPatch } });
  return { ...view, onPatch };
}

function written(onPatch: Mock<OnPatch>, call = -1): ContextMenuItem[] {
  const p = onPatch.mock.calls.at(call)?.[0] as Partial<Settings> | undefined;
  if (!p?.contextMenuItems) throw new Error('no contextMenuItems write');
  return p.contextMenuItems;
}

function row(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-ega-cm-id="${id}"]`);
  if (!el) throw new Error(`row ${id} not found`);
  return el;
}

function names(container: HTMLElement, group: string): string[] {
  return Array.from(
    container.querySelectorAll(`[data-ega-cm-group="${group}"] [data-ega-cm-name]`),
  ).map((n) => n.textContent.trim());
}

const custom: ContextMenuItem = {
  id: 'ega-custom-txt-tt-9',
  kind: 'task',
  enabled: true,
  order: 7,
  label: '',
  task: 'explain',
  surface: 'tooltip',
};

let pushed: ToastMsg[] = [];

beforeEach(() => {
  resetChromeMock();
  pushed = [];
  vi.spyOn(toastStore, 'push').mockImplementation((m) => {
    pushed.push(m);
  });
});

describe('ContextMenuManager — the card is the menu', () => {
  it('draws one box per menu Chrome shows, each under "Ega ▸", with the automatic names', () => {
    const { container, getByRole } = render(ContextMenuManager, { props: makeProps() });
    expect(getByRole('heading', { name: 'Right-click menu' })).toBeTruthy();
    for (const title of ['Selected text', 'Images', 'Page']) {
      expect(getByRole('heading', { name: title, level: 3 })).toBeTruthy();
    }
    expect(names(container, 'selection')).toEqual(['Translate', 'Translate in side panel']);
    expect(names(container, 'image')).toEqual([
      'Translate image in side panel',
      'Explain image in side panel',
    ]);
    expect(names(container, 'page')).toEqual([
      'Translate this page',
      'Pick an element to translate',
      'Disable Ega on this site',
    ]);
    const previews = Array.from(container.querySelectorAll('[data-ega-cm-preview]'));
    expect(previews.map((p) => p.textContent.trim())).toEqual(['Ega ▸', 'Ega ▸', 'Ega ▸']);
  });

  it('shows the new name to a profile that stored the old one', () => {
    const items = DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
      i.id === 'ega-translate-selection' ? { ...i, label: 'Translate selection with Ega' } : i,
    );
    const { container } = render(ContextMenuManager, {
      props: makeProps({ s: { contextMenuItems: items } }),
    });
    expect(names(container, 'selection')[0]).toBe('Translate');
    expect(container.querySelector('[data-ega-section-reset]')).toBeNull();
  });

  it('has no Layout control and a one-line description with the rest behind (i)', () => {
    const { container, getByRole } = render(ContextMenuManager, { props: makeProps() });
    expect(container.querySelector('[data-ega-cm-layout]')).toBeNull();
    expect(container.textContent).not.toMatch(/Nested|Flat/);
    expect(container.querySelector('.ega-section-card-desc')?.textContent.trim()).toBe(
      'What Ega adds when you right-click a web page',
    );
    expect(getByRole('button', { name: 'About the right-click menu' })).toBeTruthy();
  });

  it('gives each row two tab stops: its checkbox and one toolbar stop', async () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    await tick();
    const toolbars = Array.from(container.querySelectorAll<HTMLElement>('[role="toolbar"]'));
    expect(toolbars).toHaveLength(6);
    for (const bar of toolbars) {
      const stops = bar.querySelectorAll('button[tabindex="0"]');
      expect(stops).toHaveLength(1);
      expect(stops[0]?.textContent).toContain('Edit');
      expect(bar.getAttribute('aria-label')).toMatch(/^Actions for /);
    }
    // Defaults: 6 checkboxes + 6 toolbars + 2 site-toggle arrows + 2 Add buttons + (i).
    const tabbable = Array.from(
      container.querySelectorAll<HTMLElement>('button, input, select, [tabindex]'),
    ).filter((el) => el.tabIndex >= 0 && !el.closest('[hidden]'));
    expect(tabbable).toHaveLength(17);
  });

  it('keeps the drag grip out of the keyboard and screen-reader path', async () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    // The drag library re-applies its own tabindex when its zone mounts; the grip takes it back.
    await tick();
    for (const grip of container.querySelectorAll<HTMLElement>('[data-ega-cm-handle]')) {
      expect(grip.tabIndex).toBe(-1);
      expect(grip.getAttribute('aria-hidden')).toBe('true');
      expect(grip.hasAttribute('role')).toBe(false);
    }
  });
});

describe('ContextMenuManager — showing and hiding', () => {
  it('the checkbox shows or hides a row and saves at once', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { getByRole } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    await fireEvent.click(getByRole('checkbox', { name: 'Show Translate' }));
    expect(onPatch).toHaveBeenCalledOnce();
    expect(written(onPatch).find((i) => i.id === 'ega-translate-selection')?.enabled).toBe(false);
  });

  it('a hidden row says "Hidden", and a group with nothing shown says so', () => {
    const items = DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
      i.kind === 'image-task' ? { ...i, enabled: false } : i,
    );
    const { container } = render(ContextMenuManager, {
      props: makeProps({ s: { contextMenuItems: items } }),
    });
    const image = row(container, 'ega-translate-image');
    expect(image.querySelector('[data-ega-cm-status]')?.textContent.trim()).toBe('Hidden');
    const box = container.querySelector('[data-ega-cm-group="image"] [data-ega-cm-preview]');
    expect(box?.textContent.trim()).toBe('Nothing from Ega shows here');
  });

  it('a row whose task is off says why, and its checkbox cannot bring it back', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, {
      props: makeProps({ onPatch, s: { disabledTasks: ['explain'] } }),
    });
    const explain = row(container, 'ega-explain-image');
    const status = explain.querySelector('[data-ega-cm-status]');
    expect(status?.textContent.trim()).toBe('Hidden: Explain is off in Tasks');
    const box = explain.querySelector<HTMLInputElement>('[data-ega-cm-enabled]');
    expect(box?.getAttribute('aria-disabled')).toBe('true');
    expect(box?.getAttribute('aria-describedby')).toBe(status?.id);
    // aria-disabled, not disabled: it stays focusable so the reason is read.
    expect(box?.disabled).toBe(false);
    if (!box) throw new Error('no checkbox');
    await fireEvent.click(box);
    expect(onPatch).not.toHaveBeenCalled();
    expect(box.checked).toBe(true);
  });

  it('the picker item says it is hidden while the element picker is off', () => {
    const { container } = render(ContextMenuManager, {
      props: makeProps({ s: { pickerEnabled: false } }),
    });
    expect(
      row(container, 'ega-pick-element').querySelector('[data-ega-cm-status]')?.textContent.trim(),
    ).toBe('Hidden: the element picker is off');
  });

  it('the site toggle has no checkbox and no Edit, and explains its flip', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const site = row(container, 'ega-toggle-site');
    expect(site.querySelector('[data-ega-cm-enabled]')).toBeNull();
    expect(site.querySelector('[data-ega-cm-edit]')).toBeNull();
    expect(site.querySelector('[data-ega-cm-site-note]')?.textContent.trim()).toBe(
      'Shows "Enable Ega on this site" on sites where Ega is off',
    );
  });

  it('a custom-task row reads "Loading…" until the task list arrives, never "Deleted task"', async () => {
    const tweet: ContextMenuItem = { ...custom, task: 'c-tweet' };
    const { container } = render(ContextMenuManager, {
      props: makeProps({ s: { contextMenuItems: [...DEFAULT_CONTEXT_MENU_ITEMS, tweet] } }),
    });
    const name = row(container, tweet.id).querySelector('[data-ega-cm-name]');
    expect(name?.textContent.trim()).toBe('Loading…');
    expect(container.textContent).not.toContain('Deleted task');
    // The stored list has no c-tweet, so once it loads the row says its task is gone.
    await waitFor(() =>
      expect(
        row(container, tweet.id).querySelector('[data-ega-cm-status]')?.textContent.trim(),
      ).toBe('Hidden: its task was deleted'),
    );
  });
});

describe('ContextMenuManager — Edit', () => {
  it('opens one row at a time and closes on Esc with focus back on Edit', async () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const editA = row(container, 'ega-translate-selection').querySelector<HTMLElement>(
      '[data-ega-cm-edit]',
    );
    const editB = row(container, 'ega-translate-image').querySelector<HTMLElement>(
      '[data-ega-cm-edit]',
    );
    if (!editA || !editB) throw new Error('edit buttons missing');
    expect(editA.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(editA);
    expect(editA.getAttribute('aria-expanded')).toBe('true');
    const region = container.querySelector<HTMLElement>(`#${editA.getAttribute('aria-controls')}`);
    expect(region?.hidden).toBe(false);
    await fireEvent.click(editB);
    expect(editA.getAttribute('aria-expanded')).toBe('false');
    expect(editB.getAttribute('aria-expanded')).toBe('true');

    const field = row(container, 'ega-translate-image').querySelector<HTMLElement>(
      '[data-ega-cm-label]',
    );
    if (!field) throw new Error('name field missing');
    field.focus();
    await fireEvent.keyDown(field, { key: 'Escape' });
    expect(editB.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(document.activeElement).toBe(editB));
  });

  it('text options: Task with off tasks marked, Opens in, Answer in and Name in menu', async () => {
    const { container } = render(ContextMenuManager, {
      props: makeProps({ s: { disabledTasks: ['reword'] } }),
    });
    const r = row(container, 'ega-translate-selection');
    await fireEvent.click(r.querySelector('[data-ega-cm-edit]') as HTMLElement);
    const ui = within(r);
    const task = ui.getByLabelText('Task') as HTMLSelectElement;
    const reword = Array.from(task.options).find((o) => o.value === 'reword');
    expect([reword?.textContent.trim(), reword?.disabled]).toEqual(['Reword (off)', true]);
    expect(ui.getByRole('radiogroup', { name: 'Opens in' })).toBeTruthy();
    expect(
      ui.getByText('On the page uses your Display surface choice: tooltip or inline'),
    ).toBeTruthy();
    const lang = ui.getByLabelText('Answer in') as HTMLSelectElement;
    await waitFor(() =>
      expect(lang.querySelector('option[value="auto"]')?.textContent).toMatch(/^Default \(.+\)$/),
    );
    expect(ui.getByLabelText('Name in menu')).toBeTruthy();
    expect(ui.getByText('Leave empty to use "Translate"')).toBeTruthy();
    // A shipped row can be hidden, never deleted.
    expect(r.querySelector('[data-ega-cm-delete]')).toBeNull();
  });

  it('changing Opens in keeps the row mounted and its id, so focus stays put', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container, rerender } = render(ContextMenuManager, {
      props: makeProps({ onPatch }),
    });
    const before = row(container, 'ega-translate-selection');
    await fireEvent.click(before.querySelector('[data-ega-cm-edit]') as HTMLElement);
    const side = within(before).getByRole('radio', { name: 'Side panel' });
    await fireEvent.click(side);
    const items = written(onPatch);
    const edited = items.find((i) => i.id === 'ega-translate-selection');
    expect(edited?.kind === 'task' ? edited.surface : null).toBe('sidepanel');
    await rerender(makeProps({ onPatch, s: { contextMenuItems: items } }));
    expect(row(container, 'ega-translate-selection')).toBe(before);
    expect(names(container, 'selection')[0]).toBe('Translate in side panel');
  });

  it('a typed name saves after the debounce; an empty one means the automatic name', async () => {
    vi.useFakeTimers();
    try {
      const onPatch = vi.fn<OnPatch>();
      const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
      const r = row(container, 'ega-translate-selection');
      await fireEvent.click(r.querySelector('[data-ega-cm-edit]') as HTMLElement);
      const input = r.querySelector<HTMLInputElement>('[data-ega-cm-label]');
      if (!input) throw new Error('no name field');
      expect(input.value).toBe('');
      for (const value of ['M', 'My', 'My name']) {
        await fireEvent.input(input, { target: { value } });
        vi.advanceTimersByTime(50);
      }
      expect(onPatch).not.toHaveBeenCalled();
      vi.advanceTimersByTime(400);
      expect(onPatch).toHaveBeenCalledOnce();
      expect(written(onPatch).find((i) => i.id === 'ega-translate-selection')?.label).toBe(
        'My name',
      );
      // No error state: an empty field is valid.
      await fireEvent.input(input, { target: { value: '' } });
      await fireEvent.blur(input);
      expect(input.getAttribute('aria-invalid')).toBeNull();
      expect(written(onPatch).find((i) => i.id === 'ega-translate-selection')?.label).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('picking a language names the row after it and stores it', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    const r = row(container, 'ega-translate-selection');
    await fireEvent.click(r.querySelector('[data-ega-cm-edit]') as HTMLElement);
    const lang = within(r).getByLabelText('Answer in') as HTMLSelectElement;
    if (!Array.from(lang.options).some((o) => o.value === 'fr')) throw new Error('no French');
    lang.value = 'fr';
    await fireEvent.change(lang);
    const item = written(onPatch).find((i) => i.id === 'ega-translate-selection');
    expect(item?.kind === 'task' ? item.targetLang : null).toBe('fr');
  });
});

describe('ContextMenuManager — add, delete, move, reset', () => {
  it('Add text action adds a row on the default task, on the page, and opens it on Task', async () => {
    const { container, onPatch } = renderLive({ defaultTask: 'explain' });
    await fireEvent.click(container.querySelector('[data-ega-cm-add]') as HTMLElement);
    const added = written(onPatch).find(
      (i) => !DEFAULT_CONTEXT_MENU_ITEMS.some((d) => d.id === i.id),
    );
    expect(added).toMatchObject({ kind: 'task', task: 'explain', surface: 'tooltip', label: '' });
    expect(added && DEFAULT_CONTEXT_MENU_ITEMS.some((i) => i.id === added.id)).toBe(false);
    await waitFor(() =>
      expect(document.activeElement?.hasAttribute('data-ega-cm-task')).toBe(true),
    );
    expect(names(container, 'selection').at(-1)).toBe('Explain');
  });

  it('Add image action adds Translate in the side panel, in the Images group', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    await fireEvent.click(container.querySelector('[data-ega-cm-add-image]') as HTMLElement);
    const items = written(onPatch);
    const images = items.filter((i) => i.kind === 'image-task');
    expect(images.at(-1)).toMatchObject({ task: 'translate', surface: 'sidepanel' });
    // Written group by group, so the new image row sits before the page rows.
    expect(items.findIndex((i) => i === images.at(-1))).toBeLessThan(
      items.findIndex((i) => i.kind === 'page-translate'),
    );
  });

  it('Delete is only on added rows; it offers Undo and moves focus to the next row', async () => {
    const second: ContextMenuItem = { ...custom, id: 'ega-custom-txt-tt-10', order: 8 };
    const items = [...DEFAULT_CONTEXT_MENU_ITEMS, custom, second];
    chromeMock.storage.local._raw.set('ega.settings', { contextMenuItems: items });
    const { container, onPatch } = renderLive({ contextMenuItems: items });
    const r = row(container, custom.id);
    await fireEvent.click(r.querySelector('[data-ega-cm-edit]') as HTMLElement);
    const del = r.querySelector<HTMLElement>('[data-ega-cm-delete]');
    expect(del?.getAttribute('aria-label')).toBe('Delete Explain');
    await fireEvent.click(del as HTMLElement);
    expect(written(onPatch).some((i) => i.id === custom.id)).toBe(false);
    await waitFor(() => expect(pushed.at(-1)?.message).toBe('Removed "Explain".'));
    expect(pushed.at(-1)?.duration).toBe(8000);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        row(container, second.id).querySelector('[data-ega-cm-edit]'),
      ),
    );
    pushed.at(-1)?.action?.onClick();
    await waitFor(() => expect(written(onPatch).some((i) => i.id === custom.id)).toBe(true));
  });

  it('Move down reorders inside the group, keeps focus on the pressed button and says where', async () => {
    const { container, onPatch } = renderLive();
    const down = row(container, 'ega-translate-selection').querySelector<HTMLElement>(
      '[data-ega-cm-down]',
    );
    await fireEvent.click(down as HTMLElement);
    const items = written(onPatch);
    expect(items.filter((i) => i.kind === 'task').map((i) => i.id)).toEqual([
      'ega-sidepanel-selection',
      'ega-translate-selection',
    ]);
    items.forEach((it, i) => expect(it.order).toBe(i));
    expect(items).toHaveLength(DEFAULT_CONTEXT_MENU_ITEMS.length);
    const moved = row(container, 'ega-translate-selection').querySelector<HTMLElement>(
      '[data-ega-cm-down]',
    );
    await waitFor(() => expect(document.activeElement).toBe(moved));
    // Now last in its group: the arrow stays focusable and says why it does nothing.
    expect(moved?.getAttribute('aria-disabled')).toBe('true');
    expect(moved?.getAttribute('aria-label')).toBe('Move Translate down, already last');
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Translate moved to position 2 of 2',
    );
  });

  it('the last row of a group cannot move down into the next group', async () => {
    const { container, onPatch } = renderLive();
    // Stored order puts the image rows right after this one; Chrome draws them in another menu.
    const down = row(container, 'ega-sidepanel-selection').querySelector<HTMLElement>(
      '[data-ega-cm-down]',
    );
    expect(down?.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(down as HTMLElement);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('arrow keys move inside a row toolbar and skip the arrow that cannot move', async () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const bar = row(container, 'ega-translate-selection').querySelector<HTMLElement>(
      '[role="toolbar"]',
    );
    const edit = bar?.querySelector<HTMLElement>('[data-ega-cm-edit]');
    if (!bar || !edit) throw new Error('toolbar missing');
    edit.focus();
    await fireEvent.keyDown(edit, { key: 'ArrowRight' });
    // First row: Move up cannot move, so the next stop after Edit wraps to Move down.
    await waitFor(() =>
      expect(document.activeElement).toBe(bar.querySelector('[data-ega-cm-down]')),
    );
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    await waitFor(() =>
      expect(document.activeElement).toBe(bar.querySelector('[data-ega-cm-down]')),
    );
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' });
    await waitFor(() => expect(document.activeElement).toBe(edit));
  });

  it('Reset restores the shipped menu with Undo and puts focus on the first checkbox', async () => {
    const edited = [...DEFAULT_CONTEXT_MENU_ITEMS, custom];
    const { container, onPatch } = renderLive({ contextMenuItems: edited });
    const reset = container.querySelector<HTMLElement>('[data-ega-section-reset]');
    if (!reset) throw new Error('reset hidden while modified');
    await fireEvent.click(reset);
    expect(written(onPatch)).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
    expect(onPatch.mock.calls[0]?.[0]).not.toHaveProperty('contextMenuLayout');
    expect(pushed.at(-1)?.message).toBe('Right-click menu reset.');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        row(container, 'ega-translate-selection').querySelector('[data-ega-cm-enabled]'),
      ),
    );
    pushed.at(-1)?.action?.onClick();
    expect(written(onPatch).map((i) => i.id)).toContain(custom.id);
  });

  it('a long group asks the user to hide what they rarely use', () => {
    const many = Array.from({ length: 12 }, (_, n) => ({
      ...custom,
      id: `ega-custom-txt-tt-${20 + n}`,
      order: 20 + n,
    }));
    const { container } = render(ContextMenuManager, {
      props: makeProps({ s: { contextMenuItems: [...DEFAULT_CONTEXT_MENU_ITEMS, ...many] } }),
    });
    expect(
      container.querySelector('[data-ega-cm-group="selection"] [data-ega-cm-long]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-cm-group="image"] [data-ega-cm-long]')).toBeNull();
  }, 20_000);
});

describe('ContextMenuManager — drag', () => {
  it('a drag inside a group reorders it and keeps a label renamed since the drag began', async () => {
    const onPatch = vi.fn<OnPatch>();
    const renamed = DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
      i.id === 'ega-translate-selection' ? { ...i, label: 'Renamed' } : { ...i },
    );
    const { container } = render(ContextMenuManager, {
      props: makeProps({ onPatch, s: { contextMenuItems: renamed } }),
    });
    const zone = container.querySelector('[data-ega-cm-group="selection"] ul');
    if (!zone) throw new Error('selection zone missing');
    // The zone keeps the list's own description; the drag library would replace it.
    expect(zone.getAttribute('aria-describedby')).toBe('cm-group-selection-desc');
    // svelte-dnd-action finalizes with ITS OWN row copies, captured before the rename.
    const stale = DEFAULT_CONTEXT_MENU_ITEMS.filter((i) => i.kind === 'task').map((i) => ({
      ...i,
    }));
    const dragged = [stale[1], stale[0]];
    await fireEvent(
      zone,
      new CustomEvent('finalize', {
        detail: { items: dragged, info: { source: 'pointer', trigger: 'droppedIntoZone', id: '' } },
      }),
    );
    const after = written(onPatch);
    expect(after.filter((i) => i.kind === 'task').map((i) => i.id)).toEqual([
      'ega-sidepanel-selection',
      'ega-translate-selection',
    ]);
    expect(after.find((i) => i.id === 'ega-translate-selection')?.label).toBe('Renamed');
    expect(after).toHaveLength(DEFAULT_CONTEXT_MENU_ITEMS.length);
  });
});
