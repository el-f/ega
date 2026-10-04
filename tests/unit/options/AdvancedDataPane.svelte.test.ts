// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AdvancedDataPane from '@/options/components/AdvancedDataPane.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

function settingsWithHost(host: string): Settings {
  return {
    ...DEFAULT_SETTINGS,
    sitePrefs: { [host]: { disabled: false } },
  } as Settings;
}

function baseProps(overrides: Partial<Parameters<typeof render>[1]['props']> = {}) {
  return {
    s: DEFAULT_SETTINGS,
    backupStatus: null,
    onExport: vi.fn().mockResolvedValue(undefined),
    onUnifiedImport: vi.fn().mockResolvedValue(undefined),
    onClearSiteKeys: vi.fn().mockResolvedValue(undefined),
    onClearAllSitePrefs: vi.fn().mockResolvedValue(undefined),
    onResetAllToDefaults: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AdvancedDataPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts and renders backup/restore + site-overrides review + reset cards', () => {
    const { container } = render(AdvancedDataPane, { props: baseProps() });
    expect(container.querySelector('[data-ega-setting="advanced.dataBackup"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-per-site-card]')).not.toBeNull();
    expect(container.querySelector('[data-ega-site-overrides-review]')).not.toBeNull();
    expect(container.querySelector('[data-ega-reset-defaults]')).not.toBeNull();
  });

  it('reset card copy matches what resetAllToDefaults does: site overrides cleared, per-language overrides + keys kept', () => {
    const { container } = render(AdvancedDataPane, { props: baseProps() });
    const text = container.textContent;
    expect(text).toContain('site overrides');
    expect(text).toContain(
      'Resets the template, Effort, temperature, max answer length and site overrides only.',
    );
    // resetAllToDefaults wipes sitePrefs, so only per-language prompt overrides may be promised to survive.
    expect(text).not.toMatch(/(?<!prompt )\boverrides\b[^.]+\b(?:kept|stay)/i);
  });

  it('site overrides copy names the right-click menu, not a popup icon that does not exist', () => {
    const { container } = render(AdvancedDataPane, { props: baseProps() });
    const text = container.querySelector('[data-ega-per-site-card]')?.textContent ?? '';
    expect(text).toContain('right-click a page');
    expect(text).not.toContain('globe icon');
  });

  it('clicking Reset button invokes onResetAllToDefaults', async () => {
    const onResetAllToDefaults = vi.fn().mockResolvedValue(undefined);
    const { container } = render(AdvancedDataPane, {
      props: baseProps({ onResetAllToDefaults }),
    });

    const btn = container.querySelector('[data-ega-reset-defaults]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    await fireEvent.click(btn);

    expect(onResetAllToDefaults).toHaveBeenCalledTimes(1);
  });

  it('clicking Export all settings invokes onExport without keys', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { container } = render(AdvancedDataPane, {
      props: baseProps({ onExport }),
    });

    const exportBtn = container.querySelector('[data-ega-export-all]') as HTMLButtonElement;
    expect(exportBtn).not.toBeNull();
    expect(exportBtn.textContent.trim()).toBe('Export all settings');
    await fireEvent.click(exportBtn);

    await waitFor(() => expect(onExport).toHaveBeenCalled());
    expect(onExport).toHaveBeenCalledWith(false);
  });

  it('clicking clear for a seeded host invokes onClearSiteKeys with that row keys', async () => {
    const HOST = 'example.com';
    const onClearSiteKeys = vi.fn().mockResolvedValue(undefined);
    const { container } = render(AdvancedDataPane, {
      props: baseProps({ s: settingsWithHost(HOST), onClearSiteKeys }),
    });

    const clearBtn = await waitFor(() => {
      const row = container.querySelector<HTMLElement>(`[data-ega-site-override-host="${HOST}"]`);
      const b = row?.querySelector<HTMLButtonElement>('[data-ega-site-override-clear]');
      if (!b) throw new Error('clear button not found');
      return b;
    });
    await fireEvent.click(clearBtn);

    await waitFor(() => expect(onClearSiteKeys).toHaveBeenCalled());
    expect(onClearSiteKeys).toHaveBeenCalledWith([HOST]);
  });

  it('clicking Clear all invokes onClearAllSitePrefs', async () => {
    const HOST = 'another.com';
    const onClearAllSitePrefs = vi.fn().mockResolvedValue(undefined);
    const { container } = render(AdvancedDataPane, {
      props: baseProps({ s: settingsWithHost(HOST), onClearAllSitePrefs }),
    });

    const clearAllBtn = await waitFor(() => {
      const btn = container.querySelector<HTMLButtonElement>('[data-ega-site-override-clear-all]');
      if (!btn) throw new Error('clear-all button not found');
      return btn;
    });
    await fireEvent.click(clearAllBtn);

    await waitFor(() => expect(onClearAllSitePrefs).toHaveBeenCalled());
    expect(onClearAllSitePrefs).toHaveBeenCalledWith();
  });
});
