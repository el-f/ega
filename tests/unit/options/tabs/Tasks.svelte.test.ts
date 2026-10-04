// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '@tests/mocks/chrome';
import Tasks from '@/options/tabs/Tasks.svelte';
import { getSettings } from '@/shared/storage';
import { updateTask } from '@/shared/tasks';
import { toastStore } from '@/shared/components/toastStore';
import type { Settings } from '@/shared/types';

beforeEach(() => {
  resetChromeMock();
  vi.restoreAllMocks();
});

async function mount(seed?: (s: Settings) => Promise<Settings>) {
  let s: Settings = await getSettings();
  if (seed) s = await seed(s);
  const utils = render(Tasks, {
    props: { s, onSetSettings: (next: Settings) => void utils.rerender({ s: next }) },
  });
  return utils;
}

const row = (c: HTMLElement, t: string): HTMLElement => {
  const el = c.querySelector<HTMLElement>(`[data-ega-task-item="${t}"]`);
  if (!el) throw new Error(`no row ${t}`);
  return el;
};

describe('Tasks tab', () => {
  it('lists the seven built-ins; Translate cannot be turned off', async () => {
    const { container } = await mount();
    expect(container.querySelectorAll('[data-ega-task-item]')).toHaveLength(7);
    const translate = container.querySelector<HTMLInputElement>(
      '[data-ega-task-toggle="translate"]',
    );
    expect(translate?.disabled).toBe(true);
    expect(row(container, 'translate').textContent).toContain('always on');
  });

  it('a toggle writes disabledTasks and the row shows Off', async () => {
    const { container } = await mount();
    const box = container.querySelector<HTMLInputElement>('[data-ega-task-toggle="summarize"]');
    if (!box) throw new Error('no toggle');
    expect(row(container, 'summarize').textContent).not.toContain('Off');
    await fireEvent.click(box);
    await waitFor(async () => expect((await getSettings()).disabledTasks).toEqual(['summarize']));
    await waitFor(() => expect(row(container, 'summarize').textContent).toContain('Off'));
  });

  it('an edited task shows Edited; an off default task shows as Translate', async () => {
    const { container } = await mount(async () => {
      await updateTask('reword', { effort: 'high' });
      const { setTaskEnabled } = await import('@/shared/tasks');
      const { updateSettings } = await import('@/shared/storage');
      await updateSettings({ defaultTask: 'grammar' });
      return setTaskEnabled('grammar', false);
    });
    expect(row(container, 'reword').textContent).toContain('Edited');
    expect(row(container, 'summarize').textContent).not.toContain('Edited');
    expect(row(container, 'summarize').textContent).not.toContain('Off');
    const select = container.querySelector<HTMLSelectElement>(
      '[data-ega-setting="defaults.defaultTask"] select',
    );
    expect(select?.value).toBe('translate');
    expect([...(select?.options ?? [])].map((o) => o.value)).not.toContain('grammar');
  });

  it('Edit opens the dialog; Reset drops the edit and Undo puts it back', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const { container } = await mount(() => updateTask('summarize', { glossary: true }));
    const edit = container.querySelector<HTMLElement>('[data-ega-task-edit="summarize"]');
    if (!edit) throw new Error('no edit button');
    await fireEvent.click(edit);
    const reset = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>('[data-ega-task-reset]');
      if (!el) throw new Error('dialog not open');
      return el;
    });
    await fireEvent.click(reset);
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize).toBeUndefined(),
    );
    // The dialog closes on Reset, so Undo runs with no dialog open.
    await waitFor(() => expect(document.querySelector('[data-ega-task-dialog]')).toBeNull());
    const undo = push.mock.calls.at(-1)?.[0].action;
    expect(undo?.label).toBe('Undo');
    undo?.onClick();
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize).toEqual({ glossary: true }),
    );
  });

  it('the dialog switches write the task edit', async () => {
    const { container } = await mount();
    const edit = container.querySelector<HTMLElement>('[data-ega-task-edit="translate"]');
    if (!edit) throw new Error('no edit button');
    await fireEvent.click(edit);
    const pageContext = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('[data-ega-task-page-context]');
      if (!el) throw new Error('dialog not open');
      return el;
    });
    expect(pageContext.checked).toBe(true);
    await fireEvent.click(pageContext);
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.translate).toEqual({ pageContext: false }),
    );
  });
});

describe('Tasks tab — more', () => {
  it('"Same as global" removes the task effort and keeps the other fields', async () => {
    const { container } = await mount(() =>
      updateTask('summarize', { effort: 'high', glossary: true }),
    );
    const edit = container.querySelector<HTMLElement>('[data-ega-task-edit="summarize"]');
    if (!edit) throw new Error('no edit button');
    await fireEvent.click(edit);
    const select = await waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>('[data-ega-task-effort] select');
      if (!el) throw new Error('dialog not open');
      return el;
    });
    expect(select.value).toBe('high');
    await fireEvent.change(select, { target: { value: '' } });
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize).toEqual({ glossary: true }),
    );
  });

  it('a customized Translate prompt marks Translate as Edited', async () => {
    const { updateSettings } = await import('@/shared/storage');
    const { DEFAULT_TEMPLATE } = await import('@/shared/prompts');
    const { container } = await mount(() =>
      updateSettings({
        advanced: {
          promptTemplate: { ...DEFAULT_TEMPLATE, system: `${DEFAULT_TEMPLATE.system} Mine.` },
        } as Settings['advanced'],
      }),
    );
    expect(row(container, 'translate').textContent).toContain('Edited');
  });
});

