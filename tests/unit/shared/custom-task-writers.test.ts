import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { getCustomTasks, getSettings, updateSettings, upsertCustomTask } from '@/shared/storage';
import { CUSTOM_TASKS_MAX } from '@/shared/storage/sanitise';
import {
  addCustomTask,
  deleteCustomTask,
  restoreCustomTask,
  restoreMenuItems,
  setTaskEnabled,
  setTaskInMenu,
  taskInMenu,
  updateCustomTask,
  type DeletedCustomTask,
} from '@/shared/tasks';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import { CONTEXT_MENU_ITEMS_MAX } from '@/shared/settings-schema';
import type { CustomTask } from '@/shared/settings-schema';
import { validateAgainstSlots } from '@/shared/slot-registry';

const input = {
  label: 'Tweet summary',
  system: 'Summarize as one tweet.',
  user: '{{text}}',
  output: 'plain' as const,
  pageContext: false,
  image: false,
  glossary: false,
};

function row(i: number): CustomTask {
  return { ...input, id: `c${i}`, label: `task ${i}`, createdAt: i };
}

beforeEach(() => {
  resetChromeMock();
});

describe('custom task rows', () => {
  it('editing one row keeps future fields on that row and its neighbors', async () => {
    const future = { answer: { v: 2 }, futureSwitch: true };
    await chrome.storage.local.set({
      [STORAGE_KEYS.customTasks]: [
        { ...row(1), ...future, effort: 'high' },
        { ...row(2), ...future },
      ],
    });
    await updateCustomTask('c1', { ...input, label: 'Renamed' });
    const rows = await getCustomTasks();
    expect(rows[0]).toMatchObject({ ...future, id: 'c1', label: 'Renamed' });
    expect(rows[0]).not.toHaveProperty('effort');
    expect(rows[1]).toEqual({ ...row(2), ...future });
  });
  it('add writes a row with a fresh id; update keeps the id and creation time', async () => {
    const added = await addCustomTask(input);
    expect((await getCustomTasks()).map((t) => t.id)).toEqual([added.id]);
    const updated = await updateCustomTask(added.id, { ...input, label: 'Haiku', output: 'card' });
    expect(updated).toMatchObject({ id: added.id, createdAt: added.createdAt, label: 'Haiku' });
    expect(await getCustomTasks()).toEqual([updated]);
  });

  it('refuses a row whose message has no {{text}}', async () => {
    await expect(addCustomTask({ ...input, user: 'no slot' })).rejects.toThrow('invalid-task');
    expect(await getCustomTasks()).toEqual([]);
  });

  it('refuses a new row once the list is full, but still updates one', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.customTasks]: Array.from({ length: CUSTOM_TASKS_MAX }, (_, i) => row(i)),
    });
    await expect(addCustomTask(input)).rejects.toThrow('cap-reached');
    await upsertCustomTask({ ...row(3), label: 'renamed' });
    const rows = await getCustomTasks();
    expect(rows).toHaveLength(CUSTOM_TASKS_MAX);
    expect(rows.find((t) => t.id === 'c3')?.label).toBe('renamed');
  });

  it('an edit of a task another window deleted fails and writes nothing', async () => {
    await expect(updateCustomTask('c-gone', input)).rejects.toThrow('task-gone');
    expect(await getCustomTasks()).toEqual([]);
  });

  it('delete removes the row, its menu items, and its on/off and default marks', async () => {
    const added = await addCustomTask(input);
    const item = {
      id: 'ega-custom-txt-tt-9',
      kind: 'task' as const,
      enabled: true,
      order: 9,
      label: 'Tweet it',
      task: added.id,
      surface: 'tooltip' as const,
    };
    await updateSettings({
      defaultTask: added.id,
      contextMenuItems: [...DEFAULT_CONTEXT_MENU_ITEMS, item],
    });
    await setTaskEnabled(added.id, false);
    const { settings: next } = await deleteCustomTask(added.id);
    expect(await getCustomTasks()).toEqual([]);
    expect(next.contextMenuItems.map((i) => i.id)).not.toContain(item.id);
    expect(next.disabledTasks).toEqual([]);
    expect(next.defaultTask).toBe('translate');
  });

  it('a crash between the two delete writes leaves nothing that runs the task', async () => {
    const added = await addCustomTask(input);
    await updateSettings({ defaultTask: added.id });
    await setTaskEnabled(added.id, false);
    // Only the row write lands.
    await chrome.storage.local.set({ [STORAGE_KEYS.customTasks]: [] });
    const s = await getSettings();
    expect(s.defaultTask).toBe('translate');
    expect(s.disabledTasks).toEqual([]);
  });
});

