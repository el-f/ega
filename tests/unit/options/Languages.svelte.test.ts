// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { toastStore } from '@/shared/components/toastStore';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { getCustomLanguages, getSettings } from '@/shared/storage';
import type { Settings } from '@/shared/types';

// Hoisted once — vi.mock is evaluated at module level, not inside beforeEach.
vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

const Languages = (await import('@/options/tabs/Languages.svelte')).default;

/** Minimal valid varieties bundle payload. */
const VALID_BUNDLE = {
  egaVarieties: {
    v: 1,
    exportedAt: '2026-05-01T00:00:00.000Z',
    customLanguages: [],
    varietyOverrides: {},
    disabledVarieties: [],
  },
};

const CUSTOM = {
  id: 'custom-test-id',
  label: 'My Slang',
  hint: 'team speak',
  examples: [{ src: 'yo', tgt: 'hi' }],
  createdAt: 1000,
};

beforeEach(() => {
  resetChromeMock();
  vi.restoreAllMocks();
  vi.mocked(confirmDialog).mockResolvedValue(true);
});

async function mount(over: Partial<Settings> = {}) {
  const s = { ...(await getSettings()), ...over } as Settings;
  const onSetSettings = vi.fn();
  const utils = render(Languages, { props: { s, onSetSettings } });
  await waitFor(() => {
    if (document.querySelectorAll('.variety-row').length === 0) throw new Error('no rows yet');
  });
  return { ...utils, onSetSettings };
}

