// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { toastStore } from '@/shared/components/toastStore';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { getCustomLanguages, getSettings } from '@/shared/storage';
import { flushAsync } from '@tests/_helpers/async';

// Hoisted once — vi.mock is evaluated at module level, not inside beforeEach.
vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

const LanguagesModule = await import('@/options/tabs/Languages.svelte');
const Languages = LanguagesModule.default;

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

/** Pre-seed storage with a variety override so one built-in has hasOverrides. */
function seedVarietyOverride(): string {
  const preset = BUILT_IN_PRESETS[0];
  if (!preset) throw new Error('no built-in presets');
  const id = preset.id as string;
  const settings = {
    ...DEFAULT_SETTINGS,
    varietyOverrides: { [id]: { hint: 'custom hint override' } },
  };
  chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, settings);
  return id;
}

describe('Languages tab — Backup & restore', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    // Reset the hoisted mock to auto-accept after restoreAllMocks.
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('renders Export and Import buttons', async () => {
    const { getByRole, findByRole } = render(Languages);
    expect(getByRole('button', { name: /export languages/i })).toBeTruthy();
    await findByRole('heading', { level: 2, name: /backup & restore/i });
    const row = document.querySelector('[data-ega-backup-restore-row]');
    expect(row).toBeTruthy();
    const label = row?.querySelector('label.file-label');
    expect(label).toBeTruthy();
    expect(label?.textContent.toLowerCase()).toContain('import languages');
  });

  it('Export click triggers download with correct filename pattern', async () => {
    // jsdom doesn't implement URL.createObjectURL — assign stubs directly.
    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake');
    URL.revokeObjectURL = vi.fn();
    const createSpy = URL.createObjectURL as Mock;

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

    const { getByRole } = render(Languages);
    await fireEvent.click(getByRole('button', { name: /export languages/i }));
    await waitFor(() => expect(clicks).toHaveLength(1));

    expect(createSpy).toHaveBeenCalled();
    expect(clicks[0]).toMatch(/^ega-varieties-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('Import dismissed at confirm → no storage write', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);

    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');

    render(Languages);

    const input = await waitFor(
      () => document.querySelector('input[type="file"]') as HTMLInputElement,
    );
    expect(input).toBeTruthy();

    const file = new File([JSON.stringify(VALID_BUNDLE)], 'varieties.json', {
      type: 'application/json',
    });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);

    await waitFor(() => expect(setSpy).not.toHaveBeenCalled());
  });

  it('Filter input narrows the variety list', async () => {
    render(Languages);
    const filterInput = await waitFor(() => {
      const wrap = document.querySelector('[data-ega-variety-filter]');
      const input = wrap?.querySelector('input[type="text"]') as HTMLInputElement | null;
      if (!input) throw new Error('filter input not found');
      return input;
    });
    expect(filterInput).toBeTruthy();
    // Wait for varieties to load.
    await waitFor(() => {
      expect(document.querySelectorAll('.variety-row').length).toBeGreaterThan(1);
    });
    const initialCount = document.querySelectorAll('.variety-row').length;
    await fireEvent.input(filterInput, { target: { value: 'arab' } });
    await waitFor(() => {
      expect(document.querySelectorAll('.variety-row').length).toBeLessThan(initialCount);
    });
  });

  it('Filter with no match shows the empty-state line naming the query', async () => {
    render(Languages);
    const filterInput = await waitFor(() => {
      const wrap = document.querySelector('[data-ega-variety-filter]');
      const input = wrap?.querySelector('input[type="text"]') as HTMLInputElement | null;
      if (!input) throw new Error('filter input not found');
      return input;
    });
    await waitFor(() => {
      expect(document.querySelectorAll('.variety-row').length).toBeGreaterThan(0);
    });
    await fireEvent.input(filterInput, { target: { value: 'zzzznomatch' } });
    await waitFor(() => {
      expect(document.querySelectorAll('.variety-row').length).toBe(0);
      const empty = document.querySelector('.variety-empty');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain('zzzznomatch');
    });
  });

  it('Import accepted → writes customLanguages and settings to storage', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);

    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');

    render(Languages);

    const input = await waitFor(
      () => document.querySelector('input[type="file"]') as HTMLInputElement,
    );

    const file = new File([JSON.stringify(VALID_BUNDLE)], 'varieties.json', {
      type: 'application/json',
    });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);

    await waitFor(() => expect(setSpy).toHaveBeenCalled());
    const keys = setSpy.mock.calls.flatMap((args) =>
      Object.keys(args[0] as Record<string, unknown>),
    );
    expect(keys).toContain(STORAGE_KEYS.customLanguages);

    // Round-trip: read back via getCustomLanguages and verify the imported shape.
    const stored = await getCustomLanguages();
    expect(Array.isArray(stored)).toBe(true);
    // VALID_BUNDLE ships an empty customLanguages array, so the stored value must be [].
    expect(stored).toEqual([]);
  });

  it('Import accepted with non-empty customLanguages → round-trip persists the entries', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);

    const bundleWithCustom = {
      egaVarieties: {
        v: 1,
        exportedAt: '2026-05-01T00:00:00.000Z',
        customLanguages: [
          {
            id: 'imported-test-id',
            label: 'Imported Lang',
            hint: 'test hint',
            examples: [],
            createdAt: 1000,
          },
        ],
        varietyOverrides: {},
        disabledVarieties: [],
      },
    };

    render(Languages);

    const input = await waitFor(
      () => document.querySelector('input[type="file"]') as HTMLInputElement,
    );

    const file = new File([JSON.stringify(bundleWithCustom)], 'varieties.json', {
      type: 'application/json',
    });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);

    await waitFor(async () => {
      const stored = await getCustomLanguages();
      expect(stored.some((c) => c.id === 'imported-test-id')).toBe(true);
    });

    const stored = await getCustomLanguages();
    expect(stored.find((c) => c.id === 'imported-test-id')?.label).toBe('Imported Lang');
  });

  it('says how many custom entries were dropped for a repeated id', async () => {
    const twice = (id: string, label: string) => ({
      id,
      label,
      hint: 'test hint',
      examples: [],
      createdAt: 1000,
    });
    const bundleWithCollision = {
      egaVarieties: {
        v: 1,
        exportedAt: '2026-05-01T00:00:00.000Z',
        customLanguages: [twice('dupe-test-id', 'First'), twice('dupe-test-id', 'Second')],
        varietyOverrides: {},
        disabledVarieties: [],
      },
    };

    render(Languages);
    const input = await waitFor(
      () => document.querySelector('input[type="file"]') as HTMLInputElement,
    );
    const file = new File([JSON.stringify(bundleWithCollision)], 'varieties.json', {
      type: 'application/json',
    });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);

    await waitFor(() => {
      const status = document.querySelector('.backup-status');
      expect(status?.textContent).toMatch(
        /Dropped 1 custom entry with an id that is already taken/i,
      );
    });
    const stored = await getCustomLanguages();
    expect(stored.filter((c) => c.id === 'dupe-test-id')).toHaveLength(1);
  });
});