describe('slot check for a custom task', () => {
  it('needs {{text}} and warns on an unknown slot, but allows any known slot', () => {
    const ok = validateAgainstSlots({ system: '{{explainInstr}}', user: '{{text}}' }, 'c1');
    expect(ok.ok).toBe(true);
    expect(ok.warnings).toEqual([]);
    const bad = validateAgainstSlots({ system: '{{foo}}', user: 'none' }, 'c1');
    expect(bad.ok).toBe(false);
    expect(bad.warnings.map((w) => w.slot)).toEqual(['foo']);
  });
});

describe('custom task delete with Undo', () => {
  it('Undo puts back the row, its right-click items, its off mark and the default task exactly', async () => {
    const added = await addCustomTask(input);
    const other = await addCustomTask({ ...input, label: 'Other' });
    const item = {
      id: 'ega-custom-item',
      kind: 'task' as const,
      enabled: true,
      order: 99,
      label: '',
      task: added.id,
      surface: 'tooltip' as const,
    };
    await updateSettings({
      defaultTask: added.id,
      contextMenuItems: [...DEFAULT_CONTEXT_MENU_ITEMS, item],
    });
    await setTaskEnabled(added.id, false);
    const beforeSettings = await getSettings();
    const beforeRows = await getCustomTasks();

    const { deleted } = await deleteCustomTask(added.id);
    expect(deleted).not.toBeNull();
    await restoreCustomTask(deleted as DeletedCustomTask);

    expect(await getCustomTasks()).toEqual(beforeRows);
    const norm = (x: Awaited<ReturnType<typeof getSettings>>) => ({
      ...x,
      contextMenuItems: [...x.contextMenuItems].sort((p, q) => p.order - q.order),
    });
    expect(norm(await getSettings())).toEqual(norm(beforeSettings));
    expect((await getCustomTasks()).map((t) => t.id)).toEqual([added.id, other.id]);
  });
});

describe('custom task delete with Undo, as the default task', () => {
  it('Undo makes it the default task again', async () => {
    const added = await addCustomTask(input);
    await updateSettings({ defaultTask: added.id });
    const { settings, deleted } = await deleteCustomTask(added.id);
    expect(settings.defaultTask).toBe('translate');
    expect((await restoreCustomTask(deleted as DeletedCustomTask)).defaultTask).toBe(added.id);
  });
});

describe('a custom task in the right-click menu', () => {
  it('on adds one item that runs it at the end; off removes every such item and Undo restores them', async () => {
    const added = await addCustomTask(input);
    const before = await getSettings();
    expect(taskInMenu(before, added.id)).toBe(false);

    const { settings: on } = await setTaskInMenu(added.id, true);
    const mine = on.contextMenuItems.filter((i) => i.kind === 'task' && i.task === added.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.order).toBe(Math.max(...before.contextMenuItems.map((i) => i.order)) + 1);
    expect(taskInMenu(on, added.id)).toBe(true);
    // A second "on" adds nothing.
    expect((await setTaskInMenu(added.id, true)).settings.contextMenuItems).toHaveLength(
      on.contextMenuItems.length,
    );

    const { settings: off, removed } = await setTaskInMenu(added.id, false);
    expect(taskInMenu(off, added.id)).toBe(false);
    expect(removed).toEqual(mine);
    expect(taskInMenu(await restoreMenuItems(removed), added.id)).toBe(true);
  });
});

describe('a full right-click menu', () => {
  async function fillMenu(): Promise<void> {
    const cur = await getSettings();
    const extra = Array.from(
      { length: CONTEXT_MENU_ITEMS_MAX - cur.contextMenuItems.length },
      (_, i) => ({
        id: `filler-${i}`,
        kind: 'task' as const,
        enabled: true,
        order: 100 + i,
        label: `Item ${i}`,
        task: 'summarize' as const,
        surface: 'tooltip' as const,
      }),
    );
    await updateSettings({ contextMenuItems: [...cur.contextMenuItems, ...extra] });
  }

  it('refuses one more item instead of saving a list the reader cuts', async () => {
    const added = await addCustomTask(input);
    await fillMenu();
    await expect(setTaskInMenu(added.id, true)).rejects.toThrow('menu-full');
    const after = await getSettings();
    expect(after.contextMenuItems).toHaveLength(CONTEXT_MENU_ITEMS_MAX);
    expect(taskInMenu(after, added.id)).toBe(false);
  });

  it('refuses to put back items that no longer fit', async () => {
    const added = await addCustomTask(input);
    await setTaskInMenu(added.id, true);
    const { removed } = await setTaskInMenu(added.id, false);
    await fillMenu();
    await expect(restoreMenuItems(removed)).rejects.toThrow('menu-full');
    expect((await getSettings()).contextMenuItems).toHaveLength(CONTEXT_MENU_ITEMS_MAX);
  });
});
