// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../../mocks/chrome';
import { parseSettings, GLOSSARY_MAX } from '@/shared/settings-schema';
import { getSettings } from '@/shared/storage';
import { toastStore } from '@/shared/components/toastStore';
import { GOTO_EVENT } from '@/options/deep-link';
import type { Settings } from '@/shared/types';

import Glossary from '@/options/tabs/Glossary.svelte';

const SETTINGS_KEY = 'ega.settings';

type Entry = { term: string; translation: string; caseSensitive: boolean };

function seedGlossary(glossary: Entry[], over: Partial<Settings> = {}): Settings {
  const s = { ...parseSettings({}), ...over, glossary } as Settings;
  chromeMock.storage.local._raw.set(SETTINGS_KEY, s);
  return s;
}

/** term-0 … term-(n-1); the filter box only renders above 10 entries. */
function seedEntries(count: number): Settings {
  return seedGlossary(
    Array.from({ length: count }, (_, i) => ({
      term: `term-${i}`,
      translation: `trans-${i}`,
      caseSensitive: false,
    })),
  );
}

function mount(s: Settings | null = null) {
  return render(Glossary, { props: { s, onSetSettings: () => {} } });
}

/** The add row at the top of the Glossary card. */
function addRow(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-ega-glossary-add]');
  if (!el) throw new Error('no add row');
  return el;
}

