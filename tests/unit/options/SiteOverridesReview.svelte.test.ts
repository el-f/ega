// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import SiteOverridesReview from '@/options/components/SiteOverridesReview.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { sel } from '@tests/_helpers/lang';
import type { Settings } from '@/shared/types';

function settingsWith(sitePrefs: Settings['sitePrefs']): Settings {
  return { ...DEFAULT_SETTINGS, sitePrefs };
}

describe('SiteOverridesReview', () => {
  it('renders one row per host, sorted alphabetically', () => {
    const s = settingsWith({
      'news.example': { disabled: true },
      'docs.example': { disabled: false, defaultLang: sel('arabizi') },
      'mail.example': { disabled: false },
    });
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: s,
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    const rows = container.querySelectorAll('[data-ega-site-override-row]');
    expect(rows.length).toBe(3);
    const hosts = Array.from(rows).map((r) => r.getAttribute('data-ega-site-override-host'));
    expect(hosts).toEqual(['docs.example', 'mail.example', 'news.example']);
  });

  it('renders a paused pill when disabled=true and a lang pill when defaultLang set', () => {
    const s = settingsWith({
      'a.test': { disabled: true, defaultLang: sel('arabizi') },
    });
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: s,
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    const row = container.querySelector('[data-ega-site-override-row]');
    expect(row).not.toBeNull();
    expect(row?.querySelector('[data-ega-site-pill-paused]')).not.toBeNull();
    expect(row?.querySelector('[data-ega-site-pill-lang]')).not.toBeNull();
  });

  it('renders an empty state when sitePrefs is empty', () => {
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({}),
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    expect(container.querySelector('[data-ega-site-override-row]')).toBeNull();
    expect(container.textContent).toMatch(/No site overrides/i);
  });

  async function clickConfirmButton(label: string): Promise<void> {
    const slot: { btn: HTMLButtonElement | null } = { btn: null };
    await waitFor(() => {
      const dialog = document.querySelector('.ega-dialog');
      expect(dialog).not.toBeNull();
      if (!dialog) return;
      const match = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === label,
      );
      slot.btn = match instanceof HTMLButtonElement ? match : null;
      expect(slot.btn).not.toBeNull();
    });
    const btn = slot.btn;
    expect(btn).not.toBeNull();
    if (btn) await fireEvent.click(btn);
  }

  it('clicking the per-row clear button after confirm fires onClearKeys([key])', async () => {
    const onClearKeys = vi.fn().mockResolvedValue(undefined);
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({ 'a.test': { disabled: true } }),
        onClearKeys,
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    const btn = container.querySelector(
      '[data-ega-site-override-row] [data-ega-site-override-clear]',
    ) as HTMLButtonElement;
    await fireEvent.click(btn);
    await clickConfirmButton('Clear');
    await waitFor(() => {
      expect(onClearKeys).toHaveBeenCalledWith(['a.test']);
    });
  });

  // A bare-host key repairs into https:// + http:// (canonicalSiteKeys), so both must live on one row.
  it('merges an http/https pair with equal prefs into one bare-host row', () => {
    const s = settingsWith({
      'https://bank.com': { disabled: true },
      'http://bank.com': { disabled: true },
      'https://solo.com': { disabled: true },
    });
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: s,
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    const hosts = Array.from(container.querySelectorAll('[data-ega-site-override-row]')).map((r) =>
      r.getAttribute('data-ega-site-override-host'),
    );
    expect(hosts).toEqual(['bank.com', 'https://solo.com']);
  });

  it('keeps a diverged http/https pair as two rows with the scheme visible', () => {
    const s = settingsWith({
      'https://bank.com': { disabled: true },
      'http://bank.com': { disabled: false, defaultLang: sel('arabizi') },
    });
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: s,
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    const rows = Array.from(container.querySelectorAll('[data-ega-site-override-row]'));
    expect(rows.map((r) => r.getAttribute('data-ega-site-override-host'))).toEqual([
      'http://bank.com',
      'https://bank.com',
    ]);
    expect(rows[0]?.querySelector('[data-ega-site-pill-paused]')).toBeNull();
    expect(rows[1]?.querySelector('[data-ega-site-pill-paused]')).not.toBeNull();
  });

  it('clearing a merged row clears both scheme keys', async () => {
    const onClearKeys = vi.fn().mockResolvedValue(undefined);
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({
          'https://bank.com': { disabled: true },
          'http://bank.com': { disabled: true },
        }),
        onClearKeys,
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    const btn = container.querySelector(
      '[data-ega-site-override-row] [data-ega-site-override-clear]',
    ) as HTMLButtonElement;
    await fireEvent.click(btn);
    await clickConfirmButton('Clear');
    await waitFor(() => {
      expect(onClearKeys).toHaveBeenCalledWith(['http://bank.com', 'https://bank.com']);
    });
  });

  it('counts merged hosts once in the clear-all confirm copy', async () => {
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({
          'https://bank.com': { disabled: true },
          'http://bank.com': { disabled: true },
        }),
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    const btn = container.querySelector('[data-ega-site-override-clear-all]') as HTMLButtonElement;
    await fireEvent.click(btn);
    await waitFor(() => {
      expect(document.querySelector('.ega-dialog')?.textContent).toContain('(1 host)');
    });
    // An open dialog outlives this render and the next test would click it.
    await clickConfirmButton('Clear all');
  });

  it('clicking "Clear all" after confirm fires onClearAll', async () => {
    const onClearAll = vi.fn().mockResolvedValue(undefined);
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({ 'a.test': { disabled: true }, 'b.test': { disabled: false } }),
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll,
      },
    });
    const btn = container.querySelector('[data-ega-site-override-clear-all]') as HTMLButtonElement;
    await fireEvent.click(btn);
    await clickConfirmButton('Clear all');
    await waitFor(() => {
      expect(onClearAll).toHaveBeenCalled();
    });
  });

  it('export button triggers a download when onExport is provided', async () => {
    const onExport = vi.fn();
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({ 'a.test': { disabled: true } }),
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll: vi.fn().mockResolvedValue(undefined),
        onExport,
      },
    });
    const btn = container.querySelector('[data-ega-site-override-export]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    await fireEvent.click(btn);
    expect(onExport).toHaveBeenCalled();
  });

  it('omits the export button when onExport is not supplied', () => {
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({ 'a.test': { disabled: true } }),
        onClearKeys: vi.fn().mockResolvedValue(undefined),
        onClearAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    expect(container.querySelector('[data-ega-site-override-export]')).toBeNull();
  });
});
