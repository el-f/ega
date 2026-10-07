// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '@tests/mocks/chrome';
import CustomTaskDialog from '@/options/components/CustomTaskDialog.svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { toastStore } from '@/shared/components/toastStore';
import { parseSettings } from '@/shared/settings-schema';
import { addCustomTask } from '@/shared/tasks';
import { getCustomTasks, getSettings } from '@/shared/storage';
import { TEXT_SAVE_DELAY_MS } from '@/options/components/dialog-saver.svelte';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn() }));
const confirm = vi.mocked(confirmDialog);

function open(onClose = vi.fn(), props: Record<string, unknown> = {}) {
  const onSaved = vi.fn();
  render(CustomTaskDialog, { props: { s: parseSettings({}), onClose, onSaved, ...props } });
  return { onClose, onSaved };
}

function nameInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(
    'input[data-ega-custom-task-name], [data-ega-custom-task-name] input',
  );
  if (!el) throw new Error('no name input');
  return el;
}

function field(half: 'system' | 'user'): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>(`[data-ega-template-${half}] textarea`);
  if (!el) throw new Error(`no ${half} field`);
  return el;
}

const done = (): HTMLElement => document.querySelector('[data-ega-dialog-done]') as HTMLElement;
const status = (): string =>
  document.querySelector('[data-ega-dialog-status]')?.textContent.trim() ?? '';

const input = {
  label: 'Polite reply',
  system: 'Turn it into a polite reply.',
  user: '{{text}}',
  output: 'plain' as const,
  pageContext: false,
  image: false,
  glossary: false,
};

beforeEach(() => {
  resetChromeMock();
  confirm.mockReset();
});

describe('a new custom task', () => {
  it('says it is not saved until it has a name, then saves itself once it does', async () => {
    open();
    expect(status()).toBe('Not saved yet: add a name');
    await fireEvent.input(nameInput(), { target: { value: 'Polite reply' } });
    await waitFor(async () => expect(await getCustomTasks()).toHaveLength(1), {
      timeout: TEXT_SAVE_DELAY_MS + 1000,
    });
    expect((await getCustomTasks())[0]?.label).toBe('Polite reply');
    await waitFor(() => expect(status()).toBe('Saved'));
  });

  it('later edits update the same row, never a second one', async () => {
    open();
    await fireEvent.input(nameInput(), { target: { value: 'Polite reply' } });
    await fireEvent.input(field('system'), { target: { value: 'Be polite.' } });
    await fireEvent.click(done());
    await waitFor(async () => expect((await getCustomTasks())[0]?.system).toBe('Be polite.'));
    expect(await getCustomTasks()).toHaveLength(1);
  });

  it('closes at once when nothing was typed', async () => {
    const { onClose } = open();
    await fireEvent.click(done());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a draft that was never saved asks Discard this task?, and keeps the draft on Keep editing', async () => {
    const { onClose } = open();
    await fireEvent.input(field('system'), { target: { value: 'Half a prompt' } });

    confirm.mockResolvedValueOnce(false);
    await fireEvent.keyDown(field('system'), { key: 'Escape' });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'Discard this task?',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(field('system').value).toBe('Half a prompt');

    confirm.mockResolvedValueOnce(true);
    await fireEvent.click(done());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await getCustomTasks()).toEqual([]);
  });
});

describe('an existing custom task', () => {
  it('Delete task removes it at once, closes, and the toast Undo brings it back exactly', async () => {
    const row = await addCustomTask(input);
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { onClose } = open(vi.fn(), { row });
    await fireEvent.click(document.querySelector('[data-ega-custom-task-delete]') as HTMLElement);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await getCustomTasks()).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    const toast = push.mock.calls[0]?.[0];
    expect(toast?.message).toBe('Deleted "Polite reply"');
    toast?.action?.onClick();
    await waitFor(async () => expect(await getCustomTasks()).toEqual([row]));
    push.mockRestore();
  });

  it('Show in right-click menu adds one item that runs the task, and off takes it away with Undo', async () => {
    const row = await addCustomTask(input);
    open(vi.fn(), { row });
    const box = document.querySelector('[data-ega-custom-task-menu]') as HTMLInputElement;
    expect(box.checked).toBe(false);
    await fireEvent.click(box);
    const runs = async (): Promise<number> =>
      (await getSettings()).contextMenuItems.filter((i) => i.kind === 'task' && i.task === row.id)
        .length;
    await waitFor(async () => expect(await runs()).toBe(1));
    await fireEvent.click(box);
    await waitFor(async () => expect(await runs()).toBe(0));
    expect(status()).toContain('Removed from the right-click menu');
    await fireEvent.click(document.querySelector('[data-ega-dialog-undo]') as HTMLElement);
    await waitFor(async () => expect(await runs()).toBe(1));
  });

  it('says so inline when another window deleted the task', async () => {
    const row = await addCustomTask(input);
    open(vi.fn(), { row });
    const { deleteCustomTaskRow } = await import('@/shared/storage');
    await deleteCustomTaskRow(row.id);
    await fireEvent.click(document.querySelector('[data-ega-custom-task-glossary]') as HTMLElement);
    await waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'This task was deleted in another window',
      ),
    );
    await waitFor(() => expect(status()).toContain('Not saved: it was deleted in another window'));
  });
});