describe('Tasks dialog — prompt link and page-context note', () => {
  async function openDialog(container: HTMLElement, t: string): Promise<void> {
    const edit = container.querySelector<HTMLElement>(`[data-ega-task-edit="${t}"]`);
    if (!edit) throw new Error('no edit button');
    await fireEvent.click(edit);
    await waitFor(() => {
      if (!document.querySelector('[data-ega-task-dialog]')) throw new Error('dialog not open');
    });
  }

  it.each([
    ['summarize', 'Summarize'],
    ['translate', 'You translate'],
  ])('the %s dialog edits its prompt in place', async (t, text) => {
    const { container } = await mount();
    await openDialog(container, t);
    const sys = document.querySelector<HTMLTextAreaElement>('[data-ega-template-system] textarea');
    if (!sys) throw new Error('no prompt editor');
    expect(sys.value).toContain(text);
  });

  it('explain has no prompt of its own and says which one it uses', async () => {
    const { container } = await mount();
    await openDialog(container, 'explain');
    expect(document.querySelector('[data-ega-template-editor]')).toBeNull();
    expect(document.querySelector('[data-ega-task-prompt-note]')?.textContent).toContain(
      'Translate prompt',
    );
  });

  it('says so when page context is off for every task', async () => {
    const note = 'Page context is off for every task on the Translate tab.';
    const on = await mount();
    await openDialog(on.container, 'summarize');
    expect(document.body.textContent).not.toContain(note);
    on.unmount();
    const { updateSettings } = await import('@/shared/storage');
    const off = await mount(() => updateSettings({ contextEnabled: false }));
    await openDialog(off.container, 'summarize');
    expect(document.body.textContent).toContain(note);
  });
});

describe('Tasks tab — your own tasks', () => {
  async function fill(sel: string, value: string): Promise<void> {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `${sel} , ${sel} textarea, ${sel} input`,
    );
    if (!el) throw new Error(`missing ${sel}`);
    await fireEvent.input(el, { target: { value } });
  }

  it('New task saves a row, lists it, and Save stays off without {{text}}', async () => {
    const { container } = await mount();
    const add = container.querySelector<HTMLElement>('[data-ega-custom-task-new]');
    if (!add) throw new Error('no new button');
    await fireEvent.click(add);
    await waitFor(() => {
      if (!document.querySelector('[data-ega-custom-task-dialog]')) throw new Error('no dialog');
    });
    await fill('[data-ega-custom-task-name]', 'Tweet summary');
    await fill('[data-ega-custom-task-user]', 'no slot');
    const save = document.querySelector<HTMLButtonElement>('[data-ega-custom-task-save]');
    await waitFor(() => expect(save?.disabled).toBe(true));
    await fill('[data-ega-custom-task-user]', 'Shorten: {{text}}');
    await waitFor(() => expect(save?.disabled).toBe(false));
    if (!save) throw new Error('no save');
    await fireEvent.click(save);
    const { getCustomTasks } = await import('@/shared/storage');
    await waitFor(async () =>
      expect((await getCustomTasks()).map((t) => [t.label, t.user])).toEqual([
        ['Tweet summary', 'Shorten: {{text}}'],
      ]),
    );
    await waitFor(() => expect(container.textContent).toContain('Tweet summary'));
  });

  it('a variable chip inserts at the caret of the field focused last', async () => {
    const { container } = await mount();
    const add = container.querySelector<HTMLElement>('[data-ega-custom-task-new]');
    if (!add) throw new Error('no new button');
    await fireEvent.click(add);
    const sys = await waitFor(() => {
      const el = document.querySelector<HTMLTextAreaElement>('[data-ega-custom-task-system]');
      if (!el) throw new Error('no instructions field');
      return el;
    });
    await fill('[data-ega-custom-task-system]', 'Reply in .');
    sys.setSelectionRange(9, 9);
    await fireEvent.focusIn(sys);
    const chip = document.querySelector<HTMLElement>('[data-ega-slot-chip="targetLangLabel"]');
    if (!chip) throw new Error('no targetLangLabel chip');
    await fireEvent.click(chip);
    await waitFor(() => expect(sys.value).toBe('Reply in {{targetLangLabel}}.'));
    const user = document.querySelector<HTMLTextAreaElement>('[data-ega-custom-task-user]');
    expect(user?.value).toBe('TEXT:\n"""\n{{text}}\n"""');
  });

  it('the text chip always inserts into the Message, where {{text}} is required', async () => {
    const { container } = await mount();
    const add = container.querySelector<HTMLElement>('[data-ega-custom-task-new]');
    if (!add) throw new Error('no new button');
    await fireEvent.click(add);
    const sys = await waitFor(() => {
      const el = document.querySelector<HTMLTextAreaElement>('[data-ega-custom-task-system]');
      if (!el) throw new Error('no instructions field');
      return el;
    });
    await fill('[data-ega-custom-task-system]', 'Be brief.');
    await fill('[data-ega-custom-task-user]', 'Shorten: ');
    await fireEvent.focusIn(sys);
    const chip = document.querySelector<HTMLElement>('[data-ega-slot-chip="text"]');
    if (!chip) throw new Error('no text chip');
    await fireEvent.click(chip);
    const user = document.querySelector<HTMLTextAreaElement>('[data-ega-custom-task-user]');
    await waitFor(() => expect(user?.value).toContain('{{text}}'));
    expect(sys.value).toBe('Be brief.');
  });

  it('the preview shows the custom prompt and its contract line', async () => {
    const { addCustomTask } = await import('@/shared/tasks');
    const added = await addCustomTask({
      label: 'Haiku',
      system: 'Write a haiku.',
      user: '{{text}}',
      output: 'plain',
      pageContext: false,
      image: false,
      glossary: false,
    });
    const { container } = await mount();
    await waitFor(() => {
      if (!container.querySelector(`[data-ega-task-edit="${added.id}"]`)) throw new Error('no row');
    });
    const edit = container.querySelector<HTMLElement>(`[data-ega-task-edit="${added.id}"]`);
    if (!edit) throw new Error('no edit');
    await fireEvent.click(edit);
    const { PLAIN_CONTRACT } = await import('@/shared/prompts');
    await waitFor(() => {
      const sys =
        document.querySelector('[data-ega-custom-task-dialog] [data-ega-preview-system]')
          ?.textContent ?? '';
      expect(sys).toContain('Write a haiku.');
      expect(sys).toContain(PLAIN_CONTRACT);
    });
  });
});