function row(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-ega-variety-row="${id}"]`);
  if (!el) throw new Error(`no row ${id}`);
  return el;
}

async function pickFile(payload: unknown): Promise<void> {
  const input = await waitFor(
    () => document.querySelector('input[type="file"]') as HTMLInputElement,
  );
  const file = new File([JSON.stringify(payload)], 'varieties.json', {
    type: 'application/json',
  });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await fireEvent.change(input);
}

describe('Languages tab — cards', () => {
  it('has Default languages, Slang and special languages, then Backup and restore', async () => {
    const { getAllByRole } = await mount();
    expect(getAllByRole('heading', { level: 2 }).map((h) => h.textContent.trim())).toEqual([
      'Default languages',
      'Slang and special languages',
      'Backup and restore',
    ]);
    expect(document.body.textContent).toContain(
      'Shown in the language pickers next to the standard languages',
    );
  });
});

describe('Languages tab — rows', () => {
  it('one line per language: the box names what it does, then a pill, the example count and Edit', async () => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
    chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
      ...DEFAULT_SETTINGS,
      varietyOverrides: { arabizi: { hint: 'my arabizi notes' } },
    });
    const { getByRole } = await mount();
    await waitFor(() => row(CUSTOM.id));
    expect(getByRole('checkbox', { name: 'Show My Slang in language pickers' })).toBeTruthy();
    expect(within(row(CUSTOM.id)).getByText('Custom')).toBeTruthy();
    expect(within(row('arabizi')).getByText('Edited')).toBeTruthy();
    expect(row(CUSTOM.id).textContent).toContain('1 example');
    // The notes are in the dialog, not cut short in the row.
    expect(row(CUSTOM.id).textContent).not.toContain('team speak');
    expect(within(row(CUSTOM.id)).getByRole('button', { name: 'Edit My Slang' })).toBeTruthy();
    // Export and Delete live in the dialog.
    expect(row(CUSTOM.id).querySelectorAll('button')).toHaveLength(1);
  });

  it('the checkbox hides a language from the pickers', async () => {
    const { onSetSettings } = await mount();
    await fireEvent.click(within(row('arabizi')).getByRole('checkbox'));
    await waitFor(async () => expect((await getSettings()).disabledVarieties).toContain('arabizi'));
    expect(onSetSettings).toHaveBeenCalled();
  });

  it('warns that a hidden default still runs, and stays quiet for other languages', async () => {
    const push = vi.spyOn(toastStore, 'push');
    chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
      ...DEFAULT_SETTINGS,
      defaultLang: 'arabizi',
    });
    await mount();
    await fireEvent.click(within(row('arabizi')).getByRole('checkbox'));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push.mock.calls[0]?.[0].message).toBe(
      'Arabizi is your default source language, so Ega still uses it. Pick another in Default languages.',
    );
    await fireEvent.click(within(row('leetspeak')).getByRole('checkbox'));
    await waitFor(async () =>
      expect((await getSettings()).disabledVarieties).toContain('leetspeak'),
    );
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('Languages tab — filter', () => {
  it('has a visible search icon, a name, and narrows the list', async () => {
    await mount();
    const filter = document.querySelector<HTMLInputElement>('[data-ega-variety-filter] input');
    expect(filter?.getAttribute('aria-label')).toBe('Filter languages');
    expect(document.querySelector('[data-ega-variety-filter] svg')).not.toBeNull();
    const all = document.querySelectorAll('.variety-row').length;
    await fireEvent.input(filter as HTMLInputElement, { target: { value: 'arab' } });
    await waitFor(() => expect(document.querySelectorAll('.variety-row').length).toBeLessThan(all));
  });

  it('no match says so and offers Clear filter, which brings the list back', async () => {
    const { getByRole } = await mount();
    const filter = document.querySelector<HTMLInputElement>(
      '[data-ega-variety-filter] input',
    ) as HTMLInputElement;
    await fireEvent.input(filter, { target: { value: 'zzzznomatch' } });
    await waitFor(() => expect(document.querySelectorAll('.variety-row')).toHaveLength(0));
    expect(document.querySelector('.variety-empty')?.textContent).toContain(
      'No language matches "zzzznomatch"',
    );
    await fireEvent.click(getByRole('button', { name: 'Clear filter' }));
    await waitFor(() =>
      expect(document.querySelectorAll('.variety-row').length).toBeGreaterThan(0),
    );
    expect(document.activeElement).toBe(filter);
  });
});

describe('Languages tab — the dialog', () => {
  it('Add language opens an empty dialog titled "New language"', async () => {
    const { getByRole } = await mount();
    await fireEvent.click(getByRole('button', { name: 'Add language' }));
    await waitFor(() =>
      expect(document.querySelector('[data-ega-language-dialog="new"]')).not.toBeNull(),
    );
    expect(getByRole('heading', { name: 'New language' })).toBeTruthy();
  });

  it('Edit opens the language, and Done puts focus back on its Edit button', async () => {
    const { getByRole } = await mount();
    const edit = within(row('arabizi')).getByRole('button', { name: 'Edit Arabizi' });
    await fireEvent.click(edit);
    await waitFor(() =>
      expect(document.querySelector('[data-ega-language-dialog="arabizi"]')).not.toBeNull(),
    );
    expect(getByRole('heading', { name: 'Edit Arabizi' })).toBeTruthy();
    await fireEvent.click(document.querySelector('[data-ega-dialog-done]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-ega-language-dialog]')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(edit));
  });
});

describe('Languages tab — Backup and restore', () => {
  it('renders Export and Import languages', async () => {
    const { getByRole } = await mount();
    expect(getByRole('button', { name: /export languages/i })).toBeTruthy();
    const label = document.querySelector('[data-ega-backup-restore-row] label.file-label');
    expect(label?.textContent.toLowerCase()).toContain('import languages');
  });

  it('Export downloads a file with the dated name', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake');
    URL.revokeObjectURL = vi.fn();
    const clicks: string[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', {
          value: () => clicks.push((el as HTMLAnchorElement).download),
          configurable: true,
        });
      }
      return el;
    });
    const { getByRole } = await mount();
    await fireEvent.click(getByRole('button', { name: /export languages/i }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(URL.createObjectURL as Mock).toHaveBeenCalled();
    expect(clicks[0]).toMatch(/^ega-varieties-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('an import dismissed at its confirm writes nothing', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');
    await mount();
    await pickFile(VALID_BUNDLE);
    await waitFor(() => expect(setSpy).not.toHaveBeenCalled());
  });

  it('an accepted import writes the languages and lists them', async () => {
    await mount();
    await pickFile({
      egaVarieties: { ...VALID_BUNDLE.egaVarieties, customLanguages: [CUSTOM] },
    });
    await waitFor(async () =>
      expect((await getCustomLanguages()).map((c) => c.label)).toEqual(['My Slang']),
    );
    await waitFor(() => row(CUSTOM.id));
  });

  it('says how many custom entries were dropped for a repeated id', async () => {
    await mount();
    await pickFile({
      egaVarieties: {
        ...VALID_BUNDLE.egaVarieties,
        customLanguages: [
          { ...CUSTOM, id: 'dupe-test-id', label: 'First' },
          { ...CUSTOM, id: 'dupe-test-id', label: 'Second' },
        ],
      },
    });
    await waitFor(() =>
      expect(document.querySelector('.backup-status')?.textContent).toMatch(
        /Dropped 1 custom entry with an id that is already taken/i,
      ),
    );
    expect((await getCustomLanguages()).filter((c) => c.id === 'dupe-test-id')).toHaveLength(1);
  });
});
