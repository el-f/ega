import { beforeEach, describe, expect, it } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import { parseImportBundle } from '@/options/import-bundle';
import { mergeTaskImport } from '@/shared/storage/task-import';
import { exportTasks } from '@/shared/storage/backup';
import { getCustomTasks, getSettings, updateSettings } from '@/shared/storage';
import { addCustomTask, patchCustomTask, updateTask } from '@/shared/tasks';
import { STORAGE_KEYS } from '@/shared/constants';

const input = {
  label: 'My task',
  system: 'Be concise.',
  user: '{{text}}',
  output: 'plain' as const,
  pageContext: false,
  image: false,
  glossary: false,
};
async function plan(customTasks: unknown[], extra: Record<string, unknown> = {}) {
  const parsed = await parseImportBundle({ egaTasks: { v: 2, customTasks, ...extra } });
  if (parsed.kind !== 'tasks') throw new Error('not tasks');
  return parsed;
}
beforeEach(() => {
  resetChromeMock();
});
describe('task import merge and Undo', () => {
  it('round trips custom image menu entries with their task and answer fields', async () => {
    const task = await addCustomTask({
      ...input,
      image: true,
      answer: { v: 1, preset: 'answer-only' },
    });
    await updateSettings({
      contextMenuItems: [
        {
          id: 'custom-image',
          kind: 'image-task',
          task: task.id,
          surface: 'tooltip',
          order: 100,
          label: 'Describe image',
          enabled: true,
        },
      ],
    });
    const bundle = await exportTasks();
    expect(bundle.egaTasks.contextMenuItems).toMatchObject([{ kind: 'image-task', task: task.id }]);
    const parsed = await parseImportBundle(JSON.parse(JSON.stringify(bundle)));
    if (parsed.kind !== 'tasks') throw new Error('not tasks');
    expect(parsed.customTasks).toMatchObject([
      { id: task.id, image: true, answer: { v: 1, preset: 'answer-only' } },
    ]);
    await mergeTaskImport(parsed);
    expect((await getSettings()).contextMenuItems).toMatchObject([
      { kind: 'image-task', task: task.id },
    ]);
  });
  it('adds and updates by ID, keeps unrelated tasks and edits, and restores only the import', async () => {
    const kept = await addCustomTask({ ...input, label: 'Keep me' });
    const existing = await addCustomTask(input);
    await updateTask('grammar', { effort: 'high' });
    await updateSettings({ disabledTasks: [kept.id] });
    const before = await getSettings();
    const fresh = { ...existing, id: 'new-task', label: 'New task' };
    const result = await mergeTaskImport(
      await plan([{ ...existing, label: 'Imported' }, fresh], {
        taskOverrides: { ask: { effort: 'high' } },
        disabledTasks: ['ask'],
        contextMenuItems: [
          {
            id: 'new-task-menu',
            kind: 'task',
            task: fresh.id,
            surface: 'tooltip',
            order: 100,
            label: '',
            enabled: true,
          },
        ],
      }),
    );
    expect(result).toMatchObject({ added: 1, updated: 1, skipped: 0 });
    expect((await getCustomTasks()).map((row) => row.label)).toEqual([
      'Keep me',
      'Imported',
      'New task',
    ]);
    expect((await getSettings()).taskOverrides).toEqual({
      grammar: { effort: 'high' },
      ask: { effort: 'high' },
    });
    expect((await getSettings()).disabledTasks).toEqual([kept.id, 'ask']);
    expect((await exportTasks()).egaTasks.contextMenuItems).toMatchObject([
      { id: 'new-task-menu', task: fresh.id },
    ]);
    await result.undo();
    expect(await getCustomTasks()).toEqual([kept, existing]);
    expect(await getSettings()).toEqual(before);
    await result.undo();
    expect(await getCustomTasks()).toEqual([kept, existing]);
  });
  it('Undo keeps task and setting edits made after the import', async () => {
    const existing = await addCustomTask(input);
    const result = await mergeTaskImport(
      await plan([{ ...existing, label: 'Imported' }], {
        taskOverrides: { grammar: { effort: 'low' } },
      }),
    );
    await patchCustomTask(existing.id, { label: 'Edited after import' });
    await updateTask('grammar', { effort: 'high' });
    await updateSettings({ shortcut: 'Ctrl+Shift+Y' });
    const unrelated = await addCustomTask({ ...input, label: 'Added later' });
    await result.undo();
    expect((await getCustomTasks()).map((row) => row.label)).toEqual([
      'Edited after import',
      unrelated.label,
    ]);
    expect((await getSettings()).taskOverrides.grammar?.effort).toBe('high');
    expect((await getSettings()).shortcut).toBe('Ctrl+Shift+Y');
  });
  it('counts over-limit rows and menu items while allowing updates at the cap', async () => {
    const base = { ...input, createdAt: 1 };
    const rows = Array.from({ length: 50 }, (_, i) => ({ ...base, id: `task-${i}` }));
    await chrome.storage.local.set({ [STORAGE_KEYS.customTasks]: rows });
    const menus = Array.from({ length: 50 }, (_, i) => ({
      id: `menu-${i}`,
      kind: 'task' as const,
      task: 'task-0',
      surface: 'tooltip' as const,
      order: i,
      label: '',
      enabled: true,
    }));
    await updateSettings({ contextMenuItems: menus });
    const result = await mergeTaskImport(
      await plan(
        [
          { ...rows[0], label: 'Updated at cap' },
          { ...base, id: 'overflow' },
        ],
        { contextMenuItems: [{ ...menus[0], id: 'extra-menu' }] },
      ),
    );
    expect(result).toMatchObject({ added: 0, updated: 1, skipped: 2 });
    expect(await getCustomTasks()).toHaveLength(50);
    expect((await getCustomTasks())[0]?.label).toBe('Updated at cap');
    expect((await getSettings()).contextMenuItems).toHaveLength(50);
    await result.undo();
    expect(await getCustomTasks()).toEqual(rows);
  });
});
