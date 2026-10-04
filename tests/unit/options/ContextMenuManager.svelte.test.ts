// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import type { Settings } from '@/shared/types';
import type { ContextMenuItem, MenuLayout } from '@/shared/context-menu';

type OnPatch = ComponentProps<typeof ContextMenuManager>['onPatch'];

function makeProps(
  overrides: {
    s?: Partial<Settings>;
    onPatch?: Mock<OnPatch>;
  } = {},
): { s: Settings; onPatch: Mock<OnPatch> } {
  return {
    s: { ...DEFAULT_SETTINGS, ...overrides.s } as Settings,
    onPatch: overrides.onPatch ?? vi.fn<OnPatch>(),
  };
}

describe('ContextMenuManager', () => {
  it('renders one row per default item with [data-ega-cm-enabled] checkbox', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const rows = container.querySelectorAll('[data-ega-cm-row]');
    expect(rows.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length);
    for (const row of rows) {
      expect(row.querySelector('[data-ega-cm-enabled]')).not.toBeNull();
    }
  });

  it('renders a label input per row', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const inputs = container.querySelectorAll('[data-ega-cm-label]');
    expect(inputs.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length);
  });

  it('gives each label input a distinct accessible name, not one shared static label', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('[data-ega-cm-label]'));
    // No static aria-label that would override the per-row <label> + sr-only text.
    for (const input of inputs) {
      expect(input.getAttribute('aria-label')).toBeNull();
    }
    // The wrapping <label> carries a per-item name, so the names differ across rows.
    const names = inputs.map((input) => {
      const wrap = input.closest('label');
      return wrap?.querySelector('.ega-sr-only')?.textContent.trim() ?? '';
    });
    expect(new Set(names).size).toBe(inputs.length);
  });

  it('renders up/down reorder buttons per row', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const upBtns = container.querySelectorAll('[data-ega-cm-up]');
    const downBtns = container.querySelectorAll('[data-ega-cm-down]');
    expect(upBtns.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length);
    expect(downBtns.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length);
  });

  it('renders delete buttons, disabled for singletons', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const delBtns = container.querySelectorAll<HTMLButtonElement>('[data-ega-cm-delete]');
    expect(delBtns.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length);

    const singletonKinds = ['page-translate', 'pick-element', 'site-toggle'] as const;
    DEFAULT_CONTEXT_MENU_ITEMS.forEach((item, i) => {
      const btn = delBtns[i];
      if (singletonKinds.includes(item.kind as (typeof singletonKinds)[number])) {
        expect(btn?.disabled, `delete for ${item.kind} should be disabled`).toBe(true);
      } else {
        expect(btn?.disabled, `delete for ${item.kind} should be enabled`).toBe(false);
      }
    });
  });

  it('renders [data-ega-cm-add] button', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    expect(container.querySelector('[data-ega-cm-add]')).not.toBeNull();
  });

  it('renders [data-ega-cm-layout] RadioGroup with nested/flat options', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const group = container.querySelector('[data-ega-cm-layout]');
    expect(group).not.toBeNull();
    const nested = group?.querySelector('[data-value="nested"]');
    const flat = group?.querySelector('[data-value="flat"]');
    expect(nested).not.toBeNull();
    expect(flat).not.toBeNull();
  });

  it('toggling an item enable checkbox calls onPatch with mutated contextMenuItems', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    const firstCb = container.querySelector<HTMLInputElement>('[data-ega-cm-enabled]');
    if (!firstCb) throw new Error('[data-ega-cm-enabled] not found');
    await fireEvent.click(firstCb);
    expect(onPatch).toHaveBeenCalledOnce();
    const rawCall: unknown = onPatch.mock.calls[0]?.[0];
    const call = rawCall as Partial<Settings>;
    expect(Array.isArray(call.contextMenuItems)).toBe(true);
    const items = call.contextMenuItems as ContextMenuItem[];
    const firstItem = items[0];
    if (!firstItem) throw new Error('no first item in call');
    expect(firstItem.enabled).toBe(!DEFAULT_CONTEXT_MENU_ITEMS[0]?.enabled);
  });

  it('editing a label input calls onPatch with updated label once the debounce fires', async () => {
    vi.useFakeTimers();
    try {
      const onPatch = vi.fn<OnPatch>();
      const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
      const firstInput = container.querySelector<HTMLInputElement>('[data-ega-cm-label]');
      if (!firstInput) throw new Error('[data-ega-cm-label] not found');
      await fireEvent.input(firstInput, { target: { value: 'My custom label' } });
      vi.advanceTimersByTime(400);
      expect(onPatch).toHaveBeenCalledOnce();
      const rawCall: unknown = onPatch.mock.calls[0]?.[0];
      const call = rawCall as Partial<Settings>;
      const items = call.contextMenuItems as ContextMenuItem[];
      const firstItem = items[0];
      if (!firstItem) throw new Error('no first item');
      expect(firstItem.label).toBe('My custom label');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a drag-reorder after a rename keeps the new label', async () => {
    vi.useFakeTimers();
    try {
      const onPatch = vi.fn<OnPatch>();
      const items: ContextMenuItem[] = DEFAULT_CONTEXT_MENU_ITEMS.map((i) => ({ ...i }));
      const { container, rerender } = render(ContextMenuManager, {
        props: makeProps({ onPatch, s: { contextMenuItems: items } }),
      });
      const firstInput = container.querySelector<HTMLInputElement>('[data-ega-cm-label]');
      if (!firstInput) throw new Error('[data-ega-cm-label] not found');
      await fireEvent.input(firstInput, { target: { value: 'Renamed' } });
      vi.advanceTimersByTime(400);

      // The rename is committed: settings now hold the new label.
      const renamed = (onPatch.mock.calls[0]?.[0] as Partial<Settings>)
        .contextMenuItems as ContextMenuItem[];
      expect(renamed[0]?.label).toBe('Renamed');
      onPatch.mockClear();
      await rerender(makeProps({ onPatch, s: { contextMenuItems: renamed } }));

      // svelte-dnd-action finalizes with ITS OWN row copies, captured before the rename.
      const zone = container.querySelector('ul.cm-list');
      if (!zone) throw new Error('dnd zone not found');
      const stale = DEFAULT_CONTEXT_MENU_ITEMS.map((i) => ({ ...i }));
      const dragged = [stale[1], stale[0], ...stale.slice(2)].filter(Boolean);
      // The library's own finalize listener reads detail.info.source and throws without it.
      await fireEvent(
        zone,
        new CustomEvent('finalize', {
          detail: {
            items: dragged,
            info: { source: 'keyboard', trigger: 'droppedIntoZone', id: '' },
          },
        }),
      );

      const call = onPatch.mock.calls[0]?.[0] as Partial<Settings> | undefined;
      if (!call) throw new Error('drag did not write settings');
      const after = call.contextMenuItems as ContextMenuItem[];
      expect(after.map((i) => i.id)).toEqual(dragged.map((i) => i?.id));
      expect(after.find((i) => i.id === stale[0]?.id)?.label).toBe('Renamed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a burst of label keystrokes writes settings once, not once per keystroke', async () => {
    vi.useFakeTimers();
    try {
      const onPatch = vi.fn<OnPatch>();
      const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
      const firstInput = container.querySelector<HTMLInputElement>('[data-ega-cm-label]');
      if (!firstInput) throw new Error('[data-ega-cm-label] not found');
      for (const value of ['R', 'Re', 'Ren', 'Rena', 'Renam', 'Rename']) {
        await fireEvent.input(firstInput, { target: { value } });
        vi.advanceTimersByTime(50);
      }
      expect(onPatch).not.toHaveBeenCalled();
      vi.advanceTimersByTime(400);
      expect(onPatch).toHaveBeenCalledOnce();
      const call = onPatch.mock.calls[0]?.[0] as Partial<Settings>;
      const items = call.contextMenuItems as ContextMenuItem[];
      expect(items[0]?.label).toBe('Rename');
    } finally {
      vi.useRealTimers();
    }
  });

  it('blur flushes a pending label edit immediately', async () => {
    vi.useFakeTimers();
    try {
      const onPatch = vi.fn<OnPatch>();
      const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
      const firstInput = container.querySelector<HTMLInputElement>('[data-ega-cm-label]');
      if (!firstInput) throw new Error('[data-ega-cm-label] not found');
      await fireEvent.input(firstInput, { target: { value: 'Blurred' } });
      await fireEvent.blur(firstInput);
      expect(onPatch).toHaveBeenCalledOnce();
      const call = onPatch.mock.calls[0]?.[0] as Partial<Settings>;
      expect((call.contextMenuItems as ContextMenuItem[])[0]?.label).toBe('Blurred');
      // The debounce must not fire a second write after the blur flush.
      vi.advanceTimersByTime(400);
      expect(onPatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clicking another row while a label edit is pending keeps the typed label', async () => {
    vi.useFakeTimers();
    try {
      const onPatch = vi.fn<OnPatch>();
      const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
      const firstInput = container.querySelector<HTMLInputElement>('[data-ega-cm-label]');
      const checkboxes = container.querySelectorAll<HTMLInputElement>('[data-ega-cm-enabled]');
      const secondCb = checkboxes[1];
      if (!firstInput || !secondCb) throw new Error('row controls not found');
      await fireEvent.input(firstInput, { target: { value: 'Not yet saved' } });
      await fireEvent.click(secondCb);
      expect(onPatch).toHaveBeenCalledOnce();
      const call = onPatch.mock.calls[0]?.[0] as Partial<Settings>;
      const items = call.contextMenuItems as ContextMenuItem[];
      expect(items[0]?.label).toBe('Not yet saved');
      expect(items[1]?.enabled).toBe(!DEFAULT_CONTEXT_MENU_ITEMS[1]?.enabled);
      vi.advanceTimersByTime(400);
      expect(onPatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clicking Add appends a new task item via nextMenuItemId', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    const addBtn = container.querySelector<HTMLButtonElement>('[data-ega-cm-add]');
    if (!addBtn) throw new Error('[data-ega-cm-add] not found');
    await fireEvent.click(addBtn);
    expect(onPatch).toHaveBeenCalledOnce();
    const rawCall: unknown = onPatch.mock.calls[0]?.[0];
    const call = rawCall as Partial<Settings>;
    const callItems = call.contextMenuItems as ContextMenuItem[];
    expect(callItems.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length + 1);
    const newItem = callItems[callItems.length - 1];
    if (!newItem) throw new Error('no new item');
    expect(newItem.kind).toBe('task');
    expect(newItem.id).not.toBeUndefined();
    const existingIds = DEFAULT_CONTEXT_MENU_ITEMS.map((i) => i.id);
    expect(existingIds.includes(newItem.id)).toBe(false);
  });

  it('changing layout radio fires onPatch with new contextMenuLayout', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    const flatOpt = container.querySelector<HTMLElement>(
      '[data-ega-cm-layout] [role="radio"][data-value="flat"]',
    );
    if (!flatOpt) throw new Error('[data-value="flat"] not found');
    await fireEvent.click(flatOpt);
    expect(onPatch).toHaveBeenCalledOnce();
    const rawCall: unknown = onPatch.mock.calls[0]?.[0];
    const call = rawCall as Partial<Settings>;
    expect(call.contextMenuLayout).toBe<MenuLayout>('flat');
  });

  it('clicking delete on a task item calls onPatch with that item removed', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    // First non-singleton item is task or image-task; find the first enabled delete button
    const allDelBtns = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-ega-cm-delete]'),
    );
    const enabledDel = allDelBtns.find((b) => !b.disabled);
    if (!enabledDel) throw new Error('no enabled delete button');
    await fireEvent.click(enabledDel);
    expect(onPatch).toHaveBeenCalledOnce();
    const rawCall: unknown = onPatch.mock.calls[0]?.[0];
    const call = rawCall as Partial<Settings>;
    const callItems = call.contextMenuItems as ContextMenuItem[];
    expect(callItems.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length - 1);
  });

  it('clicking Move Up on second item moves it to index 0 with normalized order', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    const upBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-ega-cm-up]'));
    const secondUp = upBtns[1];
    if (!secondUp) throw new Error('second [data-ega-cm-up] not found');
    const originallySecondId = DEFAULT_CONTEXT_MENU_ITEMS[1]?.id;
    await fireEvent.click(secondUp);
    expect(onPatch).toHaveBeenCalledOnce();
    const rawCall: unknown = onPatch.mock.calls[0]?.[0];
    const call = rawCall as Partial<Settings>;
    const callItems = call.contextMenuItems as ContextMenuItem[];
    expect(callItems[0]?.id).toBe(originallySecondId);
    // order is renormalized to array index on every reorder.
    callItems.forEach((it, i) => expect(it.order).toBe(i));
  });

  it('renders a drag handle per row', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const handles = container.querySelectorAll('[data-ega-cm-handle]');
    expect(handles.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length);
  });

  it('renders a context chip per row labeling where the item appears', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const chips = container.querySelectorAll('[data-ega-cm-context]');
    expect(chips.length).toBe(DEFAULT_CONTEXT_MENU_ITEMS.length);
    // The selection task → "Text selection"; image task → "Image"; page → "Page".
    const texts = Array.from(chips).map((c) => c.textContent.trim());
    expect(texts).toContain('Text selection');
    expect(texts).toContain('Image');
    expect(texts).toContain('Page');
  });

  it('Add image button appends an image-task item', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    const addImg = container.querySelector<HTMLButtonElement>('[data-ega-cm-add-image]');
    if (!addImg) throw new Error('[data-ega-cm-add-image] not found');
    await fireEvent.click(addImg);
    expect(onPatch).toHaveBeenCalledOnce();
    const call = onPatch.mock.calls[0]?.[0] as Partial<Settings>;
    const callItems = call.contextMenuItems as ContextMenuItem[];
    const newItem = callItems[callItems.length - 1];
    expect(newItem?.kind).toBe('image-task');
  });

  it('reset is hidden at defaults and appears once a label is edited', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container, rerender } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    expect(container.querySelector('[data-ega-section-reset]')).toBeNull();
    // Simulate a non-default state by passing edited items.
    const edited = DEFAULT_CONTEXT_MENU_ITEMS.map((it, i) =>
      i === 0 ? { ...it, label: 'changed' } : it,
    );
    await rerender(makeProps({ onPatch, s: { contextMenuItems: edited } }));
    expect(container.querySelector('[data-ega-section-reset]')).not.toBeNull();
  });

  it('reset writes DEFAULT items and nested layout', async () => {
    const onPatch = vi.fn<OnPatch>();
    const edited = DEFAULT_CONTEXT_MENU_ITEMS.map((it, i) =>
      i === 0 ? { ...it, label: 'changed' } : it,
    );
    const { container } = render(ContextMenuManager, {
      props: makeProps({ onPatch, s: { contextMenuItems: edited, contextMenuLayout: 'flat' } }),
    });
    const resetBtn = container.querySelector<HTMLButtonElement>('[data-ega-section-reset]');
    if (!resetBtn) throw new Error('reset button not found');
    await fireEvent.click(resetBtn);
    expect(onPatch).toHaveBeenCalledOnce();
    const call = onPatch.mock.calls[0]?.[0] as Partial<Settings>;
    expect(call.contextMenuLayout).toBe('nested');
    const callItems = call.contextMenuItems as ContextMenuItem[];
    expect(callItems).toEqual(DEFAULT_CONTEXT_MENU_ITEMS);
  });

  it('renders a target-language control only on text-task rows', () => {
    const { container } = render(ContextMenuManager, { props: makeProps() });
    const langWraps = container.querySelectorAll('[data-ega-cm-targetlang]');
    const taskCount = DEFAULT_CONTEXT_MENU_ITEMS.filter((i) => i.kind === 'task').length;
    expect(langWraps.length).toBe(taskCount);
  });

  it('selecting a specific target language sets targetLang on that item', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    const wrap = container.querySelector<HTMLElement>('[data-ega-cm-targetlang]');
    if (!wrap) throw new Error('[data-ega-cm-targetlang] not found');
    const select = wrap.querySelector('select');
    if (!select) throw new Error('language select not found');
    // Pick a concrete language (first non-auto option).
    const opt = Array.from(select.options).find((o) => o.value !== 'auto');
    if (!opt) throw new Error('no concrete language option');
    select.value = opt.value;
    await fireEvent.change(select);
    expect(onPatch).toHaveBeenCalled();
    const lastCall = onPatch.mock.calls.at(-1)?.[0] as Partial<Settings>;
    const callItems = lastCall.contextMenuItems as ContextMenuItem[];
    const firstTask = callItems.find((i) => i.kind === 'task') as
      Extract<ContextMenuItem, { kind: 'task' }> | undefined;
    expect(firstTask?.targetLang).toBe(opt.value);
  });
});
