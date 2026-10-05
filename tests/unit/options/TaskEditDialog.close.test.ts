// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '@tests/mocks/chrome';
import TaskEditDialog from '@/options/components/TaskEditDialog.svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { parseSettings } from '@/shared/settings-schema';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn() }));
const confirm = vi.mocked(confirmDialog);

function open(onClose = vi.fn()) {
  render(TaskEditDialog, {
    props: { s: parseSettings({}), task: 'summarize', onClose, onSaved: vi.fn() },
  });
  return onClose;
}

function done(): HTMLButtonElement {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (x) => x.textContent.trim() === 'Done',
  );
  if (!b) throw new Error('no Done button');
  return b;
}

beforeEach(() => {
  resetChromeMock();
  confirm.mockReset();
});

describe('closing the task dialog', () => {
  it('closes at once when the prompt has no unsaved change', async () => {
    const onClose = open();
    await fireEvent.click(done());
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before throwing away an unsaved prompt, and stays open on No', async () => {
    const onClose = open();
    const sys = document.querySelector<HTMLTextAreaElement>('[data-ega-template-system] textarea');
    if (!sys) throw new Error('no prompt editor');
    await fireEvent.input(sys, { target: { value: 'My draft.' } });

    confirm.mockResolvedValueOnce(false);
    await fireEvent.click(done());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockResolvedValueOnce(true);
    await fireEvent.click(done());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('Escape with an unsaved prompt', () => {
  it('keeps the dialog and the draft when the user cancels', async () => {
    const onClose = open();
    const sys = document.querySelector<HTMLTextAreaElement>('[data-ega-template-system] textarea');
    if (!sys) throw new Error('no prompt editor');
    await fireEvent.input(sys, { target: { value: 'My draft.' } });

    confirm.mockResolvedValueOnce(false);
    await fireEvent.keyDown(sys, { key: 'Escape' });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    const after = document.querySelector<HTMLTextAreaElement>(
      '[data-ega-template-system] textarea',
    );
    expect(after?.value).toBe('My draft.');
  });
});

describe('what saves on its own', () => {
  it('says Effort and inputs save on change, then confirms a change landed', async () => {
    open();
    const status = document.querySelector('.task-edit-autosave');
    expect(status?.textContent).toMatch(/save as soon as you change them/);
    const glossary = document.querySelector<HTMLInputElement>('[data-ega-task-glossary]');
    if (!glossary) throw new Error('no glossary checkbox');
    await fireEvent.click(glossary);
    await waitFor(() => expect(status?.textContent.trim()).toBe('Saved.'));
  });

  it('names why Reset is off when the task has no edits', () => {
    open();
    const reset = document.querySelector<HTMLButtonElement>('[data-ega-task-reset]');
    expect(reset?.disabled).toBe(true);
    expect(document.body.textContent).toContain('Nothing to reset: this task has no edits.');
  });
});