describe('Languages tab — kind badge display copy', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('built-in rows carry no kind badge', async () => {
    render(Languages);
    await waitFor(() => {
      expect(document.querySelectorAll('.variety-row').length).toBeGreaterThan(0);
    });
    const badges = [...document.querySelectorAll('.badge')].map((b) => b.textContent.trim());
    expect(badges).not.toContain('Built-in');
    expect(badges).not.toContain('builtin');
  });

  it('custom varieties show "Custom"', async () => {
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      {
        id: 'custom-badge-id',
        label: 'My Slang',
        hint: 'team speak',
        examples: [],
        createdAt: 1000,
      },
    ]);
    render(Languages);
    const customRow = await waitFor(() => {
      const label = [...document.querySelectorAll('.variety-label-inline')].find((el) =>
        el.textContent.includes('My Slang'),
      );
      if (!label) throw new Error('custom row not found');
      return label;
    });
    expect(customRow.querySelector('.badge')?.textContent.trim()).toBe('Custom');
  });
});

describe('Languages tab — delete variety confirmation', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  function seedCustomVariety(): void {
    const custom = {
      id: 'custom-test-id',
      label: 'My Slang',
      hint: 'internal team speak',
      examples: [],
      createdAt: 1000,
    };
    chromeMock.storage.local._raw.set('ega.customLanguages', [custom]);
  }

  it('clicking delete shows confirm dialog', async () => {
    seedCustomVariety();
    render(Languages);

    await waitFor(() => {
      expect(document.querySelector('.variety-row')).not.toBeNull();
    });

    const deleteBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '.variety-actions button[aria-label="Delete custom language"]',
      );
      if (!btn) throw new Error('delete button not found');
      return btn;
    });

    await fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(vi.mocked(confirmDialog)).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Delete custom language?' }),
      );
    });
  });

  it('confirming delete proceeds to remove the variety', async () => {
    seedCustomVariety();
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');

    render(Languages);

    await waitFor(() => {
      expect(document.querySelector('.variety-row')).not.toBeNull();
    });

    const deleteBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '.variety-actions button[aria-label="Delete custom language"]',
      );
      if (!btn) throw new Error('delete button not found');
      return btn;
    });

    await fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalled();
    });

    // Payload must target ega.customLanguages and the deleted id must be absent.
    const allCalls = setSpy.mock.calls.flatMap((args) =>
      Object.entries(args[0] as Record<string, unknown>),
    );
    const customLangsCall = allCalls.find(([k]) => k === 'ega.customLanguages');
    expect(customLangsCall, 'expected a write to ega.customLanguages').toBeDefined();
    const stored = (customLangsCall as [string, unknown])[1] as Array<{ id: string }>;
    expect(Array.isArray(stored)).toBe(true);
    expect(stored.some((c) => c.id === 'custom-test-id')).toBe(false);
  });

  it('canceling delete does not remove the variety', async () => {
    seedCustomVariety();
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const setSpy = vi.spyOn(chromeMock.storage.local, 'set');

    render(Languages);

    await waitFor(() => {
      expect(document.querySelector('.variety-row')).not.toBeNull();
    });

    const deleteBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '.variety-actions button[aria-label="Delete custom language"]',
      );
      if (!btn) throw new Error('delete button not found');
      return btn;
    });

    await fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(vi.mocked(confirmDialog)).toHaveBeenCalled();
    });
    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe('Languages tab — Reset to built-in keeps section open', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('clicking Reset to built-in resets variety, keeps editor expanded, offers Undo', async () => {
    seedVarietyOverride();
    const pushSpy = vi.spyOn(toastStore, 'push');

    render(Languages);

    await waitFor(() => {
      expect(document.querySelectorAll('.variety-row').length).toBeGreaterThan(0);
    });

    const editBtn = await waitFor(() => {
      const btns = document.querySelectorAll<HTMLButtonElement>(
        '.variety-actions button[aria-label="Edit"]',
      );
      const btn = btns[0];
      if (!btn) throw new Error('edit buttons not found');
      return btn;
    });
    await fireEvent.click(editBtn);

    await waitFor(() => {
      expect(document.querySelector('.variety-commit-row')).not.toBeNull();
    });

    const resetBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        'button[title="Remove your saved edits and restore the built-in version"]',
      );
      if (!btn) throw new Error('reset button not found');
      return btn;
    });
    expect(resetBtn.textContent).toContain('Reset to built-in');

    await fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(document.querySelector('.variety-commit-row')).not.toBeNull();
    });

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('reset to built-in'),
          action: expect.objectContaining({ label: 'Undo' }),
        }),
      );
    });
  });

  it('the Undo action rewrites the override it removed', async () => {
    const id = seedVarietyOverride();
    const pushSpy = vi.spyOn(toastStore, 'push');

    render(Languages);

    const editBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '.variety-actions button[aria-label="Edit"]',
      );
      if (!btn) throw new Error('edit button not found');
      return btn;
    });
    await fireEvent.click(editBtn);

    const resetBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        'button[title="Remove your saved edits and restore the built-in version"]',
      );
      if (!btn) throw new Error('reset button not found');
      return btn;
    });
    await fireEvent.click(resetBtn);

    await waitFor(() => {
      const s = chromeMock.storage.local._raw.get(STORAGE_KEYS.settings) as {
        varietyOverrides?: Record<string, unknown>;
      };
      expect(s.varietyOverrides?.[id]).toBeUndefined();
    });

    // The toast lands after the write and the re-read settle; the storage poll above can win by a hop.
    await waitFor(() => expect(pushSpy).toHaveBeenCalled());
    const action = pushSpy.mock.calls[0]?.[0]?.action;
    if (!action) throw new Error('toast action missing');
    action.onClick();

    await waitFor(() => {
      const s = chromeMock.storage.local._raw.get(STORAGE_KEYS.settings) as {
        varietyOverrides?: Record<string, { hint?: string }>;
      };
      expect(s.varietyOverrides?.[id]?.hint).toBe('custom hint override');
    });
  });
});

