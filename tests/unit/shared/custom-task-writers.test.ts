import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { getCustomTasks, getSettings, updateSettings, upsertCustomTask } from '@/shared/storage';
import { CUSTOM_TASKS_MAX } from '@/shared/storage/sanitise';
import { addCustomTask, deleteCustomTask, setTaskEnabled, updateCustomTask } from '@/shared/tasks';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
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
    const next = await deleteCustomTask(added.id);
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
