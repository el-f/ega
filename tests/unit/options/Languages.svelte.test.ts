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
import { getCustomLanguages } from '@/shared/storage';

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
            id: 'imp-test-id',
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
      expect(stored.some((c) => c.id === 'imp-test-id')).toBe(true);
    });

    const stored = await getCustomLanguages();
    expect(stored.find((c) => c.id === 'imp-test-id')?.label).toBe('Imported Lang');
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
        customLanguages: [twice('dup-id', 'First'), twice('dup-id', 'Second')],
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
    expect(stored.filter((c) => c.id === 'dup-id')).toHaveLength(1);
  });
});

describe('Languages tab — kind badge display copy', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('built-in varieties show "Built-in", not the raw enum', async () => {
    render(Languages);
    await waitFor(() => {
      expect(document.querySelectorAll('.variety-row').length).toBeGreaterThan(0);
    });
    const badges = [...document.querySelectorAll('.badge')].map((b) => b.textContent.trim());
    expect(badges).toContain('Built-in');
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