describe('Languages tab — example rows keep DOM identity across a delete', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('removing the first example destroys that row, not the last one', async () => {
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      {
        id: 'ex-key-id',
        label: 'Keyed Slang',
        hint: 'team speak',
        examples: [
          { src: 'first-src', tgt: 'first-tgt' },
          { src: 'second-src', tgt: 'second-tgt' },
        ],
        createdAt: 1000,
      },
    ]);

    render(Languages);

    const editBtn = await waitFor(() => {
      const row = [...document.querySelectorAll('.variety-row')].find((el) =>
        el.querySelector('.variety-label-inline')?.textContent.includes('Keyed Slang'),
      );
      const btn = row?.querySelector<HTMLButtonElement>(
        '.variety-actions button[aria-label="Edit"]',
      );
      if (!btn) throw new Error('edit button for the custom row not found');
      return btn;
    });
    await fireEvent.click(editBtn);

    const srcInputs = await waitFor(() => {
      const els = document.querySelectorAll<HTMLInputElement>(
        '.variety-example-row input[aria-label="Example source"]',
      );
      if (els.length !== 2) throw new Error(`expected 2 example rows, got ${els.length}`);
      return els;
    });
    const secondInput = srcInputs[1];
    if (!secondInput) throw new Error('second example input missing');
    secondInput.focus();
    expect(document.activeElement).toBe(secondInput);

    const removeFirst = document.querySelectorAll<HTMLButtonElement>(
      '.variety-example-row button[aria-label="Remove example"]',
    )[0];
    if (!removeFirst) throw new Error('remove button missing');
    await fireEvent.click(removeFirst);

    await waitFor(() => {
      expect(document.querySelectorAll('.variety-example-row').length).toBe(1);
    });

    const survivor = document.querySelector<HTMLInputElement>(
      '.variety-example-row input[aria-label="Example source"]',
    );
    expect(survivor?.value).toBe('second-src');
    // The surviving row must be the same DOM node, so its focus is not lost.
    expect(survivor).toBe(secondInput);
    expect(document.activeElement).toBe(secondInput);
  });
});

