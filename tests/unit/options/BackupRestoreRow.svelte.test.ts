// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import BackupRestoreRow from '@/options/components/BackupRestoreRow.svelte';
import type { ImportStatus } from '@/options/import-bundle';
import { expectIconKind } from '../shared/ui/_helpers';

describe('BackupRestoreRow', () => {
  function makeProps() {
    return {
      onExport: () => Promise.resolve(),
      onImport: (_file: File) => Promise.resolve(),
      status: null as ImportStatus | null,
      scope: 'Languages',
    };
  }

  it('Export button carries data-action-icon="export"', () => {
    const { container } = render(BackupRestoreRow, { props: makeProps() });
    const exportBtn = container.querySelector('button');
    expect(exportBtn, 'Export button not found').not.toBeNull();
    if (exportBtn) expectIconKind(exportBtn, 'export');
  });

  it('Import label carries data-action-icon="import"', () => {
    const { container } = render(BackupRestoreRow, { props: makeProps() });
    const importLabel = container.querySelector('label.file-label');
    expect(importLabel, 'Import file-label not found').not.toBeNull();
    if (importLabel) expectIconKind(importLabel, 'import');
  });

  it('export icon differs from import icon', () => {
    const { container } = render(BackupRestoreRow, { props: makeProps() });
    const exportIcon = container.querySelector('[data-action-icon="export"] svg');
    const importIcon = container.querySelector('[data-action-icon="import"] svg');
    expect(exportIcon, 'Export icon SVG missing').not.toBeNull();
    expect(importIcon, 'Import icon SVG missing').not.toBeNull();
    if (exportIcon && importIcon) {
      expect(exportIcon.innerHTML).not.toBe(importIcon.innerHTML);
    }
  });

  it('renders Export scope label', () => {
    const { getByText } = render(BackupRestoreRow, { props: makeProps() });
    expect(getByText(/Export Languages/)).toBeTruthy();
  });

  it('renders Import scope label', () => {
    const { getByText } = render(BackupRestoreRow, { props: makeProps() });
    expect(getByText(/Import Languages/)).toBeTruthy();
  });

  it('renders ok status', () => {
    const props = { ...makeProps(), status: { kind: 'ok' as const, msg: 'Exported!' } };
    const { getByText } = render(BackupRestoreRow, { props });
    expect(getByText('Exported!')).toBeTruthy();
  });

  it('renders err status with alert role', () => {
    const props = { ...makeProps(), status: { kind: 'err' as const, msg: 'Import failed' } };
    const { getByRole } = render(BackupRestoreRow, { props });
    expect(getByRole('alert').textContent).toContain('Import failed');
  });

  it('a blocked export stays focusable, says why, and exports nothing', async () => {
    const onExport = vi.fn();
    const { getByRole } = render(BackupRestoreRow, {
      props: { ...makeProps(), onExport, exportBlockedReason: 'Nothing to export yet' },
    });
    const btn = getByRole('button', { name: /Export Languages/ });
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(btn.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Nothing to export yet',
    );
    await fireEvent.click(btn);
    expect(onExport).not.toHaveBeenCalled();
  });
});
