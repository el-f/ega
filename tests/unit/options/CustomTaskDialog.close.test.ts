// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '@tests/mocks/chrome';
import CustomTaskDialog from '@/options/components/CustomTaskDialog.svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { parseSettings } from '@/shared/settings-schema';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn() }));
const confirm = vi.mocked(confirmDialog);

function open(onClose = vi.fn()) {
  render(CustomTaskDialog, { props: { s: parseSettings({}), onClose, onSaved: vi.fn() } });
  return onClose;
}

function nameInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(
    'input[data-ega-custom-task-name], [data-ega-custom-task-name] input',
  );
  if (!el) throw new Error('no name input');
  return el;
}

function cancel(): HTMLButtonElement {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (x) => x.textContent.trim() === 'Cancel',
  );
  if (!b) throw new Error('no Cancel button');
  return b;
}

beforeEach(() => {
  resetChromeMock();
  confirm.mockReset();
});

describe('closing the custom task dialog', () => {
  it('closes at once when nothing was typed', async () => {
    const onClose = open();
    await fireEvent.click(cancel());
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape with a typed task asks first, and keeps the draft on No', async () => {
    const onClose = open();
    await fireEvent.input(nameInput(), { target: { value: 'Legal' } });

    confirm.mockResolvedValueOnce(false);
    await fireEvent.keyDown(nameInput(), { key: 'Escape' });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(nameInput().value).toBe('Legal');

    confirm.mockResolvedValueOnce(true);
    await fireEvent.click(cancel());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('why Save is off', () => {
  it('says to add a name, and the line goes once there is one', async () => {
    open();
    expect(document.body.textContent).toContain('Add a name to save.');
    await fireEvent.input(nameInput(), { target: { value: 'Polite reply' } });
    await waitFor(() => expect(document.body.textContent).not.toContain('Add a name to save.'));
  });
});