describe('Languages tab — add-form hint accessibility', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('marks the required Hint textarea as required for AT', async () => {
    render(Languages);
    const addBtn = await waitFor(() => {
      const b = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Add custom language"]',
      );
      if (!b) throw new Error('add button not found');
      return b;
    });
    await fireEvent.click(addBtn);

    const hint = await waitFor(() => {
      const el = document.querySelector<HTMLTextAreaElement>('#new-hint');
      if (!el) throw new Error('hint textarea not found');
      return el;
    });
    expect(hint.required).toBe(true);
    expect(hint.getAttribute('aria-required')).toBe('true');
  });
});

describe('Languages tab — editing a language deleted in another window', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('says it is gone and does not bring it back', async () => {
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      { id: 'custom-gone-id', label: 'Gone Lang', hint: 'h', examples: [], createdAt: 1 },
    ]);
    const pushed: Array<{ message: string }> = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
    render(Languages);
    const editBtn = await waitFor(() => {
      const row = [...document.querySelectorAll('.variety-row')].find((r) =>
        r.textContent.includes('Gone Lang'),
      );
      const btn = row?.querySelector<HTMLButtonElement>('button[aria-label="Edit"]');
      if (!btn) throw new Error('edit button not found');
      return btn;
    });
    await fireEvent.click(editBtn);
    chromeMock.storage.local._raw.set('ega.customLanguages', []);
    const save = await waitFor(() => {
      const b = [
        ...document.querySelectorAll<HTMLButtonElement>('.variety-commit-row button'),
      ].find((x) => x.textContent.trim() === 'Save language');
      if (!b) throw new Error('save button not found');
      return b;
    });
    await fireEvent.click(save);
    await waitFor(() => expect(pushed).toHaveLength(1));
    expect(pushed[0]?.message).toBe('"Gone Lang" was deleted in another window.');
    expect(await getCustomLanguages()).toEqual([]);
  });
});

