// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AdvancedDataPane from '@/options/components/AdvancedDataPane.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    s: DEFAULT_SETTINGS as Settings,
    backupStatus: null,
    onExport: vi.fn().mockResolvedValue(undefined),
    onUnifiedImport: vi.fn().mockResolvedValue(undefined),
    onSaved: vi.fn(),
    onReset: vi.fn().mockResolvedValue(undefined),
    onClearCache: vi.fn().mockResolvedValue(undefined),
    onDeleteAll: vi.fn(),
    ...overrides,
  };
}

describe('AdvancedDataPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has Backup and restore, Site overrides, Saved conversations, then Reset and delete', () => {
    const { getAllByRole } = render(AdvancedDataPane, { props: baseProps() });
    expect(getAllByRole('heading', { level: 2 }).map((h) => h.textContent.trim())).toEqual([
      'Backup and restore',
      'Site overrides',
      'Saved conversations',
      'Reset and delete',
    ]);
  });

  it('Reset and delete: three rows, each with its effect and one button', () => {
    const { getByRole } = render(AdvancedDataPane, { props: baseProps() });
    for (const [name, line] of [
      ['Reset', 'Puts back the Translate prompt, Effort, creativity and answer length'],
      ['Clear cache', 'Translations run again next time'],
      ['Delete all data', 'Removes every setting, key and saved conversation'],
    ] as const) {
      const btn = getByRole('button', { name });
      expect(document.getElementById(btn.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
        line,
      );
    }
    // The reset no longer touches site overrides, and the (i) says what is kept.
    expect(document.body.textContent).not.toMatch(/site overrides\.$/m);
    const info = getByRole('button', { name: 'About resets' });
    expect(document.getElementById(info.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Language prompts, API keys, tasks and saved conversations are kept. Delete all data cannot be undone.',
    );
  });

  it('each button calls its own action', async () => {
    const props = baseProps();
    const { getByRole } = render(AdvancedDataPane, { props });
    await fireEvent.click(getByRole('button', { name: 'Reset' }));
    await fireEvent.click(getByRole('button', { name: 'Clear cache' }));
    await fireEvent.click(getByRole('button', { name: 'Delete all data' }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
    expect(props.onClearCache).toHaveBeenCalledTimes(1);
    expect(props.onDeleteAll).toHaveBeenCalledTimes(1);
  });

  it('Export all settings exports without keys unless "Include API keys" is on', async () => {
    const props = baseProps();
    const { getByRole } = render(AdvancedDataPane, { props });
    const exportBtn = getByRole('button', { name: /Export all settings/ });
    await fireEvent.click(exportBtn);
    await waitFor(() => expect(props.onExport).toHaveBeenCalledWith(false));
    expect(getByRole('checkbox', { name: 'Include API keys' })).toBeTruthy();
    expect(document.body.textContent).toContain('Leave this off for a file you share');
    expect(document.body.textContent).toContain('Import settings...');
  });
});
