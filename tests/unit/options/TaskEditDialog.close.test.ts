// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '@tests/mocks/chrome';
import TaskEditDialog from '@/options/components/TaskEditDialog.svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { parseSettings } from '@/shared/settings-schema';
import { getSettings } from '@/shared/storage';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn() }));
const confirm = vi.mocked(confirmDialog);

function open(onClose = vi.fn()) {
  render(TaskEditDialog, {
    props: { s: parseSettings({}), task: 'summarize', onClose, onSaved: vi.fn() },
  });
  return onClose;
}

function done(): HTMLButtonElement {
  const b = document.querySelector<HTMLButtonElement>('[data-ega-dialog-done]');
  if (!b) throw new Error('no Done button');
  return b;
}

function field(half: 'system' | 'user'): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>(`[data-ega-template-${half}] textarea`);
  if (!el) throw new Error('no prompt editor');
  return el;
}

beforeEach(() => {
  resetChromeMock();
  confirm.mockReset();
});

describe('closing the task dialog', () => {
  it('closes at once with no question when every field is valid', async () => {
    const onClose = open();
    await fireEvent.input(field('system'), { target: { value: 'My draft.' } });
    await fireEvent.click(done());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before closing with a Message that could not be saved, and stays open on Keep editing', async () => {
    const onClose = open();
    await fireEvent.input(field('user'), { target: { value: 'no text here' } });

    confirm.mockResolvedValueOnce(false);
    await fireEvent.click(done());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'Close without this change?',
      confirmLabel: 'Close anyway',
      cancelLabel: 'Keep editing',
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(field('user').value).toBe('no text here');

    confirm.mockResolvedValueOnce(true);
    await fireEvent.click(done());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect((await getSettings()).taskOverrides.summarize).toBeUndefined();
  });

  it('Escape acts like Done', async () => {
    const onClose = open();
    await fireEvent.input(field('user'), { target: { value: 'no text here' } });
    confirm.mockResolvedValueOnce(false);
    await fireEvent.keyDown(field('user'), { key: 'Escape' });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('what the footer says', () => {
  it('a toggle saves at once and the status says Saved', async () => {
    open();
    const glossary = document.querySelector<HTMLInputElement>('[data-ega-task-glossary]');
    if (!glossary) throw new Error('no glossary checkbox');
    await fireEvent.click(glossary);
    await waitFor(() =>
      expect(document.querySelector('[data-ega-dialog-status]')?.textContent.trim()).toBe('Saved'),
    );
  });

  it('shows no Reset while the task has no edits, so it is never a disabled button', () => {
    open();
    expect(document.querySelector('[data-ega-section-reset]')).toBeNull();
  });

  it('page context off for every task: the box keeps its Tab stop and says why', () => {
    render(TaskEditDialog, {
      props: {
        s: parseSettings({ contextEnabled: false }),
        task: 'explain',
        onClose: vi.fn(),
        onSaved: vi.fn(),
      },
    });
    const box = document.querySelector<HTMLInputElement>('[data-ega-task-page-context]');
    expect(box?.disabled).toBe(false);
    expect(box?.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(box?.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent.trim()).toBe('Page context is off on the Answers tab');
  });
});