describe('Languages tab — turning off a default language', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  async function toggle(id: string): Promise<void> {
    const box = await waitFor(() => {
      const el = document.getElementById(`enable-${id}`);
      if (!el) throw new Error(`no checkbox for ${id}`);
      return el;
    });
    await fireEvent.click(box);
  }

  it('warns that the default still runs, and stays quiet for other languages', async () => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
      ...DEFAULT_SETTINGS,
      defaultLang: 'arabizi',
      defaultTargetLang: 'elvish-quenya',
    });
    const pushed: Array<{ message: string; variant?: string }> = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
    render(Languages);
    await toggle('arabizi');
    await waitFor(() => expect(pushed).toHaveLength(1));
    expect(pushed[0]?.variant).toBe('warning');
    expect(pushed[0]?.message).toMatch(/default source language/);
    await toggle('elvish-quenya');
    await waitFor(() => expect(pushed).toHaveLength(2));
    expect(pushed[1]?.message).toMatch(/default target language/);
    await toggle('arabizi');
    await toggle('leetspeak');
    await vi.waitFor(async () =>
      expect((await getSettings()).disabledVarieties).toEqual(['elvish-quenya', 'leetspeak']),
    );
    // A warning follows its write and one re-read, so one flush is enough for it to show.
    await flushAsync();
    expect(pushed).toHaveLength(2);
  });
});

describe('Languages tab — detection pattern editor', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  const ID = 'custom-detect-id';
  function seed(autoDetect?: { regex: string; flags: string; minScore: number }): void {
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      {
        id: ID,
        label: 'Detect Lang',
        hint: 'h',
        examples: [],
        createdAt: 1,
        ...(autoDetect ? { autoDetect } : {}),
      },
    ]);
  }

  async function openEditor(): Promise<void> {
    const editBtn = await waitFor(() => {
      const row = [...document.querySelectorAll('.variety-row')].find((r) =>
        r.textContent.includes('Detect Lang'),
      );
      const btn = row?.querySelector<HTMLButtonElement>('button[aria-label="Edit"]');
      if (!btn) throw new Error('edit button not found');
      return btn;
    });
    await fireEvent.click(editBtn);
    const toggle = await waitFor(() => {
      const t = document.querySelector<HTMLButtonElement>('.variety-advanced-toggle');
      if (!t) throw new Error('advanced toggle not found');
      return t;
    });
    await fireEvent.click(toggle);
  }

  const field = (id: string): HTMLInputElement => {
    const el = document.getElementById(id);
    if (!(el instanceof HTMLInputElement)) throw new Error(`no field ${id}`);
    return el;
  };

  async function clickSave(): Promise<void> {
    const save = [
      ...document.querySelectorAll<HTMLButtonElement>('.variety-commit-row button'),
    ].find((b) => b.textContent.trim() === 'Save language');
    if (!save) throw new Error('save button not found');
    await fireEvent.click(save);
  }

  it('shows the stored pattern, and saves a new one with its flags and minimum', async () => {
    seed({ regex: 'yeet', flags: 'i', minScore: 2 });
    render(Languages);
    await openEditor();
    await waitFor(() => expect(field(`detect-${ID}`).value).toBe('yeet'));
    expect(field(`detect-flags-${ID}`).value).toBe('i');
    expect(field(`detect-min-${ID}`).value).toBe('2');
    await fireEvent.input(field(`detect-${ID}`), { target: { value: '\bbussin\b' } });
    await fireEvent.input(field(`detect-min-${ID}`), { target: { value: '3' } });
    await clickSave();
    await waitFor(async () =>
      expect((await getCustomLanguages())[0]?.autoDetect).toEqual({
        regex: '\bbussin\b',
        flags: 'i',
        minScore: 3,
      }),
    );
  });

  it('removes the pattern when the field is emptied', async () => {
    seed({ regex: 'yeet', flags: 'i', minScore: 1 });
    render(Languages);
    await openEditor();
    await waitFor(() => expect(field(`detect-${ID}`).value).toBe('yeet'));
    await fireEvent.input(field(`detect-${ID}`), { target: { value: '' } });
    await clickSave();
    await waitFor(async () => expect((await getCustomLanguages())[0]?.autoDetect).toBeUndefined());
  });

  it('refuses a pattern that is not valid and keeps the stored one', async () => {
    seed({ regex: 'yeet', flags: 'i', minScore: 1 });
    const pushed: Array<{ message: string; variant?: string }> = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
    render(Languages);
    await openEditor();
    await waitFor(() => expect(field(`detect-${ID}`).value).toBe('yeet'));
    await fireEvent.input(field(`detect-${ID}`), { target: { value: '(unclosed' } });
    await clickSave();
    await waitFor(() => expect(pushed).toHaveLength(1));
    expect(pushed[0]?.variant).toBe('danger');
    expect(pushed[0]?.message).toMatch(/detection pattern for "Detect Lang" is not valid/);
    expect((await getCustomLanguages())[0]?.autoDetect?.regex).toBe('yeet');
  });
});

