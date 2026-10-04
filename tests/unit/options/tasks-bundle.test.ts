import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import { importAs } from '@tests/_helpers/import-bundle';
import { parseImportBundle } from '@/options/import-bundle';
import { getCustomTasks, getSettings, updateSettings } from '@/shared/storage';
import { exportAll, exportTasks } from '@/shared/storage/backup';
import { addCustomTask, updateTask } from '@/shared/tasks';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

const row = {
  id: '6f1c1f9e-2b7a-4c1e-9a55-0d3f5e1b2c44',
  label: 'Tweet summary',
  system: 'Summarize as one tweet.',
  user: '{{text}}',
  output: 'plain' as const,
  pageContext: false,
  image: false,
  glossary: false,
  createdAt: 1,
};

beforeEach(() => {
  resetChromeMock();
});

describe('tasks bundle', () => {
  it('round-trips rows, edits and on/off', async () => {
    const added = await addCustomTask({ ...row, output: 'card' });
    await updateTask('grammar', { effort: 'low' });
    await updateSettings({ disabledTasks: ['ask', added.id] });
    const file = JSON.parse(JSON.stringify(await exportTasks()));
    resetChromeMock();
    const plan = await importAs(file, 'tasks');
    expect(plan.skipped).toBe(0);
    expect((await getCustomTasks()).map((t) => t.id)).toEqual([added.id]);
    const s = await getSettings();
    expect(s.taskOverrides).toEqual({ grammar: { effort: 'low' } });
    expect(s.disabledTasks).toEqual(['ask', added.id]);
  });

  it('skips and counts a bad row, an id a built-in has, an unknown edit and a bad on/off id', async () => {
    const plan = await importAs(
      {
        egaTasks: {
          v: 1,
          customTasks: [row, { ...row, id: 'summarize' }, { id: 'x' }],
          taskOverrides: {
            grammar: { effort: 'low', futureField: 1 },
            'c-gone': { effort: 'low' },
          },
          disabledTasks: ['translate', 'c-gone', 'ask'],
          extraKey: 'ignored',
        },
      },
      'tasks',
    );
    expect(plan.customTasks.map((t) => t.id)).toEqual([row.id]);
    expect(plan.taskOverrides).toEqual({ grammar: { effort: 'low' } });
    expect(plan.disabledTasks).toEqual(['ask']);
    expect(plan.skipped).toBe(5);
  });

  it('a row may not take the id a closed rule scope points at', async () => {
    const plan = await importAs(
      { egaTasks: { v: 1, customTasks: [row, { ...row, id: 'unknown-task' }] } },
      'tasks',
    );
    expect(plan.customTasks.map((t) => t.id)).toEqual([row.id]);
    expect(plan.skipped).toBe(1);
  });

  it('a wrong-typed edit map or on/off list is skipped and the rows still import', async () => {
    const plan = await importAs(
      {
        egaTasks: {
          v: 1,
          exportedAt: 0,
          customTasks: [row],
          taskOverrides: null,
          disabledTasks: 'ask',
        },
      },
      'tasks',
    );
    expect(plan.customTasks.map((t) => t.id)).toEqual([row.id]);
    expect(plan.taskOverrides).toEqual({});
    expect(plan.disabledTasks).toEqual([]);
    expect(plan.skipped).toBe(2);
  });

  describe('the Translate prompt, which the Tasks tab shows as a Translate edit', () => {
    const custom = { system: 'Mine.', user: 'Translate {{text}}' };

    it('travels in the file and comes back on import', async () => {
      await updateSettings({
        advanced: { ...(await getSettings()).advanced, promptTemplate: custom },
      });
      const file = JSON.parse(JSON.stringify(await exportTasks()));
      expect(file.egaTasks.translatePrompt).toMatchObject(custom);
      resetChromeMock();
      const plan = await importAs(file, 'tasks');
      expect(plan.skipped).toBe(0);
      expect((await getSettings()).advanced.promptTemplate).toEqual(custom);
    });

    it('a file with the shipped prompt resets an edited one, as the confirm says', async () => {
      const file = JSON.parse(JSON.stringify(await exportTasks()));
      expect(file.egaTasks.translatePrompt).toBeNull();
      await updateSettings({
        advanced: { ...(await getSettings()).advanced, promptTemplate: custom },
      });
      await importAs(file, 'tasks');
      expect((await getSettings()).advanced.promptTemplate).toEqual(
        DEFAULT_SETTINGS.advanced.promptTemplate,
      );
    });

    it('a version 1 file, or a damaged prompt, leaves the current prompt alone', async () => {
      await updateSettings({
        advanced: { ...(await getSettings()).advanced, promptTemplate: custom },
      });
      await importAs({ egaTasks: { v: 1, customTasks: [] } }, 'tasks');
      expect((await getSettings()).advanced.promptTemplate).toEqual(custom);
      const plan = await importAs(
        { egaTasks: { v: 2, customTasks: [], translatePrompt: { system: 1 } } },
        'tasks',
      );
      expect(plan.skipped).toBe(1);
      expect((await getSettings()).advanced.promptTemplate).toEqual(custom);
    });
  });

  it('a newer tasks file asks for an update; an old task-presets file is refused', async () => {
    await expect(parseImportBundle({ egaTasks: { v: 3, customTasks: [] } })).rejects.toThrow(
      'This file is from a newer version of Ega. Update Ega to import it.',
    );
    await expect(parseImportBundle({ egaTaskPresets: {} })).rejects.toThrow('old task-presets');
  });
});

