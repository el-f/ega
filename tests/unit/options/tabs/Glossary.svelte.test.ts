// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { getSettings } from '@/shared/storage';

import Glossary from '@/options/tabs/Glossary.svelte';

const SETTINGS_KEY = 'ega.settings';

/** The filter box only renders above 10 entries. */
function seedEntries(count: number): void {
  const glossary = Array.from({ length: count }, (_, i) => ({
    term: `term-${i}`,
    translation: `trans-${i}`,
    caseSensitive: false,
  }));
  chromeMock.storage.local._raw.set(SETTINGS_KEY, { ...parseSettings({}), glossary });
}

describe('Glossary tab — scope picker', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('offers Auto-detect and the varieties as a source scope, and names the trap', async () => {
    chromeMock.storage.local._raw.set(SETTINGS_KEY, parseSettings({}));
    render(Glossary);

    const select = await waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>('[aria-label="Source language scope"]');
      if (!el) throw new Error('source scope select not found');
      return el;
    });
    await waitFor(() => {
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toContain('auto');
      expect(values).toContain('arabizi');
    });

    // Target is never 'auto' at request time, so offering it there would be a dead choice.
    const target = document.querySelector<HTMLSelectElement>(
      '[aria-label="Target language scope"]',
    );
    expect(Array.from(target?.options ?? []).map((o) => o.value)).not.toContain('auto');

    expect(document.querySelector('[data-ega-glossary-scope-help]')?.textContent).toMatch(
      /Auto-detect/i,
    );
  });

  it('an entry scoped to Auto-detect survives the settings parse', async () => {
    chromeMock.storage.local._raw.set(SETTINGS_KEY, parseSettings({}));
    const { getByLabelText, getByRole } = render(Glossary);

    await fireEvent.input(getByLabelText('Term'), { target: { value: 'Firebolt' } });
    await fireEvent.input(getByLabelText('Translation'), { target: { value: 'Saeta' } });
    const select = document.querySelector<HTMLSelectElement>(
      '[aria-label="Source language scope"]',
    );
    if (!select) throw new Error('source scope select not found');
    await waitFor(() => expect(Array.from(select.options).map((o) => o.value)).toContain('auto'));
    await fireEvent.change(select, { target: { value: 'auto' } });
    await fireEvent.click(getByRole('button', { name: /Add entry/i }));

    await waitFor(async () => {
      const stored = await getSettings();
      expect(stored.glossary.find((e) => e.term === 'Firebolt')?.sourceLang).toBe('auto');
    });
  });
});

describe('Glossary tab — filter box', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('names the filter input for assistive tech', async () => {
    seedEntries(11);
    render(Glossary);

    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('.glossary-filter input');
      if (!el) throw new Error('filter input not found');
      return el;
    });
    expect(input.getAttribute('aria-label')).toBe('Filter glossary entries');
  });

  it('narrows the rendered rows as the user types', async () => {
    seedEntries(11);
    render(Glossary);

    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('.glossary-filter input');
      if (!el) throw new Error('filter input not found');
      return el;
    });
    expect(document.querySelectorAll('.glossary-row')).toHaveLength(11);

    await fireEvent.input(input, { target: { value: 'term-10' } });
    await waitFor(() => {
      const rows = document.querySelectorAll('.glossary-row');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('term-10');
    });
  });
});

describe('Glossary tab — editing an entry', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('the pencil loads the row into the form, and Save entry replaces it in place', async () => {
    seedEntries(3);
    const { getByLabelText, findByRole, getByRole } = render(Glossary);

    await fireEvent.click(await findByRole('button', { name: 'Edit entry term-1' }));
    const term = getByLabelText('Term') as HTMLInputElement;
    await waitFor(() => expect(term.value).toBe('term-1'));
    await fireEvent.input(getByLabelText('Translation'), { target: { value: 'fixed' } });
    await fireEvent.click(getByRole('button', { name: 'Save entry' }));

    await waitFor(async () => {
      const stored = (await getSettings()).glossary;
      expect(stored.map((e) => [e.term, e.translation])).toEqual([
        ['term-0', 'trans-0'],
        ['term-1', 'fixed'],
        ['term-2', 'trans-2'],
      ]);
    });
    expect(getByRole('button', { name: /Add entry/i })).toBeTruthy();
    expect(term.value).toBe('');
  });

  it('refuses a duplicate term in the same scope, case-insensitively', async () => {
    seedEntries(2);
    const { getByLabelText, getByRole, findByRole } = render(Glossary);
    await findByRole('button', { name: 'Edit entry term-0' });

    await fireEvent.input(getByLabelText('Term'), { target: { value: 'TERM-0' } });
    await fireEvent.input(getByLabelText('Translation'), { target: { value: 'other' } });
    await fireEvent.click(getByRole('button', { name: /Add entry/i }));

    expect((await findByRole('alert')).textContent).toMatch(/already in the glossary/i);
    expect((await getSettings()).glossary).toHaveLength(2);
  });

  it('caps the term and translation fields at the stored limit while typing', () => {
    chromeMock.storage.local._raw.set(SETTINGS_KEY, parseSettings({}));
    const { getByLabelText } = render(Glossary);
    expect(getByLabelText('Term').getAttribute('maxlength')).toBe('100');
    expect(getByLabelText('Translation').getAttribute('maxlength')).toBe('100');
  });
});