describe('Languages tab — share one language', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('a custom row exports its own file; a built-in row has no export', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake');
    URL.revokeObjectURL = vi.fn();
    const blobs: Blob[] = [];
    (URL.createObjectURL as Mock).mockImplementation((b: Blob) => {
      blobs.push(b);
      return 'blob:fake';
    });
    const names: string[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', {
          value: () => names.push((el as HTMLAnchorElement).download),
          configurable: true,
        });
      }
      return el;
    });
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      { id: 'share-id', label: 'Pirate Talk', hint: 'h', examples: [], createdAt: 1 },
    ]);
    render(Languages);
    const btn = await waitFor(() => {
      const b = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Export Pirate Talk to a file"]',
      );
      if (!b) throw new Error('no export button');
      return b;
    });
    expect(
      document.querySelectorAll('button[aria-label^="Export "][aria-label$=" to a file"]'),
    ).toHaveLength(1);
    await fireEvent.click(btn);
    await waitFor(() => expect(names).toHaveLength(1));
    expect(names[0]).toMatch(/^ega-language-pirate-talk-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(await (blobs[0] as Blob).text()) as {
      egaLanguage: { language: { id: string } };
    };
    expect(file.egaLanguage.language.id).toBe('share-id');
  });

  it('exporting a language another window deleted says so and drops the row', async () => {
    const pushSpy = vi.spyOn(toastStore, 'push');
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      { id: 'gone-id', label: 'Gone Talk', hint: 'h', examples: [], createdAt: 1 },
    ]);
    render(Languages);
    const btn = await waitFor(() => {
      const b = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Export Gone Talk to a file"]',
      );
      if (!b) throw new Error('no export button');
      return b;
    });
    chromeMock.storage.local._raw.set('ega.customLanguages', []);
    await fireEvent.click(btn);
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: '"Gone Talk" was deleted in another window.' }),
      ),
    );
    await waitFor(() =>
      expect(document.querySelector('button[aria-label="Export Gone Talk to a file"]')).toBeNull(),
    );
  });

  it('the Import button adds a one-language file next to the others', async () => {
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      { id: 'mine-id', label: 'Mine', hint: 'h', examples: [], createdAt: 1 },
    ]);
    render(Languages);
    const input = await waitFor(
      () => document.querySelector('input[type="file"]') as HTMLInputElement,
    );
    const file = new File(
      [
        JSON.stringify({
          egaLanguage: {
            v: 1,
            language: { id: 'theirs-id', label: 'Theirs', hint: 'h', examples: [], createdAt: 2 },
          },
        }),
      ],
      'language.json',
      { type: 'application/json' },
    );
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
    await waitFor(async () =>
      expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['mine-id', 'theirs-id']),
    );
  });
});

