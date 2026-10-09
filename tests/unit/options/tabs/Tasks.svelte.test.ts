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
  it('lists the seven built-ins; Translate stays on, focusable, with "Always on" as the reason', async () => {
    const { container } = await mount();
    expect(container.querySelectorAll('[data-ega-task-item]')).toHaveLength(7);
    const translate = container.querySelector<HTMLInputElement>(
      '[data-ega-task-toggle="translate"]',
    );
    if (!translate) throw new Error('no translate toggle');
    expect(translate.disabled).toBe(false);
    expect(translate.getAttribute('aria-disabled')).toBe('true');
    const reason = translate
      .getAttribute('aria-describedby')
      ?.split(' ')
      .map((id) => document.getElementById(id)?.textContent.trim());
    expect(reason).toContain('Always on');
    await fireEvent.click(translate);
    expect(translate.checked).toBe(true);
    expect((await getSettings()).disabledTasks).toEqual([]);
    expect(row(container, 'summarize').textContent).not.toMatch(/built-in/i);
  });

  it('a toggle writes disabledTasks; the box says off, with no extra Off word', async () => {
    const { container } = await mount();
    const box = container.querySelector<HTMLInputElement>('[data-ega-task-toggle="summarize"]');
    if (!box) throw new Error('no toggle');
    await fireEvent.click(box);
    await waitFor(async () => expect((await getSettings()).disabledTasks).toEqual(['summarize']));
    await waitFor(() => expect(box.checked).toBe(false));
    expect(row(container, 'summarize').textContent).not.toContain('Off');
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
      const el = document.querySelector<HTMLButtonElement>('[data-ega-section-reset]');
      if (!el) throw new Error('dialog not open');
      return el;
    });
    await fireEvent.click(reset);
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize).toBeUndefined(),
    );
    // Closing after a reset with no Undo repeats the Undo in a toast.
    await fireEvent.click(document.querySelector('[data-ega-dialog-done]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-ega-task-dialog]')).toBeNull());
    expect(push.mock.calls.at(-1)?.[0].message).toBe('Summarize is back to built-in');
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
  it('Effort "Default" removes the task effort and keeps the other fields', async () => {
    const { container } = await mount(() =>
      updateTask('summarize', { effort: 'high', glossary: true }),
    );
    const edit = container.querySelector<HTMLElement>('[data-ega-task-edit="summarize"]');
    if (!edit) throw new Error('no edit button');
    await fireEvent.click(edit);
    const high = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-ega-task-effort] [data-ega-effort-value="high"]',
      );
      if (!el) throw new Error('dialog not open');
      return el;
    });
    expect(high.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(
      document.querySelector('[data-ega-task-effort] [data-ega-effort-value=""]') as HTMLElement,
    );
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
    expect(document.querySelector('[data-ega-prompt-editor]')).toBeNull();
    expect(document.querySelector('[data-ega-task-prompt-note]')?.textContent).toContain(
      'Translate prompt',
    );
  });

  it('says so when page context is off for every task', async () => {
    const note = 'Page context is off on the Answers tab';
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

  it('with none yet, the only New task is the empty state button', async () => {
    const { container } = await mount();
    expect(container.querySelector('[data-ega-custom-task-new]')).toBeNull();
    expect(container.textContent).toContain('No tasks of your own yet');
    expect(container.textContent).toContain('Write a prompt once and run it on any text');
  });

  it('at the cap, New task stays focusable, says why, and opens nothing', async () => {
    const { CUSTOM_TASKS_MAX } = await import('@/shared/storage/sanitise');
    const rows = Array.from({ length: CUSTOM_TASKS_MAX }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      label: `Task ${i}`,
      system: '',
      user: '{{text}}',
      output: 'plain',
      pageContext: false,
      image: false,
      glossary: false,
      createdAt: i + 1,
    }));
    await chrome.storage.local.set({ 'ega.customTasks': rows });
    const { container } = await mount();
    const add = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-ega-custom-task-new]');
      if (!el) throw new Error('no header button yet');
      return el;
    });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(add.querySelector('[data-action-icon="add"]')).not.toBeNull();
    expect(
      document.getElementById(add.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain(`You have the most tasks Ega keeps (${CUSTOM_TASKS_MAX})`);
    await fireEvent.click(add);
    expect(document.querySelector('[data-ega-custom-task-dialog]')).toBeNull();
  });

  it('New task saves itself once it has a name and a valid message, and the list shows it', async () => {
    const { container } = await mount();
    const add = container.querySelector<HTMLElement>('[data-ega-empty-state] button');
    if (!add) throw new Error('no new button');
    await fireEvent.click(add);
    await waitFor(() => {
      if (!document.querySelector('[data-ega-custom-task-dialog]')) throw new Error('no dialog');
    });
    await fill('[data-ega-template-user] textarea', 'no slot');
    await fill('[data-ega-custom-task-name]', 'Tweet summary');
    const { getCustomTasks } = await import('@/shared/storage');
    // The footer names why nothing was created; the save ran and refused.
    await waitFor(() =>
      expect(document.querySelector('[data-ega-dialog-status]')?.textContent).toContain(
        'Not saved',
      ),
    );
    expect(await getCustomTasks()).toEqual([]);
    await fill('[data-ega-template-user] textarea', 'Shorten: {{text}}');
    await waitFor(async () =>
      expect((await getCustomTasks()).map((t) => [t.label, t.user])).toEqual([
        ['Tweet summary', 'Shorten: {{text}}'],
      ]),
    );
    await waitFor(() => expect(container.textContent).toContain('Tweet summary'));
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
    const { PLAIN_CONTRACT } = await import('@/shared/answer/formats-v1');
    const previewTab = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-ega-prompt-tab="preview"]');
      if (!el) throw new Error('no dialog');
      return el;
    });
    await fireEvent.click(previewTab);
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
  it('an edit says so, keeps the dialog open, and writes nothing', async () => {
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
    const glossary = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('[data-ega-custom-task-glossary]');
      if (!el) throw new Error('no dialog');
      return el;
    });
    await chrome.storage.local.set({ 'ega.customTasks': [] });
    await fireEvent.click(glossary);
    await waitFor(() =>
      expect(document.body.textContent).toContain('This task was deleted in another window'),
    );
    expect(document.querySelector('[data-ega-custom-task-dialog]')).not.toBeNull();
    const { getCustomTasks } = await import('@/shared/storage');
    expect(await getCustomTasks()).toEqual([]);
  });
});