describe('full backup with task data', () => {
  it('is version 1 with no task data and version 2 with it', async () => {
    expect((await exportAll()).version).toBe(1);
    await updateTask('grammar', { effort: 'low' });
    expect((await exportAll()).version).toBe(2);
  });

  it('round-trips custom tasks, and a default task naming one survives', async () => {
    const added = await addCustomTask(row);
    await updateSettings({ defaultTask: added.id });
    const file = JSON.parse(JSON.stringify(await exportAll()));
    expect(file.version).toBe(2);
    resetChromeMock();
    await importAs(file, 'settings');
    expect((await getCustomTasks()).map((t) => t.id)).toEqual([added.id]);
    expect((await getSettings()).defaultTask).toBe(added.id);
  });

  it('an older backup without custom tasks keeps the current rows', async () => {
    const file = JSON.parse(JSON.stringify(await exportAll()));
    delete file.customTasks;
    const added = await addCustomTask(row);
    await importAs(file, 'settings');
    expect((await getCustomTasks()).map((t) => t.id)).toEqual([added.id]);
    const raw = await chrome.storage.local.get(STORAGE_KEYS.customTasks);
    expect(raw[STORAGE_KEYS.customTasks]).toHaveLength(1);
  });
});

describe('tasks file snippets and banner state', () => {
  it('a prompt that keeps @@refs travels with the snippets it needs', async () => {
    const big = 'x'.repeat(8000);
    const cur = await getSettings();
    // One write: a snippet no prompt refers to is written out and dropped on read.
    await updateSettings({
      advanced: { ...cur.advanced, snippets: { big } },
      taskOverrides: { summarize: { user: '@@big@@ @@big@@ @@big@@ {{text}}' } },
    });
    expect((await getSettings()).taskOverrides.summarize?.user).toContain('@@big@@');
    const file = JSON.parse(JSON.stringify(await exportTasks()));
    expect(file.egaTasks.snippets).toEqual({ big });
    resetChromeMock();
    await importAs(file, 'tasks');
    const after = await getSettings();
    expect(after.advanced.snippets).toEqual({ big });
    expect(after.taskOverrides.summarize?.user).toContain('@@big@@');
  });

  it('importing a Translate prompt clears the banner acknowledgement', async () => {
    const cur = await getSettings();
    await updateSettings({ advanced: { ...cur.advanced, templateVersionAcknowledged: 99 } });
    await importAs(
      {
        egaTasks: {
          v: 2,
          customTasks: [],
          translatePrompt: { system: 'Old.', user: '{{text}}', templateVersion: 1 },
        },
      },
      'tasks',
    );
    const after = await getSettings();
    expect(after.advanced.templateVersion).toBe(1);
    expect(after.advanced.templateVersionAcknowledged).toBeUndefined();
  });
});
