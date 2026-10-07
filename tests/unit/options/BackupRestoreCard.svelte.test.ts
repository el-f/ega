// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BackupRestoreCard from '@/options/components/BackupRestoreCard.svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn().mockResolvedValue(true),
}));

describe('BackupRestoreCard', () => {
  it('renders Export button + include-keys checkbox + Import label', () => {
    const { getByText, getByLabelText } = render(BackupRestoreCard, {
      props: {
        onExport: () => Promise.resolve(),
        onImport: () => Promise.resolve(),
        status: null,
      },
    });
    expect(getByText(/^Export all settings$/)).toBeTruthy();
    expect(getByLabelText(/Include API keys/i)).toBeTruthy();
    expect(getByText('Import settings...')).toBeTruthy();
  });

  it('Export all settings calls onExport without keys', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { getByText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByText(/^Export all settings$/));
    expect(onExport).toHaveBeenCalledWith(false);
  });

  it('include-keys checkbox flows to onExport', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { getByText, getByLabelText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByLabelText(/Include API keys/i));
    await fireEvent.click(getByText(/^Export all settings$/));
    expect(onExport).toHaveBeenCalledWith(true);
  });

  it('renders ok status when provided', () => {
    const { getByText } = render(BackupRestoreCard, {
      props: {
        onExport: () => Promise.resolve(),
        onImport: () => Promise.resolve(),
        status: { kind: 'ok', msg: 'Exported (API keys stripped)' },
      },
    });
    expect(getByText('Exported (API keys stripped)')).toBeTruthy();
  });

  it('renders err status with alert role', () => {
    const { getByRole } = render(BackupRestoreCard, {
      props: {
        onExport: () => Promise.resolve(),
        onImport: () => Promise.resolve(),
        status: { kind: 'err', msg: 'Import failed: Bad shape' },
      },
    });
    expect(getByRole('alert').textContent).toContain('Bad shape');
  });

  it('ok status renders the shared backup-status banner as a polite live region', () => {
    const { container } = render(BackupRestoreCard, {
      props: {
        onExport: () => Promise.resolve(),
        onImport: () => Promise.resolve(),
        status: { kind: 'ok', msg: 'Exported' },
      },
    });
    const banner = container.querySelector('.backup-status.ok');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('aria-live')).toBe('polite');
  });

  it('err status uses backup-status banner with assertive live region', () => {
    const { container } = render(BackupRestoreCard, {
      props: {
        onExport: () => Promise.resolve(),
        onImport: () => Promise.resolve(),
        status: { kind: 'err', msg: 'Import failed' },
      },
    });
    const banner = container.querySelector('.backup-status.err');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('aria-live')).toBe('assertive');
  });

  it('exporting with includeKeys=true gates on type-to-confirm dialog', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    const { getByText, getByLabelText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByLabelText(/Include API keys/i));
    await fireEvent.click(getByText(/^Export all settings$/));
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ typeToConfirm: 'EXPORT KEYS', danger: true }),
    );
    expect(onExport).toHaveBeenCalledWith(true);
  });

  it('canceling the type-to-confirm dialog blocks the export', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const { getByText, getByLabelText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByLabelText(/Include API keys/i));
    await fireEvent.click(getByText(/^Export all settings$/));
    expect(onExport).not.toHaveBeenCalled();
  });
});