async function openRow(term: string): Promise<HTMLElement> {
  const edit = await waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[aria-label="Edit entry ${term}"]`);
    if (!el) throw new Error(`no row ${term}`);
    return el;
  });
  await fireEvent.click(edit);
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>('[data-ega-glossary-editor]');
    if (!el) throw new Error('editor did not open');
    return el;
  });
}

beforeEach(() => {
  resetChromeMock();
  vi.restoreAllMocks();
});

describe('Glossary card — adding', () => {
  it('Add stays enabled; an empty field says what to write and nothing is stored', async () => {
    seedGlossary([]);
    const { getByRole } = mount();
    const add = getByRole('button', { name: 'Add' });
    expect(add.hasAttribute('disabled')).toBe(false);
    await fireEvent.click(add);
    const term = within(addRow()).getByLabelText('Term');
    const translation = within(addRow()).getByLabelText('Translation');
    expect(term.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(term.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Write a term',
    );
    expect(
      document
        .getElementById(translation.getAttribute('aria-describedby') ?? '')
        ?.textContent.trim(),
    ).toBe('Write a translation');
    await waitFor(() => expect(document.activeElement).toBe(term));
    expect((await getSettings()).glossary).toEqual([]);
  });

  it('adds an entry, clears the term and translation, and focuses Term for the next one', async () => {
    seedGlossary([]);
    const { getByRole } = mount();
    const term = within(addRow()).getByLabelText('Term') as HTMLInputElement;
    expect(term.placeholder).toBe('e.g. Firebolt');
    await fireEvent.input(term, { target: { value: 'Firebolt' } });
    await fireEvent.input(within(addRow()).getByLabelText('Translation'), {
      target: { value: 'Saeta de Fuego' },
    });
    await fireEvent.click(getByRole('button', { name: 'Add' }));
    await waitFor(async () =>
      expect((await getSettings()).glossary).toEqual([
        { term: 'Firebolt', translation: 'Saeta de Fuego', caseSensitive: false },
      ]),
    );
    await waitFor(() => expect(term.value).toBe(''));
    expect(document.activeElement).toBe(term);
  });

  it('refuses a duplicate term in the same scope, case-insensitively', async () => {
    seedEntries(2);
    const { getByRole, findByRole } = mount();
    await waitFor(() => expect(document.querySelectorAll('.glossary-row')).toHaveLength(2));
    await fireEvent.input(within(addRow()).getByLabelText('Term'), { target: { value: 'TERM-0' } });
    await fireEvent.input(within(addRow()).getByLabelText('Translation'), {
      target: { value: 'other' },
    });
    await fireEvent.click(getByRole('button', { name: 'Add' }));
    expect((await findByRole('alert')).textContent).toBe(
      'TERM-0 is already in the glossary for this scope',
    );
    expect((await getSettings()).glossary).toHaveLength(2);
  });

  it.each([
    ['a term that differs only in case when just one side matches case', 'Apple', true, 'apple'],
    // Stored composed (NFC), typed decomposed (NFD): the same text to a reader.
    ['the same word written with a combining accent', 'Café', false, 'Café'],
  ])('refuses %s', async (_name, stored, caseSensitive, typed) => {
    seedGlossary([{ term: stored, translation: 'x', caseSensitive }]);
    const { getByRole, findByRole } = mount();
    await waitFor(() => expect(document.querySelectorAll('.glossary-row')).toHaveLength(1));
    await fireEvent.input(within(addRow()).getByLabelText('Term'), { target: { value: typed } });
    await fireEvent.input(within(addRow()).getByLabelText('Translation'), {
      target: { value: 'other' },
    });
    await fireEvent.click(getByRole('button', { name: 'Add' }));
    expect((await findByRole('alert')).textContent).toMatch(/already in the glossary/);
    expect((await getSettings()).glossary).toHaveLength(1);
  });

  it('caps the term and translation fields at the stored limit while typing', () => {
    seedGlossary([]);
    mount();
    expect(within(addRow()).getByLabelText('Term').getAttribute('maxlength')).toBe('100');
    expect(within(addRow()).getByLabelText('Translation').getAttribute('maxlength')).toBe('100');
  });

  it(`at ${GLOSSARY_MAX} entries Add stays focusable, says why, and adds nothing`, async () => {
    seedEntries(GLOSSARY_MAX);
    const { getByRole } = mount();
    await waitFor(() =>
      expect(getByRole('button', { name: 'Add' }).getAttribute('aria-disabled')).toBe('true'),
    );
    const add = getByRole('button', { name: 'Add' });
    expect(document.getElementById(add.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      `The glossary holds ${GLOSSARY_MAX} entries, the most Ega keeps`,
    );
    await fireEvent.input(within(addRow()).getByLabelText('Term'), {
      target: { value: 'One more' },
    });
    await fireEvent.input(within(addRow()).getByLabelText('Translation'), {
      target: { value: 'x' },
    });
    await fireEvent.click(add);
    expect((await getSettings()).glossary).toHaveLength(GLOSSARY_MAX);
  }, 20_000);
});

describe('Glossary card — More options', () => {
  it('offers Auto-detect and the varieties as a source, and never Auto-detect as a target', async () => {
    seedGlossary([]);
    const { getAllByLabelText } = mount();
    const [source] = getAllByLabelText('Source language') as HTMLSelectElement[];
    await waitFor(() => {
      const values = Array.from(source?.options ?? []).map((o) => o.value);
      expect(values).toContain('auto');
      expect(values).toContain('arabizi');
    });
    const [target] = getAllByLabelText('Target language') as HTMLSelectElement[];
    expect(Array.from(target?.options ?? []).map((o) => o.value)).not.toContain('auto');
  });

  it('says a source-scoped entry needs that source picked while the default is Auto-detect', async () => {
    const s = seedGlossary([], { defaultLang: 'auto' } as Partial<Settings>);
    const { getAllByLabelText, container } = mount(s);
    const [source] = getAllByLabelText('Source language') as HTMLSelectElement[];
    expect(container.querySelector('[data-ega-glossary-scope-note]')).toBeNull();
    await fireEvent.change(source as HTMLSelectElement, { target: { value: 'es' } });
    await waitFor(() =>
      expect(container.querySelector('[data-ega-glossary-scope-note]')?.textContent).toBe(
        'Applies only when you pick Spanish as the source',
      ),
    );
  });

  it('an entry scoped to Auto-detect survives the settings parse', async () => {
    seedGlossary([]);
    const { getAllByLabelText, getByRole } = mount();
    await fireEvent.input(within(addRow()).getByLabelText('Term'), {
      target: { value: 'Firebolt' },
    });
    await fireEvent.input(within(addRow()).getByLabelText('Translation'), {
      target: { value: 'Saeta' },
    });
    const [source] = getAllByLabelText('Source language') as HTMLSelectElement[];
    await waitFor(() =>
      expect(Array.from(source?.options ?? []).map((o) => o.value)).toContain('auto'),
    );
    await fireEvent.change(source as HTMLSelectElement, { target: { value: 'auto' } });
    await fireEvent.click(getByRole('button', { name: 'Add' }));
    await waitFor(async () => {
      const stored = await getSettings();
      expect(stored.glossary.find((e) => e.term === 'Firebolt')?.sourceLang).toBe('auto');
    });
  });
});

describe('Glossary card — Used by', () => {
  it('names the tasks with Use glossary on, and Change goes to Tasks', async () => {
    const s = seedGlossary([]);
    const goto = vi.fn();
    document.addEventListener(GOTO_EVENT, goto as EventListener);
    const { container, getByRole } = mount(s);
    const row = container.querySelector('[data-ega-glossary-used-by]');
    expect(row?.textContent).toContain('Translate, Explain');
    await fireEvent.click(getByRole('button', { name: 'Change which tasks use the glossary' }));
    expect((goto.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      tab: 'tasks',
      entryId: 'tasks.overrides',
    });
    document.removeEventListener(GOTO_EVENT, goto as EventListener);
  });

  it('says so when no task uses it', () => {
    const base = parseSettings({});
    const s = seedGlossary([], {
      taskOverrides: { translate: { glossary: false }, explain: { glossary: false } },
    } as Partial<Settings>);
    void base;
    const { container } = mount(s);
    expect(container.querySelector('[data-ega-glossary-used-by]')?.textContent).toContain(
      'No task uses it yet',
    );
  });
});

describe('Glossary card — the list', () => {
  it('shows an empty state with no button when there are no entries', () => {
    seedGlossary([]);
    const { container } = mount();
    const empty = container.querySelector('[data-ega-empty-state]');
    expect(empty?.textContent).toContain('No glossary entries yet');
    expect(empty?.textContent).toContain(
      'Add names and terms that must translate the same way every time',
    );
    expect(empty?.querySelector('button')).toBeNull();
  });

  it('a row reads Term → Translation, then the scope and Match case', async () => {
    seedGlossary([{ term: 'Firebolt', translation: 'Saeta', caseSensitive: true }]);
    const { container } = mount();
    const row = await waitFor(() => {
      const el = container.querySelector('.glossary-row');
      if (!el) throw new Error('no row');
      return el;
    });
    expect(row.textContent.replace(/\s+/g, ' ')).toContain('Firebolt → Saeta');
    expect(row.textContent).toContain('Match case');
    expect(row.textContent).toContain('Any');
  });

  it('names the filter input and narrows the rows as the user types', async () => {
    seedEntries(11);
    mount();
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('.glossary-filter input');
      if (!el) throw new Error('filter input not found');
      return el;
    });
    expect(input.getAttribute('aria-label')).toBe('Filter glossary entries');
    expect(document.querySelectorAll('.glossary-row')).toHaveLength(11);
    await fireEvent.input(input, { target: { value: 'term-10' } });
    await waitFor(() => {
      const rows = document.querySelectorAll('.glossary-row');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('term-10');
    });
  });
});

describe('Glossary card — editing a row', () => {
  it('Edit opens the fields under the row, focuses Term, and becomes Close', async () => {
    seedEntries(2);
    mount();
    const editor = await openRow('term-1');
    const edit = document.querySelector('[aria-label="Close entry term-1"]');
    expect(edit?.getAttribute('aria-expanded')).toBe('true');
    expect(edit?.textContent.trim()).toBe('Close');
    await waitFor(() => expect(document.activeElement).toBe(within(editor).getByLabelText('Term')));
  });

  it('a field writes when it is left, in place, and the row stays open', async () => {
    seedEntries(3);
    mount();
    const editor = await openRow('term-1');
    const translation = within(editor).getByLabelText('Translation');
    await fireEvent.input(translation, { target: { value: 'fixed' } });
    await fireEvent.blur(translation);
    await waitFor(async () =>
      expect((await getSettings()).glossary.map((e) => [e.term, e.translation])).toEqual([
        ['term-0', 'trans-0'],
        ['term-1', 'fixed'],
        ['term-2', 'trans-2'],
      ]),
    );
    await waitFor(() => expect(editor.textContent).toContain('Saved'));
    expect(document.querySelector('[data-ega-glossary-editor]')).not.toBeNull();
  });

  it('Esc writes the field being typed, closes, and returns focus to Edit', async () => {
    seedEntries(2);
    mount();
    const editor = await openRow('term-0');
    const translation = within(editor).getByLabelText('Translation');
    await fireEvent.input(translation, { target: { value: 'typed' } });
    await fireEvent.keyDown(translation, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[data-ega-glossary-editor]')).toBeNull());
    expect((await getSettings()).glossary[0]?.translation).toBe('typed');
    expect(document.activeElement).toBe(document.querySelector('[aria-label="Edit entry term-0"]'));
  });

  it('an empty term is refused in place', async () => {
    seedEntries(1);
    const { findByRole } = mount();
    const editor = await openRow('term-0');
    const term = within(editor).getByLabelText('Term');
    await fireEvent.input(term, { target: { value: ' ' } });
    await fireEvent.blur(term);
    expect((await findByRole('alert')).textContent).toBe('Write a term');
    expect((await getSettings()).glossary[0]?.term).toBe('term-0');
  });

  describe('beside a near-duplicate', () => {
    function seedPair(): void {
      // Two entries the duplicate rule calls the same term; older data can hold both.
      seedGlossary([
        { term: 'Apple', translation: 'x', caseSensitive: true },
        { term: 'apple', translation: 'y', caseSensitive: false },
        { term: 'Pear', translation: 'z', caseSensitive: false },
      ]);
    }

    it('saves an edit to one of the pair', async () => {
      seedPair();
      mount();
      const editor = await openRow('Apple');
      const translation = within(editor).getByLabelText('Translation');
      await fireEvent.input(translation, { target: { value: 'fixed' } });
      await fireEvent.blur(translation);
      await waitFor(async () =>
        expect((await getSettings()).glossary.map((e) => e.translation)).toEqual([
          'fixed',
          'y',
          'z',
        ]),
      );
    });

    it('still refuses an edit that makes a new duplicate', async () => {
      seedPair();
      const { findByRole } = mount();
      const editor = await openRow('Pear');
      const term = within(editor).getByLabelText('Term');
      await fireEvent.input(term, { target: { value: 'APPLE' } });
      await fireEvent.blur(term);
      expect((await findByRole('alert')).textContent).toMatch(/already in the glossary/);
      expect((await getSettings()).glossary.map((e) => e.term)).toEqual(['Apple', 'apple', 'Pear']);
    });
  });
});

describe('Glossary card — Delete entry', () => {
  it.each([
    ['term-1', 'Edit entry term-2'],
    ['term-2', 'Edit entry term-1'],
  ])('deleting %s puts focus on "%s"', async (term, expected) => {
    vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    seedEntries(3);
    const { getByRole } = mount();
    const editor = await openRow(term);
    await fireEvent.click(within(editor).getByRole('button', { name: `Delete entry ${term}` }));
    await waitFor(async () => expect((await getSettings()).glossary).toHaveLength(2));
    await waitFor(() =>
      expect(document.activeElement).toBe(getByRole('button', { name: expected })),
    );
  });

  it('deleting the last entry puts focus on Add', async () => {
    vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    seedEntries(1);
    const { getByRole } = mount();
    const editor = await openRow('term-0');
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete entry term-0' }));
    await waitFor(() => expect(document.activeElement).toBe(getByRole('button', { name: 'Add' })));
  });

  it('says Deleted "term" with Undo, which puts it back in place and focuses it', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    seedEntries(3);
    mount();
    const editor = await openRow('term-1');
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete entry term-1' }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const toast = push.mock.calls[0]?.[0];
    expect(toast?.message).toBe('Deleted "term-1"');
    expect(toast?.action?.label).toBe('Undo');
    toast?.action?.onClick();
    await waitFor(async () =>
      expect((await getSettings()).glossary.map((e) => e.term)).toEqual([
        'term-0',
        'term-1',
        'term-2',
      ]),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[aria-label="Edit entry term-1"]'),
      ),
    );
  });

  it('a delete that did not land keeps focus on the row now at that place', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    seedEntries(2);
    const { getByRole } = mount();
    const editor = await openRow('term-0');
    // Another window removed it first, so this tab's write finds nothing to remove.
    seedGlossary([{ term: 'term-1', translation: 'trans-1', caseSensitive: false }]);
    await fireEvent.click(within(editor).getByRole('button', { name: 'Delete entry term-0' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(getByRole('button', { name: 'Edit entry term-1' })),
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Glossary and rules tab — the other cards', () => {
  it('holds the Rules card, with the tab task list', async () => {
    const s = seedGlossary([]);
    const { container } = mount(s);
    expect(container.querySelector('[data-ega-setting="tasks.rules"]')).not.toBeNull();
    expect(container.textContent).toContain('No rules yet');
  });

  it('Export glossary stays focusable with "Nothing to export yet" while the glossary is empty', () => {
    seedGlossary([]);
    const { getByRole } = mount();
    const exp = getByRole('button', { name: /Export glossary/ });
    expect(exp.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(exp.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Nothing to export yet',
    );
  });

  describe('rules scoped to your own task', () => {
    const legal = {
      label: 'Legal',
      system: '',
      user: '{{text}}',
      output: 'plain' as const,
      pageContext: false,
      image: false,
      glossary: false,
    };
    const scopedRules = (id: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        body: `Rule ${i}: ${'cite the clause number every time. '.repeat(14)}`.slice(0, 480),
        category: 'always' as const,
        scope: { tasks: [id] },
        source: 'manual' as const,
        addedAt: '2026-10-02T00:00:00.000Z',
        enabled: true,
      }));

    it('count toward the over-budget warning', async () => {
      const { addCustomTask } = await import('@/shared/tasks');
      const { updateSettings } = await import('@/shared/storage');
      const added = await addCustomTask(legal);
      const cur = await getSettings();
      const s = await updateSettings({
        advanced: { ...cur.advanced, rules: scopedRules(added.id, 20) },
      });
      const { container } = mount(s);
      await waitFor(() =>
        expect(container.querySelector('[data-ega-rules-budget-warn]')).not.toBeNull(),
      );
    });

    it('show the task name the tab has now, not the one it had when it opened', async () => {
      const { addCustomTask, updateCustomTask } = await import('@/shared/tasks');
      const { updateSettings } = await import('@/shared/storage');
      const added = await addCustomTask(legal);
      const cur = await getSettings();
      const s = await updateSettings({
        advanced: { ...cur.advanced, rules: scopedRules(added.id, 1) },
      });
      const { container } = mount(s);
      const meta = () => container.querySelector('[data-ega-rule-meta]')?.textContent ?? '';
      await waitFor(() => expect(meta()).toContain('Legal'));
      await updateCustomTask(added.id, { ...legal, label: 'Contracts' });
      await waitFor(() => expect(meta()).toContain('Contracts'));
    });
  });
});