describe('Languages tab — row copy and the add entry point', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  function rowOf(label: string): Element | undefined {
    return [...document.querySelectorAll('.variety-row')].find((r) =>
      r.querySelector('.variety-label-inline')?.textContent.includes(label),
    );
  }

  it('spells out the example count, singular for one', async () => {
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      {
        id: 'one-ex-id',
        label: 'One Example',
        hint: 'h',
        examples: [{ src: 'a', tgt: 'b' }],
        createdAt: 1,
      },
      { id: 'no-ex-id', label: 'No Examples', hint: 'h', examples: [], createdAt: 2 },
    ]);
    render(Languages);
    await waitFor(() => expect(rowOf('One Example')).toBeDefined());
    expect(rowOf('One Example')?.querySelector('.variety-count')?.textContent.trim()).toBe(
      '1 example',
    );
    expect(rowOf('No Examples')?.querySelector('.variety-count')?.textContent.trim()).toBe(
      '0 examples',
    );
  });

  it('the list card says what the checkbox and the name do', async () => {
    const { findByRole } = render(Languages);
    const heading = await findByRole('heading', { level: 2, name: 'All languages' });
    const desc = heading.closest('header')?.querySelector('.ega-section-card-desc');
    expect(desc?.textContent).toMatch(/checkbox/i);
    expect(desc?.textContent).toMatch(/click a name/i);
  });

  it('offers a visible add button while there is no custom language, and it opens the form', async () => {
    const { findByRole } = render(Languages);
    const add = await findByRole('button', { name: 'Add your own language' });
    expect(document.querySelector('#new-hint')).toBeNull();
    await fireEvent.click(add);
    await waitFor(() => expect(document.querySelector('#new-hint')).not.toBeNull());
    // The button unmounts with the click, so focus has to land in the form, not on the page.
    await waitFor(() => expect(document.activeElement?.closest('.add-form')).not.toBeNull());
  });

  it('drops the visible add button once a custom language exists', async () => {
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      { id: 'mine-id', label: 'Mine', hint: 'h', examples: [], createdAt: 1 },
    ]);
    const { queryByRole } = render(Languages);
    await waitFor(() => expect(rowOf('Mine')).toBeDefined());
    expect(queryByRole('button', { name: 'Add your own language' })).toBeNull();
  });
});

