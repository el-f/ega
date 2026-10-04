// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';
import type * as ImportBundleModule from '@/options/import-bundle';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));
const download = vi.fn();
vi.mock('@/shared/download-file', () => ({
  downloadJsonFile: (...a: unknown[]) => download(...a),
}));
const importFile = vi.fn();
vi.mock('@/options/import-bundle', async (orig) => ({
  ...(await orig<typeof ImportBundleModule>()),
  importBundleFile: (f: File) => importFile(f),
}));

const Advanced = (await import('@/options/tabs/Advanced.svelte')).default;

function seed(raw: Record<string, unknown> = {}): Settings {
  const s = parseSettings(raw);
  chromeMock.storage.local._raw.set('ega.settings', s);
  return s;
}

function stored(): Settings {
  return chromeMock.storage.local._raw.get('ega.settings') as Settings;
}

async function openData(s: Settings, onSetSettings = vi.fn()) {
  const view = render(Advanced, { props: { s, onSetSettings } });
  await fireEvent.click(await view.findByRole('tab', { name: /data/i }));
  return { ...view, onSetSettings };
}

describe('Advanced tab — data handlers', () => {
  beforeEach(() => {
    resetChromeMock();
    download.mockReset();
    importFile.mockReset();
    try {
      sessionStorage.removeItem('ega-advanced-subtab');
    } catch {
      // ignore
    }
  });

  it('clearing one site override removes only that host', async () => {
    const s = seed({
      sitePrefs: { 'https://a.com': { disabled: true }, 'https://b.com': { disabled: true } },
    });
    const { findByRole, onSetSettings } = await openData(s);
    // The row button only shows on hover, so the role query would skip it.
    await fireEvent.click(
      await findByRole('button', { name: 'Clear override for https://a.com', hidden: true }),
    );
    await waitFor(() => expect(onSetSettings).toHaveBeenCalled());
    expect(Object.keys(stored().sitePrefs)).toEqual(['https://b.com']);
  });

  it('clearing all site overrides empties sitePrefs', async () => {
    const s = seed({ sitePrefs: { 'https://a.com': { disabled: true } } });
    const { findByRole, onSetSettings } = await openData(s);
    await fireEvent.click(await findByRole('button', { name: /^Clear all/i }));
    await waitFor(() => expect(onSetSettings).toHaveBeenCalled());
    expect(stored().sitePrefs).toEqual({});
  });

  it('exporting all settings downloads a keyless bundle and says so', async () => {
    const s = seed();
    const { findByRole, findByText } = await openData(s);
    await fireEvent.click(await findByRole('button', { name: /^Export all settings$/ }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download.mock.calls[0]?.[0]).toMatch(/^ega-settings-.*\.json$/);
    await findByText(/API keys stripped/i);
  });

  it('a failed export shows the error instead of a success line', async () => {
    download.mockImplementation(() => {
      throw new Error('disk full');
    });
    const s = seed();
    const { findByRole, findByText } = await openData(s);
    await fireEvent.click(await findByRole('button', { name: /^Export all settings$/ }));
    await findByText(/Export failed: disk full/);
  });

  it('a successful import reloads settings; a cancelled one changes nothing', async () => {
    const s = seed();
    const { container, onSetSettings } = await openData(s);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });

    importFile.mockResolvedValueOnce(null);
    await fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(importFile).toHaveBeenCalledTimes(1));
    expect(onSetSettings).not.toHaveBeenCalled();

    importFile.mockResolvedValueOnce({ kind: 'ok', msg: 'Imported' });
    await fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onSetSettings).toHaveBeenCalledTimes(1));
  });
});
