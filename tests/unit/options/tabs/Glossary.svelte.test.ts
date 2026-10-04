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
