// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { toastStore } from '@/shared/components/toastStore';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import {
  CUSTOM_LANG_EXAMPLES_MAX,
  VARIETY_EXAMPLE_MAX,
  VARIETY_HINT_MAX,
} from '@/shared/settings-schema';
import { getCustomLanguages, getSettings } from '@/shared/storage';
import { listVarieties } from '@/shared/varieties';
import type { Settings, Variety } from '@/shared/types';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));
const download = vi.fn();
vi.mock('@/shared/download-file', () => ({
  downloadJsonFile: (...a: unknown[]) => download(...a),
}));

const LanguageDialog = (await import('@/options/components/LanguageDialog.svelte')).default;

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
  download.mockClear();
});

async function variety(id: string): Promise<Variety> {
  const v = (await listVarieties({ enabledOnly: false })).find((x) => x.id === id);
  if (!v) throw new Error(`no variety ${id}`);
  return v;
}

async function open(id: string | null, over: Partial<Settings> = {}) {
  const s = { ...(await getSettings()), ...over } as Settings;
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const language = id === null ? null : await variety(id);
  const utils = render(LanguageDialog, { props: { s, language, onClose, onSaved } });
  return { ...utils, onClose, onSaved };
}

function field(sel: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(sel);
  if (!el) throw new Error(`no ${sel}`);
  return el;
}
const status = (): string =>
  document.querySelector('[data-ega-dialog-status]')?.textContent.trim() ?? '';
const done = (): Promise<boolean> =>
  fireEvent.click(document.querySelector('[data-ega-dialog-done]') as HTMLElement);