describe('Tasks tab — focus after the custom task dialog', () => {
  const task = (label: string) => ({
    label,
    system: '',
    user: '{{text}}',
    output: 'plain' as const,
    pageContext: false,
    image: false,
    glossary: false,
  });

  async function openEdit(container: HTMLElement, id: string): Promise<void> {
    const edit = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(`[data-ega-task-edit="${id}"]`);
      if (!el) throw new Error('no row');
      return el;
    });
    edit.focus();
    await fireEvent.click(edit);
    await waitFor(() => {
      if (!document.querySelector('[data-ega-custom-task-delete]')) throw new Error('no dialog');
    });
  }

  it('Delete task moves focus to the row that took its place, and Undo to the restored row', async () => {
    const { addCustomTask } = await import('@/shared/tasks');
    const first = await addCustomTask(task('Haiku'));
    const second = await addCustomTask(task('Tweet'));
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { container } = await mount();
    await openEdit(container, first.id);
    await fireEvent.click(document.querySelector('[data-ega-custom-task-delete]') as HTMLElement);
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-ega-task-edit')).toBe(second.id),
    );
    push.mock.calls[0]?.[0].action?.onClick();
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-ega-task-edit')).toBe(first.id),
    );
  });

  it('deleting the only task focuses New task in the empty state', async () => {
    const { addCustomTask } = await import('@/shared/tasks');
    const only = await addCustomTask(task('Haiku'));
    vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { container } = await mount();
    await openEdit(container, only.id);
    await fireEvent.click(document.querySelector('[data-ega-custom-task-delete]') as HTMLElement);
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('[data-ega-empty-state] button')),
    );
  });

  it('the first task saved from the empty state hands focus to New task in the card header', async () => {
    const { container } = await mount();
    const cta = container.querySelector<HTMLElement>('[data-ega-empty-state] button');
    if (!cta) throw new Error('no new button');
    cta.focus();
    await fireEvent.click(cta);
    const name = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>(
        'input[data-ega-custom-task-name], [data-ega-custom-task-name] input',
      );
      if (!el) throw new Error('no dialog');
      return el;
    });
    await fireEvent.input(name, { target: { value: 'Tweet summary' } });
    await fireEvent.click(document.querySelector('[data-ega-dialog-done]') as HTMLElement);
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('[data-ega-custom-task-new]')),
    );
  });
});

// Spec 3.0, R1-01: a write that does not land puts the stored value back on screen.
describe('Tasks tab — a toggle that does not land', () => {
  it('turns the box back on when turning a task off was not saved', async () => {
    const { container } = await mount();
    const box = container.querySelector<HTMLInputElement>('[data-ega-task-toggle="summarize"]');
    if (!box) throw new Error('no summarize toggle');
    expect(box.checked).toBe(true);
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(true));
    expect((await getSettings()).disabledTasks).toEqual([]);
  });
});

describe('Tasks tab — a default task write that does not land', () => {
  it('shows the stored default task again', async () => {
    const { getByLabelText } = await mount();
    const select = getByLabelText('Default task') as HTMLSelectElement;
    expect(select.value).toBe('translate');
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.change(select, { target: { value: 'summarize' } });
    await waitFor(() => expect(select.value).toBe('translate'));
    expect((await getSettings()).defaultTask).toBe('translate');
  });
});

describe('Tasks tab — a task of your own whose toggle does not land', () => {
  it('turns its box back on', async () => {
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
    const box = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(`[data-ega-task-toggle="${added.id}"]`);
      if (!el) throw new Error('no row');
      return el;
    });
    expect(box.checked).toBe(true);
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(true));
    expect((await getSettings()).disabledTasks).toEqual([]);
  });
});
