// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import BackupStatus from '@/options/components/BackupStatus.svelte';

describe('backup import undo', () => {
  it('keeps Undo disabled until the import is undone, then announces completion', async () => {
    let complete: () => void = () => {};
    const undo = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const view = render(BackupStatus, { status: { kind: 'ok', msg: 'Imported tasks.', undo } });
    const button = view.getByRole('button', { name: 'Undo' });
    await fireEvent.click(button);
    expect(button.hasAttribute('disabled')).toBe(true);
    await fireEvent.click(button);
    expect(undo).toHaveBeenCalledTimes(1);
    complete();
    await waitFor(() =>
      expect(view.getByRole('status').textContent).toContain('Undid the task import.'),
    );
    expect(view.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('announces an undo failure and lets the user retry successfully', async () => {
    const undo = vi
      .fn()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce(undefined);
    const view = render(BackupStatus, { status: { kind: 'ok', msg: 'Imported tasks.', undo } });
    await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toBe('Ega could not undo the import. Try again.'),
    );
    await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(view.getByRole('status').textContent).toContain('Undid the task import.'),
    );
    expect(view.queryByRole('alert')).toBeNull();
    expect(undo).toHaveBeenCalledTimes(2);
  });

  it('offers Undo again for a later import and hides an absent status', async () => {
    const firstUndo = vi.fn().mockResolvedValue(undefined);
    const nextUndo = vi.fn().mockResolvedValue(undefined);
    const view = render(BackupStatus, {
      status: { kind: 'ok', msg: 'First import.', undo: firstUndo },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(view.queryByRole('button', { name: 'Undo' })).toBeNull());
    await view.rerender({ status: { kind: 'ok', msg: 'Second import.', undo: nextUndo } });
    expect(view.getByRole('status').textContent).toContain('Second import.');
    await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(nextUndo).toHaveBeenCalledTimes(1));
    await view.rerender({ status: null });
    expect(view.queryByRole('status')).toBeNull();
  });
});
