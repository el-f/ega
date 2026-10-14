import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCustomTasks, getSettings, updateSettings } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';

afterEach(() => {
  vi.restoreAllMocks();
});

const ROW = {
  id: '6f1c1f9e-2b7a-4c1e-9a55-0d3f5e1b2c44',
  label: 'Tweet',
  system: '',
  user: '{{text}}',
  output: 'plain',
  pageContext: false,
  image: false,
  glossary: false,
  createdAt: 1,
};

describe('custom task storage', () => {
  it('reads a stored value that is not a list as no tasks, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await chrome.storage.local.set({ [STORAGE_KEYS.customTasks]: { broken: true } });
    expect(await getCustomTasks()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(STORAGE_KEYS.customTasks));
  });

  it('keeps task references while the stored list is unreadable, through a later save', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await chrome.storage.local.set({
      [STORAGE_KEYS.customTasks]: { broken: true },
      [STORAGE_KEYS.settings]: { defaultTask: ROW.id, disabledTasks: [ROW.id, 'translate'] },
    });
    const read = await getSettings();
    expect(read.defaultTask).toBe(ROW.id);
    expect(read.disabledTasks).toEqual([ROW.id]);
    await updateSettings({ theme: 'dark' });
    const stored = (await chrome.storage.local.get(STORAGE_KEYS.settings))[
      STORAGE_KEYS.settings
    ] as Record<string, unknown>;
    expect(stored['defaultTask']).toBe(ROW.id);
    expect(stored['disabledTasks']).toEqual([ROW.id]);
  });

  it('keeps a default task that names a stored custom task, and resets one that names nothing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await chrome.storage.local.set({
      [STORAGE_KEYS.customTasks]: [ROW],
      [STORAGE_KEYS.settings]: { defaultTask: ROW.id },
    });
    expect((await getSettings()).defaultTask).toBe(ROW.id);
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: { defaultTask: 'gone-task' } });
    expect((await getSettings()).defaultTask).toBe('translate');
  });

  it('keeps a default task that is turned off through an unrelated save', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: { defaultTask: 'summarize', disabledTasks: ['summarize'] },
    });
    await updateSettings({ theme: 'dark' });
    const s = await getSettings();
    expect(s.defaultTask).toBe('summarize');
    expect(s.disabledTasks).toEqual(['summarize']);
  });
});
