// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ConfirmDialog from '@/shared/components/ConfirmDialog.svelte';

describe('ConfirmDialog', () => {
  it('renders title + body when open', () => {
    const { getByText } = render(ConfirmDialog, {
      props: {
        open: true,
        title: 'Delete term',
        body: 'This cannot be undone.',
        onConfirm: () => {},
        onCancel: () => {},
      },
    });
    expect(getByText('Delete term')).toBeTruthy();
    expect(getByText('This cannot be undone.')).toBeTruthy();
  });

  it('fires onConfirm on confirm-button click', async () => {
    const onConfirm = vi.fn();
    const { getByText } = render(ConfirmDialog, {
      props: {
        open: true,
        title: 'x',
        body: 'y',
        onConfirm,
        onCancel: () => {},
      },
    });
    await fireEvent.click(getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('fires onCancel on cancel-button click', async () => {
    const onCancel = vi.fn();
    const { getByText } = render(ConfirmDialog, {
      props: {
        open: true,
        title: 'x',
        body: 'y',
        onConfirm: () => {},
        onCancel,
      },
    });
    await fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables confirm until typeToConfirm matches', async () => {
    const onConfirm = vi.fn();
    const { getByText, getByLabelText } = render(ConfirmDialog, {
      props: {
        open: true,
        title: 'Purge everything',
        body: 'All data will be lost.',
        typeToConfirm: 'DELETE',
        onConfirm,
        onCancel: () => {},
      },
    });
    const confirmBtn = getByText('Confirm').closest('button') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    const input = getByLabelText('Type to confirm') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'DELETE' } });
    expect(confirmBtn.disabled).toBe(false);
  });

  it('does not render when open=false', () => {
    const { queryByText } = render(ConfirmDialog, {
      props: {
        open: false,
        title: 'Hidden',
        body: 'nope',
        onConfirm: () => {},
        onCancel: () => {},
      },
    });
    expect(queryByText('Hidden')).toBeNull();
  });
});

function baseProps() {
  return {
    open: true,
    title: 'Delete?',
    body: 'This cannot be undone.',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
}

describe('ConfirmDialog — labels, typeToConfirm, danger variant', () => {
  it('renders title and body when open', () => {
    const { getByText } = render(ConfirmDialog, { props: baseProps() });
    expect(getByText('Delete?')).toBeTruthy();
    expect(getByText('This cannot be undone.')).toBeTruthy();
  });

  it('does not render when closed', () => {
    const { queryByText } = render(ConfirmDialog, {
      props: { ...baseProps(), open: false },
    });
    expect(queryByText('Delete?')).toBeNull();
    expect(queryByText('This cannot be undone.')).toBeNull();
  });

  it('Confirm button fires onConfirm', async () => {
    const onConfirm = vi.fn();
    const { getByText } = render(ConfirmDialog, {
      props: { ...baseProps(), onConfirm },
    });
    await fireEvent.click(getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('Cancel button fires onCancel', async () => {
    const onCancel = vi.fn();
    const { getByText } = render(ConfirmDialog, {
      props: { ...baseProps(), onCancel },
    });
    await fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('honors custom confirm / cancel labels', () => {
    const { getByText } = render(ConfirmDialog, {
      props: {
        ...baseProps(),
        confirmLabel: 'Yes, wipe it',
        cancelLabel: 'Nope',
      },
    });
    expect(getByText('Yes, wipe it')).toBeTruthy();
    expect(getByText('Nope')).toBeTruthy();
  });

  it('typeToConfirm gates the Confirm button', async () => {
    const { getByText, getByLabelText } = render(ConfirmDialog, {
      props: { ...baseProps(), typeToConfirm: 'DELETE' },
    });
    // Button component wraps the label in its own element — .closest('button') fishes
    // out the native <button> rendered by the primitive.
    const confirmLabel = getByText('Confirm');
    const confirmBtn = confirmLabel.closest('button') as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn.disabled).toBe(true);

    const input = getByLabelText('Type to confirm') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'DELETE' } });
    expect(confirmBtn.disabled).toBe(false);
  });

  it('typeToConfirm stays gated when typed string does not match', async () => {
    const { getByText, getByLabelText } = render(ConfirmDialog, {
      props: { ...baseProps(), typeToConfirm: 'DELETE' },
    });
    const input = getByLabelText('Type to confirm') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'delete' } });
    const confirmBtn = getByText('Confirm').closest('button') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('danger variant applies the danger class on the confirm button', () => {
    const { getByText } = render(ConfirmDialog, {
      props: { ...baseProps(), danger: true },
    });
    const confirmBtn = getByText('Confirm').closest('button') as HTMLButtonElement;
    expect(confirmBtn.className).toMatch(/variant-danger/);
  });
});