describe('LanguageDialog — a new language', () => {
  it('says what it needs, then saves itself once it has a name and notes', async () => {
    const { onSaved } = await open(null);
    expect(status()).toBe('Not saved yet: add a name');
    await fireEvent.input(field('[data-ega-language-name] , [data-ega-language-name] input'), {
      target: { value: 'Pirate' },
    });
    expect(status()).toBe('Not saved yet: add notes');
    await fireEvent.input(field('[data-ega-language-notes]'), {
      target: { value: 'Talks like a pirate' },
    });
    await waitFor(async () =>
      expect((await getCustomLanguages()).map((c) => [c.label, c.hint])).toEqual([
        ['Pirate', 'Talks like a pirate'],
      ]),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('closing a started language that cannot be saved asks first', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const { onClose } = await open(null);
    await fireEvent.input(field('[data-ega-language-name] , [data-ega-language-name] input'), {
      target: { value: 'Half' },
    });
    await done();
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(vi.mocked(confirmDialog).mock.calls[0]?.[0].title).toBe('Discard this language?');
    expect(onClose).not.toHaveBeenCalled();
    expect(await getCustomLanguages()).toEqual([]);
  });

  it('a hidden new language is created hidden', async () => {
    await open(null);
    await fireEvent.click(field('[data-ega-language-shown]'));
    await fireEvent.input(field('[data-ega-language-name] , [data-ega-language-name] input'), {
      target: { value: 'Quiet' },
    });
    await fireEvent.input(field('[data-ega-language-notes]'), { target: { value: 'Shh' } });
    await done();
    await waitFor(async () => expect(await getCustomLanguages()).toHaveLength(1));
    const id = (await getCustomLanguages())[0]?.id ?? '';
    await waitFor(async () => expect((await getSettings()).disabledVarieties).toContain(id));
  });
});

describe('LanguageDialog — fields of a custom language', () => {
  beforeEach(() => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
  });

  it('notes save when typing pauses; Done saves what is still waiting', async () => {
    await open(CUSTOM.id);
    const notes = field('[data-ega-language-notes]');
    expect(notes.getAttribute('maxlength')).toBe(String(VARIETY_HINT_MAX));
    await fireEvent.input(notes, { target: { value: 'new notes' } });
    expect(document.body.textContent).toContain(`9 / ${VARIETY_HINT_MAX}`);
    await done();
    await waitFor(async () => expect((await getCustomLanguages())[0]?.hint).toBe('new notes'));
  });

  it('an empty name is not saved, and the status says so', async () => {
    await open(CUSTOM.id);
    await fireEvent.input(field('[data-ega-language-name] , [data-ega-language-name] input'), {
      target: { value: ' ' },
    });
    await waitFor(() => expect(status()).toBe('Not saved: add a name'));
    expect((await getCustomLanguages())[0]?.label).toBe('My Slang');
  });

  it('examples: headed Original and Translation, named per row, blank rows not stored', async () => {
    const { getByRole } = await open(CUSTOM.id);
    expect(document.body.textContent).toContain('Original');
    const first = getByRole('textbox', { name: 'Example 1, original' });
    expect(first.getAttribute('maxlength')).toBe(String(VARIETY_EXAMPLE_MAX));
    await fireEvent.click(getByRole('button', { name: 'Add example' }));
    const second = getByRole('textbox', { name: 'Example 2, original' });
    await waitFor(() => expect(document.activeElement).toBe(second));
    await fireEvent.input(getByRole('textbox', { name: 'Example 2, translation' }), {
      target: { value: 'bye' },
    });
    await done();
    await waitFor(async () =>
      expect((await getCustomLanguages())[0]?.examples).toEqual([
        { src: 'yo', tgt: 'hi' },
        { src: '', tgt: 'bye' },
      ]),
    );
  });

  it('Remove example takes that row out', async () => {
    const { getByRole } = await open(CUSTOM.id);
    await fireEvent.click(getByRole('button', { name: 'Remove example 1' }));
    await done();
    await waitFor(async () => expect((await getCustomLanguages())[0]?.examples).toEqual([]));
  });

  it(`at ${CUSTOM_LANG_EXAMPLES_MAX} examples, Add example stays focusable and says why`, async () => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [
      {
        ...CUSTOM,
        examples: Array.from({ length: CUSTOM_LANG_EXAMPLES_MAX }, (_, i) => ({
          src: `s${i}`,
          tgt: `t${i}`,
        })),
      },
    ]);
    const { getByRole } = await open(CUSTOM.id);
    const add = getByRole('button', { name: 'Add example' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(add.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      `You have the most examples Ega keeps (${CUSTOM_LANG_EXAMPLES_MAX})`,
    );
    await fireEvent.click(add);
    expect(document.querySelectorAll('[data-ega-language-example]')).toHaveLength(
      CUSTOM_LANG_EXAMPLES_MAX,
    );
  });

  it('Show in language pickers writes the hidden list', async () => {
    await open(CUSTOM.id);
    await fireEvent.click(field('[data-ega-language-shown]'));
    await waitFor(async () => expect((await getSettings()).disabledVarieties).toContain(CUSTOM.id));
  });
});

describe('LanguageDialog — the auto-detect pattern', () => {
  beforeEach(() => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
  });

  async function setPattern(regex: string, flags?: string, min?: string): Promise<void> {
    const body = document.querySelector('[data-ega-language-detect]') as HTMLDetailsElement;
    body.open = true;
    const inputs = body.querySelectorAll<HTMLInputElement>('input');
    await fireEvent.input(inputs[0] as HTMLInputElement, { target: { value: regex } });
    if (flags !== undefined)
      await fireEvent.input(inputs[1] as HTMLInputElement, { target: { value: flags } });
    if (min !== undefined)
      await fireEvent.input(inputs[2] as HTMLInputElement, { target: { value: min } });
  }

  it('saves a pattern with its flags and minimum, and an empty one removes it', async () => {
    await open(CUSTOM.id);
    await setPattern('\\byo\\b', 'gi', '2');
    await done();
    await waitFor(async () =>
      expect((await getCustomLanguages())[0]?.autoDetect).toEqual({
        regex: '\\byo\\b',
        flags: 'gi',
        minScore: 2,
      }),
    );
  });

  it('a pattern that is not valid is marked, named, and not saved', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const { onClose } = await open(CUSTOM.id);
    await setPattern('(oops');
    const pattern = document.querySelector('[data-ega-language-detect] input') as HTMLInputElement;
    expect(pattern.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(pattern.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('This pattern is not valid. Check the brackets and slashes.');
    await done();
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect((await getCustomLanguages())[0]?.autoDetect).toBeUndefined();
  });

  it('a pattern that can freeze the page is refused in place', async () => {
    await open(CUSTOM.id);
    await setPattern('(a+)+$');
    await done();
    await waitFor(() =>
      expect(document.body.textContent).toContain('This pattern can take too long'),
    );
    expect((await getCustomLanguages())[0]?.autoDetect).toBeUndefined();
  });
});

describe('LanguageDialog — delete and export (custom only)', () => {
  beforeEach(() => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
  });

  it('Delete language closes, says Deleted with Undo, and Undo puts it back', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { onClose } = await open(CUSTOM.id);
    await fireEvent.click(field('[data-ega-language-delete]'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await getCustomLanguages()).toEqual([]);
    const toast = push.mock.calls[0]?.[0];
    expect(toast?.message).toBe('Deleted "My Slang"');
    toast?.action?.onClick();
    await waitFor(async () => expect((await getCustomLanguages())[0]?.id).toBe(CUSTOM.id));
  });

  it('Export downloads a one-language file and says so', async () => {
    await open(CUSTOM.id);
    await fireEvent.click(field('[data-ega-language-export]'));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download.mock.calls[0]?.[0]).toMatch(/^ega-language-my-slang-\d{4}-\d{2}-\d{2}\.json$/);
    expect(status()).toBe('Exported to a file');
  });
});