describe('Tasks tab — a task deleted in another window', () => {
  it('Save says so, keeps the editor open, and writes nothing', async () => {
    const { addCustomTask } = await import('@/shared/tasks');
    const added = await addCustomTask({
      label: 'Haiku',
      system: '',
      user: '{{text}}',
      output: 'plain',
      pageContext: false,
      image: false,
      glossary: false,
    });
    const { container } = await mount();
    await waitFor(() => {
      if (!container.querySelector(`[data-ega-task-edit="${added.id}"]`)) throw new Error('no row');
    });
    container.querySelector<HTMLElement>(`[data-ega-task-edit="${added.id}"]`)?.click();
    const save = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>('[data-ega-custom-task-save]');
      if (!el) throw new Error('no dialog');
      return el;
    });
    await chrome.storage.local.set({ 'ega.customTasks': [] });
    await fireEvent.click(save);
    await waitFor(() =>
      expect(document.body.textContent).toContain('This task was deleted in another window.'),
    );
    expect(document.querySelector('[data-ega-custom-task-dialog]')).not.toBeNull();
    const { getCustomTasks } = await import('@/shared/storage');
    expect(await getCustomTasks()).toEqual([]);
  });

  describe('rules scoped to your own task', () => {
    const legal = {
      label: 'Legal',
      system: '',
      user: '{{text}}',
      output: 'plain' as const,
      pageContext: false,
      image: false,
      glossary: false,
    };
    const scopedRules = (id: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        body: `Rule ${i}: ${'cite the clause number every time. '.repeat(14)}`.slice(0, 480),
        category: 'always' as const,
        scope: { tasks: [id] },
        source: 'manual' as const,
        addedAt: '2026-10-02T00:00:00.000Z',
        enabled: true,
      }));

    it('count toward the over-budget warning', async () => {
      const { addCustomTask } = await import('@/shared/tasks');
      const { updateSettings } = await import('@/shared/storage');
      const added = await addCustomTask(legal);
      const { container } = await mount(async (cur) =>
        updateSettings({ advanced: { ...cur.advanced, rules: scopedRules(added.id, 20) } }),
      );
      await waitFor(() =>
        expect(container.querySelector('[data-ega-rules-budget-warn]')).not.toBeNull(),
      );
    });

    it('show the task name the tab has now, not the one it had when it opened', async () => {
      const { addCustomTask, updateCustomTask } = await import('@/shared/tasks');
      const { updateSettings } = await import('@/shared/storage');
      const added = await addCustomTask(legal);
      const { container } = await mount(async (cur) =>
        updateSettings({ advanced: { ...cur.advanced, rules: scopedRules(added.id, 1) } }),
      );
      const scope = () => container.querySelector('[data-ega-rule-pill-scope]')?.textContent ?? '';
      await waitFor(() => expect(scope()).toContain('Legal'));
      await updateCustomTask(added.id, { ...legal, label: 'Contracts' });
      await waitFor(() => expect(scope()).toContain('Contracts'));
    });
  });
});