describe('Languages tab — the row name and unsaved edits', () => {
  // Drafts live at module scope, so every test uses its own language id.
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  let id = '';
  let uid = 0;
  function seed(): void {
    uid += 1;
    id = `draft-${uid}`;
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      { id, label: `Draft Lang ${uid}`, hint: 'first hint', examples: [], createdAt: 1 },
    ]);
  }
  const rowEl = (): Element | undefined =>
    [...document.querySelectorAll('.variety-row')].find((r) =>
      r.textContent.includes(`Draft Lang ${uid}`),
    );
  const nameBtn = (): HTMLButtonElement => {
    const el = rowEl()?.querySelector<HTMLButtonElement>('button.variety-label-inline');
    if (!el) throw new Error('name button not found');
    return el;
  };
  const hint = (): HTMLTextAreaElement => {
    const el = document.getElementById(`hint-${id}`);
    if (!(el instanceof HTMLTextAreaElement)) throw new Error('hint field not found');
    return el;
  };

  it('clicking the name opens the editor and leaves the language enabled', async () => {
    seed();
    render(Languages);
    await waitFor(() => expect(rowEl()).toBeTruthy());
    const box = document.getElementById(`enable-${id}`) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await fireEvent.click(nameBtn());
    await waitFor(() => expect(hint().value).toBe('first hint'));
    expect(box.checked).toBe(true);
    expect(nameBtn().getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps an unsaved edit when the row closes, and tags the row', async () => {
    seed();
    render(Languages);
    await waitFor(() => expect(rowEl()).toBeTruthy());
    await fireEvent.click(nameBtn());
    await waitFor(() => expect(hint().value).toBe('first hint'));
    await fireEvent.input(hint(), { target: { value: 'edited hint' } });
    await waitFor(() => expect(rowEl()?.querySelector('.badge-unsaved')).toBeTruthy());

    await fireEvent.click(nameBtn());
    await waitFor(() => expect(document.getElementById(`hint-${id}`)).toBeNull());
    expect(rowEl()?.querySelector('.badge-unsaved')).toBeTruthy();

    await fireEvent.click(nameBtn());
    await waitFor(() => expect(hint().value).toBe('edited hint'));
  });

  it('Discard changes restores the saved hint and clears the tag', async () => {
    seed();
    render(Languages);
    await waitFor(() => expect(rowEl()).toBeTruthy());
    await fireEvent.click(nameBtn());
    await waitFor(() => expect(hint().value).toBe('first hint'));
    await fireEvent.input(hint(), { target: { value: 'edited hint' } });
    const discard = await waitFor(() => {
      const b = [
        ...document.querySelectorAll<HTMLButtonElement>('.variety-commit-row button'),
      ].find((x) => x.textContent.trim() === 'Discard changes');
      if (!b) throw new Error('discard button not found');
      return b;
    });
    await fireEvent.click(discard);
    await waitFor(() => expect(hint().value).toBe('first hint'));
    expect(rowEl()?.querySelector('.badge-unsaved')).toBeNull();
  });

  it('Save language clears the tag', async () => {
    seed();
    render(Languages);
    await waitFor(() => expect(rowEl()).toBeTruthy());
    await fireEvent.click(nameBtn());
    await waitFor(() => expect(hint().value).toBe('first hint'));
    await fireEvent.input(hint(), { target: { value: 'edited hint' } });
    await waitFor(() => expect(rowEl()?.querySelector('.badge-unsaved')).toBeTruthy());
    const save = [
      ...document.querySelectorAll<HTMLButtonElement>('.variety-commit-row button'),
    ].find((x) => x.textContent.trim() === 'Save language');
    if (!save) throw new Error('save button not found');
    await fireEvent.click(save);
    await waitFor(() => expect(rowEl()?.querySelector('.badge-unsaved')).toBeNull());
    expect((await getCustomLanguages())[0]?.hint).toBe('edited hint');
  });

  it('keeps an unsaved edit when the user leaves the tab and comes back', async () => {
    seed();
    const first = render(Languages);
    await waitFor(() => expect(rowEl()).toBeTruthy());
    await fireEvent.click(nameBtn());
    await waitFor(() => expect(hint().value).toBe('first hint'));
    await fireEvent.input(hint(), { target: { value: 'edited hint' } });
    first.unmount();
    await waitFor(() => expect(rowEl()).toBeUndefined());

    render(Languages);
    await waitFor(() => expect(rowEl()?.querySelector('.badge-unsaved')).toBeTruthy());
    await fireEvent.click(nameBtn());
    await waitFor(() => expect(hint().value).toBe('edited hint'));
  });

  it('asks before closing a row whose prompt has unsaved edits', async () => {
    seed();
    vi.mocked(confirmDialog).mockClear();
    render(Languages, { props: { s: await getSettings() } });
    await waitFor(() => expect(rowEl()).toBeTruthy());
    await fireEvent.click(nameBtn());
    const open = await waitFor(() => {
      const b = rowEl()?.querySelector<HTMLButtonElement>('[data-ega-variety-prompt-open]');
      if (!b) throw new Error('prompt open button not found');
      return b;
    });
    await fireEvent.click(open);
    const user = await waitFor(
      () => {
        const el = rowEl()?.querySelector<HTMLTextAreaElement>('[data-ega-template-user] textarea');
        if (!el) throw new Error('prompt editor not found');
        return el;
      },
      { timeout: 5_000 },
    );
    await fireEvent.input(user, { target: { value: 'My prompt {{text}}' } });
    await waitFor(() => expect(rowEl()?.querySelector('.badge-unsaved')).toBeTruthy());

    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await fireEvent.click(nameBtn());
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(user.isConnected).toBe(true);
    expect(user.value).toBe('My prompt {{text}}');

    await fireEvent.click(nameBtn());
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(user.isConnected).toBe(false));
    expect(rowEl()?.querySelector('.badge-unsaved')).toBeNull();
  });
});