describe('LanguageDialog — a built-in language', () => {
  it('has no name field, delete or export; Reset language shows once it is edited', async () => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
      ...DEFAULT_SETTINGS,
      varietyOverrides: { arabizi: { hint: 'my notes' } },
    });
    const { getByRole } = await open('arabizi');
    expect(document.querySelector('[data-ega-language-name]')).toBeNull();
    expect(document.querySelector('[data-ega-language-delete]')).toBeNull();
    expect(document.querySelector('[data-ega-language-export]')).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Reset language' }));
    await waitFor(() => expect(status()).toContain('Back to built-in'));
    expect((await getSettings()).varietyOverrides['arabizi']).toBeUndefined();
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Undo'));
    await fireEvent.click(document.activeElement as HTMLElement);
    await waitFor(async () =>
      expect((await getSettings()).varietyOverrides['arabizi']?.hint).toBe('my notes'),
    );
  });
});

describe('LanguageDialog — another window', () => {
  beforeEach(() => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
  });

  it('a field changed elsewhere stops the save and offers Reload language', async () => {
    const { getByRole } = await open(CUSTOM.id);
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [
      { ...CUSTOM, hint: 'changed elsewhere' },
    ]);
    await fireEvent.input(field('[data-ega-language-notes]'), { target: { value: 'mine' } });
    await done();
    await waitFor(() =>
      expect(document.querySelector('[data-ega-language-conflict]')?.textContent).toContain(
        'Changed in another window',
      ),
    );
    expect((await getCustomLanguages())[0]?.hint).toBe('changed elsewhere');
    await fireEvent.click(getByRole('button', { name: 'Reload language' }));
    await waitFor(() => expect(field('[data-ega-language-notes]').value).toBe('changed elsewhere'));
    expect(document.querySelector('[data-ega-language-conflict]')).toBeNull();
  });

  it('a language deleted elsewhere says so and writes nothing back', async () => {
    await open(CUSTOM.id);
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, []);
    await fireEvent.input(field('[data-ega-language-notes]'), { target: { value: 'mine' } });
    await done();
    await waitFor(() =>
      expect(document.body.textContent).toContain('This language was deleted in another window'),
    );
    expect(await getCustomLanguages()).toEqual([]);
  });
});

describe('LanguageDialog — prompt', () => {
  beforeEach(() => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
  });

  it('uses the Translate prompt until "Use its own prompt", whose edits store only what differs', async () => {
    const { getByRole } = await open(CUSTOM.id);
    expect(
      (getByRole('radio', { name: 'Use the Translate prompt' }) as HTMLElement).getAttribute(
        'aria-checked',
      ),
    ).toBe('true');
    expect(document.querySelector('[data-ega-prompt-editor]')).toBeNull();
    await fireEvent.click(getByRole('radio', { name: 'Use its own prompt' }));
    const sys = await waitFor(() => field('[data-ega-template-system] textarea'));
    await fireEvent.input(sys, { target: { value: 'Pirate system' } });
    await done();
    await waitFor(async () =>
      expect((await getSettings()).advanced.perPresetTemplates[CUSTOM.id]).toEqual({
        system: 'Pirate system',
      }),
    );
  });

  it('going back to the Translate prompt removes its own at once, with Undo', async () => {
    const cur = await getSettings();
    chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
      ...cur,
      advanced: { ...cur.advanced, perPresetTemplates: { [CUSTOM.id]: { system: 'Own' } } },
    });
    const { getByRole } = await open(CUSTOM.id);
    await fireEvent.click(getByRole('radio', { name: 'Use the Translate prompt' }));
    await waitFor(async () =>
      expect((await getSettings()).advanced.perPresetTemplates[CUSTOM.id]).toBeUndefined(),
    );
    expect(status()).toContain('Uses the Translate prompt');
    await fireEvent.click(document.querySelector('[data-ega-dialog-undo]') as HTMLElement);
    await waitFor(async () =>
      expect((await getSettings()).advanced.perPresetTemplates[CUSTOM.id]).toEqual({
        system: 'Own',
      }),
    );
  });
});
