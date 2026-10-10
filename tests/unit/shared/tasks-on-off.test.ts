import { describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { getSettings, updateSettings } from '@/shared/storage';
import {
  replaceTaskEdit,
  resetTask,
  restoreTask,
  setTaskEnabled,
  updateTask,
} from '@/shared/tasks';
import { DEFAULT_PROMPT_TEMPLATE } from '@/shared/settings-schema';
import { materializeTasks } from '@/shared/task-view';
import { ALL_TASKS, runnableDefaultTask } from '@/shared/task-prompts';
import { buildRegistry } from '@/shared/command-registry';
import { installContextMenus } from '@/background/contextMenu';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';

beforeEach(() => {
  resetChromeMock();
});

describe('setTaskEnabled', () => {
  it('turns a task off once and on again', async () => {
    await setTaskEnabled('summarize', false);
    await setTaskEnabled('summarize', false);
    expect((await getSettings()).disabledTasks).toEqual(['summarize']);
    await setTaskEnabled('summarize', true);
    expect((await getSettings()).disabledTasks).toEqual([]);
  });

  it('refuses to turn Translate off', async () => {
    await expect(setTaskEnabled('translate', false)).rejects.toThrow('Translate is always on.');
    expect((await getSettings()).disabledTasks).toEqual([]);
  });

  it('turning the default task off and on again keeps it the default', async () => {
    await chromeMock.storage.local.set({ 'ega.settings': { defaultTask: 'reword' } });
    const off = await setTaskEnabled('reword', false);
    expect(off.defaultTask).toBe('reword');
    expect(runnableDefaultTask(off)).toBe('translate');
    const on = await setTaskEnabled('reword', true);
    expect(runnableDefaultTask(on)).toBe('reword');
  });

  it('materializeTasks keeps Translate even when a hand-edited file turns it off', async () => {
    await chromeMock.storage.local.set({
      'ega.settings': { disabledTasks: ['translate', 'ask'] },
    });
    expect(
      materializeTasks(await getSettings(), [], { enabledOnly: true }).map((v) => v.id),
    ).toEqual(ALL_TASKS.filter((t) => t !== 'ask'));
  });
});

describe('resetTask and replaceTaskEdit', () => {
  it('reset drops the whole edit and hands it back for an undo', async () => {
    await updateTask('summarize', { effort: 'high', glossary: true });
    const { settings, removed } = await resetTask('summarize');
    expect(settings.taskOverrides.summarize).toBeUndefined();
    expect(removed).toEqual({ edit: { effort: 'high', glossary: true } });
    const back = await replaceTaskEdit('summarize', removed.edit ?? {});
    expect(back.taskOverrides.summarize).toEqual({ effort: 'high', glossary: true });
  });

  it('a transform removes one field and keeps the rest', async () => {
    await updateTask('reword', { effort: 'low', glossary: true });
    const next = await replaceTaskEdit('reword', (cur) => {
      const { effort: _e, ...rest } = cur ?? {};
      void _e;
      return rest;
    });
    expect(next.taskOverrides.reword).toEqual({ glossary: true });
  });
});

describe('an off task leaves the palette and the right-click menu', () => {
  it('the palette offers only the tasks it is given', () => {
    const cmds = buildRegistry({
      onOpenOptions: () => {},
      onSwapTheme: () => {},
      onSetBubbleMode: () => {},
      onSetTask: () => {},
      currentTheme: 'system',
      tasks: [
        { id: 'translate', label: 'Translate' },
        { id: 'reword', label: 'Reword' },
      ],
    });
    expect(cmds.filter((c) => c.id.startsWith('task.')).map((c) => c.id)).toEqual([
      'task.translate',
      'task.reword',
    ]);
  });

  it('installContextMenus skips text and image items whose task is off', async () => {
    const created = (): string[] =>
      (chromeMock.contextMenus.create as Mock).mock.calls.map(([p]) => (p as { id: string }).id);
    await installContextMenus();
    expect(created()).toContain('ega-explain-image');
    (chromeMock.contextMenus.create as Mock).mockClear();

    await chromeMock.storage.local.set({ 'ega.settings': { disabledTasks: ['explain'] } });
    await installContextMenus();
    const ids = created();
    const explainIds = DEFAULT_CONTEXT_MENU_ITEMS.filter(
      (i) => (i.kind === 'task' || i.kind === 'image-task') && i.task === 'explain',
    ).map((i) => i.id);
    expect(explainIds.length).toBeGreaterThan(0);
    for (const id of explainIds) expect(ids).not.toContain(id);
    expect(ids.length).toBeGreaterThan(1);
  });
});

describe('installContextMenus with custom items', () => {
  const created = (): Array<{ id: string; title?: string }> =>
    (chromeMock.contextMenus.create as Mock).mock.calls.map(
      ([p]) => p as { id: string; title?: string },
    );

  it('drops a custom text item whose task is off and keeps the rest', async () => {
    const summarizeItem = {
      id: 'ega-custom-txt-tt-9',
      kind: 'task',
      enabled: true,
      order: 9,
      label: 'Summarize selection',
      task: 'summarize',
      surface: 'tooltip',
    };
    await chromeMock.storage.local.set({
      'ega.settings': {
        contextMenuItems: [...DEFAULT_CONTEXT_MENU_ITEMS, summarizeItem],
        disabledTasks: ['summarize'],
      },
    });
    await installContextMenus();
    const ids = created().map((c) => c.id);
    expect(ids).not.toContain('ega-custom-txt-tt-9');
    expect(ids).toContain('ega-translate-selection');
  });

  it('mints a re-encoded id against the full list, as the click handler does', async () => {
    const items = [
      {
        id: 'ega-explain-image',
        kind: 'image-task',
        enabled: true,
        order: 0,
        label: 'Explain image',
        task: 'explain',
        surface: 'sidepanel',
      },
      {
        id: 'ega-translate-selection',
        kind: 'task',
        enabled: true,
        order: 1,
        label: 'Moved',
        task: 'translate',
        surface: 'sidepanel',
      },
    ] as const;
    await chromeMock.storage.local.set({
      'ega.settings': { contextMenuItems: items, disabledTasks: ['explain'] },
    });
    await installContextMenus();
    const { withEncodedMenuIds } = await import('@/shared/context-menu-ids');
    const s = await getSettings();
    const expected = withEncodedMenuIds(s.contextMenuItems).find((i) => i.label === 'Moved')?.id;
    expect(expected).toBeDefined();
    expect(created().find((c) => c.title === 'Moved')?.id).toBe(expected);
  });
});

describe('installContextMenus and custom task ids', () => {
  it('keeps an item for an existing custom task and drops one for a deleted task', async () => {
    const item = (id: string, task: string, order: number) => ({
      id,
      kind: 'task',
      enabled: true,
      order,
      label: id,
      task,
      surface: 'tooltip',
    });
    await chromeMock.storage.local.set({
      'ega.customTasks': [
        {
          id: 'c-live',
          label: 'Live',
          system: '',
          user: '{{text}}',
          output: 'plain',
          pageContext: false,
          image: false,
          glossary: false,
          createdAt: 1,
        },
      ],
      'ega.settings': {
        contextMenuItems: [
          item('ega-custom-txt-tt-1', 'c-live', 0),
          item('ega-custom-txt-tt-2', 'c-gone', 1),
        ],
      },
    });
    await installContextMenus();
    const ids = (chromeMock.contextMenus.create as Mock).mock.calls.map(
      ([p]) => (p as { id: string }).id,
    );
    expect(ids).toContain('ega-custom-txt-tt-1');
    expect(ids).not.toContain('ega-custom-txt-tt-2');
  });
});

describe('installContextMenus and an off custom task', () => {
  it('leaves out an item whose custom task is off', async () => {
    await chromeMock.storage.local.set({
      'ega.customTasks': [
        {
          id: 'c-off',
          label: 'Off',
          system: '',
          user: '{{text}}',
          output: 'plain',
          pageContext: false,
          image: false,
          glossary: false,
          createdAt: 1,
        },
      ],
      'ega.settings': {
        disabledTasks: ['c-off'],
        contextMenuItems: [
          {
            id: 'ega-custom-txt-tt-3',
            kind: 'task',
            enabled: true,
            order: 0,
            label: 'x',
            task: 'c-off',
            surface: 'tooltip',
          },
          ...DEFAULT_CONTEXT_MENU_ITEMS,
        ],
      },
    });
    await installContextMenus();
    const ids = (chromeMock.contextMenus.create as Mock).mock.calls.map(
      ([p]) => (p as { id: string }).id,
    );
    expect(ids).not.toContain('ega-custom-txt-tt-3');
    expect(ids).toContain('ega-translate-selection');
  });
});

describe('resetting Translate', () => {
  const mine = { system: 'My own translate prompt.', user: '{{text}}' };

  it('also resets the Translate prompt, and undo puts both back in one write', async () => {
    await updateSettings({ advanced: { promptTemplate: mine } as never });
    await updateTask('translate', { effort: 'high' });
    const { settings, removed } = await resetTask('translate');
    expect(settings.advanced.promptTemplate).toEqual(DEFAULT_PROMPT_TEMPLATE);
    expect(settings.taskOverrides.translate).toBeUndefined();
    expect(removed).toEqual({ edit: { effort: 'high' }, prompt: { template: mine, version: 9 } });
    const back = await restoreTask('translate', removed);
    expect(back.advanced.promptTemplate).toEqual(mine);
    expect(back.taskOverrides.translate).toEqual({ effort: 'high' });
  });

  it('leaves the prompt out of the undo when it was not edited', async () => {
    const { removed } = await resetTask('translate');
    expect(removed).toEqual({ edit: undefined });
  });

  it('never touches the Translate prompt when another task resets', async () => {
    await updateSettings({ advanced: { promptTemplate: mine } as never });
    const { settings } = await resetTask('summarize');
    expect(settings.advanced.promptTemplate).toEqual(mine);
  });
});

describe('undo of a Translate reset keeps the template version', () => {
  it('puts back the old version, so the update banner still shows', async () => {
    const mine = { system: 'Old custom prompt.', user: '{{text}}' };
    await updateSettings({ advanced: { promptTemplate: mine, templateVersion: 3 } as never });
    const { removed } = await resetTask('translate');
    const back = await restoreTask('translate', removed);
    expect(back.advanced.promptTemplate).toEqual(mine);
    expect(back.advanced.templateVersion).toBe(3);
  });
});
