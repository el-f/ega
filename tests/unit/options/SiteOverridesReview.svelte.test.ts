// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import SiteOverridesReview from '@/options/components/SiteOverridesReview.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { getSettings, updateSettings } from '@/shared/storage';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';
import { resetChromeMock } from '../../mocks/chrome';
import { sel } from '@tests/_helpers/lang';
import type { Settings } from '@/shared/types';

function settingsWith(sitePrefs: Settings['sitePrefs']): Settings {
  return { ...DEFAULT_SETTINGS, sitePrefs };
}

/** Seeds storage and renders with a parent that applies each write, as the tab does. */
async function mount(sitePrefs: Settings['sitePrefs']) {
  // The reader stores a bare host as its https:// and http:// keys; the tab renders what it reads.
  await updateSettings({ sitePrefs });
  const s = await getSettings();
  const onSaved = vi.fn((next: Settings) => void utils.rerender({ settings: next, onSaved }));
  const utils = render(SiteOverridesReview, { props: { settings: s, onSaved } });
  return { ...utils, onSaved };
}

const hosts = (c: HTMLElement): (string | null)[] =>
  [...c.querySelectorAll('[data-ega-site-override-row]')].map((r) =>
    r.getAttribute('data-ega-site-override-host'),
  );

let pushed: ToastMsg[] = [];
beforeEach(() => {
  resetChromeMock();
  vi.restoreAllMocks();
  pushed = [];
  vi.spyOn(toastStore, 'push').mockImplementation((m) => {
    pushed.push(m);
  });
});

describe('SiteOverridesReview', () => {
  it('renders one row per host, sorted, with its state in words', () => {
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({
          'news.example': { disabled: true },
          'docs.example': { disabled: false, defaultLang: sel('es') },
        }),
        onSaved: vi.fn(),
      },
    });
    expect(hosts(container)).toEqual(['docs.example', 'news.example']);
    expect(
      container.querySelector(
        '[data-ega-site-override-host="news.example"] [data-ega-site-override-state]',
      )?.textContent,
    ).toBe('Ega is off');
  });

  it('names the source language, not its code', async () => {
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({ 'a.test': { disabled: true, defaultLang: sel('es') } }),
        onSaved: vi.fn(),
      },
    });
    await waitFor(() =>
      expect(container.querySelector('[data-ega-site-override-state]')?.textContent).toBe(
        'Ega is off · Source: Spanish',
      ),
    );
  });

  it('empty: says where site overrides come from, with no button and no Remove all', () => {
    const { container } = render(SiteOverridesReview, {
      props: { settings: settingsWith({}), onSaved: vi.fn() },
    });
    expect(container.textContent).toContain('No site overrides yet');
    expect(container.textContent).toContain(
      'Sites you turn off from the right-click menu show here',
    );
    expect(container.querySelector('[data-ega-empty-state] button')).toBeNull();
    expect(container.querySelector('[data-ega-site-override-clear-all]')).toBeNull();
  });

  it('Remove acts at once, with Undo, and focus moves to the next row', async () => {
    const { container, getByRole } = await mount({
      'a.test': { disabled: true },
      'b.test': { disabled: true },
    });
    await fireEvent.click(getByRole('button', { name: 'Remove a.test' }));
    await waitFor(async () =>
      expect(Object.keys((await getSettings()).sitePrefs).every((k) => k.endsWith('b.test'))).toBe(
        true,
      ),
    );
    await waitFor(() => expect(hosts(container)).toEqual(['b.test']));
    expect(document.activeElement).toBe(getByRole('button', { name: 'Remove b.test' }));
    expect(pushed[0]?.message).toBe('Removed a.test');
    pushed[0]?.action?.onClick();
    await waitFor(async () =>
      expect(Object.keys((await getSettings()).sitePrefs).some((k) => k.endsWith('a.test'))).toBe(
        true,
      ),
    );
  });

  it('a merged http/https row removes both keys', async () => {
    const { getByRole } = await mount({
      'https://bank.com': { disabled: true },
      'http://bank.com': { disabled: true },
    });
    await fireEvent.click(getByRole('button', { name: 'Remove bank.com' }));
    await waitFor(async () => expect((await getSettings()).sitePrefs).toEqual({}));
  });

  it('keeps a diverged http/https pair as two rows with the scheme visible', () => {
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({
          'https://bank.com': { disabled: true },
          'http://bank.com': { disabled: false, defaultLang: sel('arabizi') },
        }),
        onSaved: vi.fn(),
      },
    });
    expect(hosts(container)).toEqual(['http://bank.com', 'https://bank.com']);
  });

  it('Remove all is a secondary header button that acts at once, counts sites, and offers Undo', async () => {
    const { getByRole } = await mount({
      'https://bank.com': { disabled: true },
      'http://bank.com': { disabled: true },
      'c.test': { disabled: true },
    });
    const all = getByRole('button', { name: 'Remove all' });
    expect(all.classList.contains('variant-secondary')).toBe(true);
    await fireEvent.click(all);
    await waitFor(async () => expect((await getSettings()).sitePrefs).toEqual({}));
    expect(pushed[0]?.message).toBe('Removed 2 site overrides');
    pushed[0]?.action?.onClick();
    await waitFor(async () => expect(Object.keys((await getSettings()).sitePrefs)).toHaveLength(4));
  });
});

describe('SiteOverridesReview — host filter', () => {
  function manySites(n: number): Settings['sitePrefs'] {
    const out: Settings['sitePrefs'] = {};
    for (let i = 0; i < n; i++)
      out[`site${String(i).padStart(2, '0')}.example`] = { disabled: true };
    return out;
  }

  it('has no filter for a short list', () => {
    const { queryByRole } = render(SiteOverridesReview, {
      props: { settings: settingsWith(manySites(9)), onSaved: vi.fn() },
    });
    expect(queryByRole('textbox', { name: 'Filter sites' })).toBeNull();
  });

  it('narrows a long list by host, ignoring case, and says when nothing matches', async () => {
    const { container, getByRole } = render(SiteOverridesReview, {
      props: {
        settings: settingsWith({ ...manySites(10), 'News.Example.org': { disabled: true } }),
        onSaved: vi.fn(),
      },
    });
    const input = getByRole('textbox', { name: 'Filter sites' });
    await fireEvent.input(input, { target: { value: 'news.EXAMPLE' } });
    expect(hosts(container)).toEqual(['News.Example.org']);
    await fireEvent.input(input, { target: { value: 'nowhere' } });
    expect(hosts(container)).toEqual([]);
    expect(container.textContent).toContain('No site matches "nowhere"');
  });
});
