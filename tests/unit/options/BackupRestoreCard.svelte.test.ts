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
    expect(getByText(/^Export…$/)).toBeTruthy();
    expect(getByLabelText(/Include API keys/i)).toBeTruthy();
    expect(getByText(/^Import…$/)).toBeTruthy();
  });

  it('Export menu opens and "All settings" calls onExport with scope=all', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { getByText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByText(/^Export…$/));
    await fireEvent.click(getByText(/^All settings$/));
    expect(onExport).toHaveBeenCalledWith('all', false);
  });

  it('Export menu "Task presets only" calls onExport with scope=taskPresets', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { getByText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByText(/^Export…$/));
    await fireEvent.click(getByText(/^Task presets only$/));
    expect(onExport).toHaveBeenCalledWith('taskPresets', false);
  });

  it('include-keys checkbox flows to onExport', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { getByText, getByLabelText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByLabelText(/Include API keys/i));
    await fireEvent.click(getByText(/^Export…$/));
    await fireEvent.click(getByText(/^All settings$/));
    expect(onExport).toHaveBeenCalledWith('all', true);
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

  it('exporting all with includeKeys=true gates on type-to-confirm dialog', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    const { getByText, getByLabelText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByLabelText(/Include API keys/i));
    await fireEvent.click(getByText(/^Export…$/));
    await fireEvent.click(getByText(/^All settings$/));
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ typeToConfirm: 'EXPORT KEYS', danger: true }),
    );
    expect(onExport).toHaveBeenCalledWith('all', true);
  });

  it('canceling the type-to-confirm dialog blocks the export', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const { getByText, getByLabelText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByLabelText(/Include API keys/i));
    await fireEvent.click(getByText(/^Export…$/));
    await fireEvent.click(getByText(/^All settings$/));
    expect(onExport).not.toHaveBeenCalled();
  });

  it('Escape key closes menu when focus is outside the menu', async () => {
    const { getByText, container } = render(BackupRestoreCard, {
      props: { onExport: () => Promise.resolve(), onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByText(/^Export…$/));
    expect(container.querySelector('.export-menu')).not.toBeNull();

    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.export-menu')).toBeNull();
  });

  // Escape returns focus to the trigger, so a keyboard user stays on the control.
  it('Escape closing the menu returns focus to the export trigger', async () => {
    const { getByText, container } = render(BackupRestoreCard, {
      props: { onExport: () => Promise.resolve(), onImport: () => Promise.resolve(), status: null },
    });
    const trigger = getByText(/^Export…$/);
    await fireEvent.click(trigger);
    expect(container.querySelector('.export-menu')).not.toBeNull();

    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  // The user clicked elsewhere on purpose, so focus stays there.
  it('a plain outside click closes the menu WITHOUT stealing focus back to the trigger', async () => {
    const { getByText, container } = render(BackupRestoreCard, {
      props: { onExport: () => Promise.resolve(), onImport: () => Promise.resolve(), status: null },
    });
    const trigger = getByText(/^Export…$/);
    await fireEvent.click(trigger);
    expect(container.querySelector('.export-menu')).not.toBeNull();

    // A control elsewhere on the page that the user clicks into.
    const elsewhere = document.createElement('button');
    elsewhere.type = 'button';
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);

    // Outside click closes the menu.
    await fireEvent.click(elsewhere);
    expect(container.querySelector('.export-menu')).toBeNull();
    // Focus stays where the user clicked; it is NOT yanked to the trigger.
    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement).toBe(elsewhere);

    elsewhere.remove();
  });

  // Selecting a menu item returns focus to the trigger.
  it('selecting a menu item returns focus to the export trigger', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { getByText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    const trigger = getByText(/^Export…$/);
    await fireEvent.click(trigger);
    await fireEvent.click(getByText(/^All settings$/));
    expect(document.activeElement).toBe(trigger);
  });

  it('ArrowDown cycles focus through menuitems', async () => {
    const { getByText, container } = render(BackupRestoreCard, {
      props: { onExport: () => Promise.resolve(), onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByText(/^Export…$/));
    const menu = container.querySelector('.export-menu') as HTMLElement;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    // Focus first item, then ArrowDown should move to second.
    items[0]?.focus();
    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
  });

  it('ArrowUp wraps from first to last menuitem', async () => {
    const { getByText, container } = render(BackupRestoreCard, {
      props: { onExport: () => Promise.resolve(), onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByText(/^Export…$/));
    const menu = container.querySelector('.export-menu') as HTMLElement;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    items[0]?.focus();
    await fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('exporting taskPresets with includeKeys=true does NOT prompt (no keys carried)', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    vi.mocked(confirmDialog).mockClear();
    const { getByText, getByLabelText } = render(BackupRestoreCard, {
      props: { onExport, onImport: () => Promise.resolve(), status: null },
    });
    await fireEvent.click(getByLabelText(/Include API keys/i));
    await fireEvent.click(getByText(/^Export…$/));
    await fireEvent.click(getByText(/^Task presets only$/));
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(onExport).toHaveBeenCalledWith('taskPresets', true);
  });
});
