// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { getSettings } from '@/shared/storage';
import Glossary from '@/options/tabs/Glossary.svelte';

type Entry = { term: string; translation: string; caseSensitive: boolean };

function seed(glossary: Entry[]): void {
  chromeMock.storage.local._raw.set('ega.settings', parseSettings({ glossary }));
}

const A: Entry = { term: 'Alpha', translation: 'Aleph', caseSensitive: false };
const B: Entry = { term: 'Beta', translation: 'Bet', caseSensitive: false };
const C: Entry = { term: 'Gamma', translation: 'Gimel', caseSensitive: false };

async function rows(container: HTMLElement): Promise<HTMLElement[]> {
  return waitFor(() => {
    const found = container.querySelectorAll<HTMLElement>('.glossary-row');
    expect(found.length).toBeGreaterThan(0);
    return Array.from(found);
  });
}

describe('Glossary — delete targets the row the user clicked', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('removes the clicked entry even after another surface prepended one', async () => {
    seed([A, B]);
    const { container } = render(Glossary);
    const shown = await rows(container);
    expect(shown).toHaveLength(2);

    // Delete lives in the open row.
    await fireEvent.click(
      container.querySelector('[aria-label="Edit entry Alpha"]') as HTMLButtonElement,
    );
    // Another surface writes the glossary while this tab sits open.
    seed([C, A, B]);

    const alphaBtn = await waitFor(() =>
      container.querySelector<HTMLButtonElement>('[aria-label="Delete entry Alpha"]'),
    );
    if (!alphaBtn) throw new Error('delete button for Alpha not found');
    await fireEvent.click(alphaBtn);

    await vi.waitFor(async () =>
      expect((await getSettings()).glossary.map((g) => g.term)).toEqual(['Gamma', 'Beta']),
    );
  });

  // Keep the rendered list filtered: this checks the stored cap against a stale snapshot,
  // not the cost of mounting 200 unrelated rows after the refused write refreshes the list.
  it('refuses the 201st entry against the stored list, not a stale snapshot', async () => {
    seed([A, ...Array.from({ length: 10 }, (_, i) => ({ ...B, term: `initial${i}` }))]);
    const { container, getByRole } = render(Glossary);
    await rows(container);
    await fireEvent.input(getByRole('searchbox', { name: 'Filter glossary entries' }), {
      target: { value: 'Overflow' },
    });

    const full = Array.from({ length: 200 }, (_, i) => ({
      term: `t${i}`,
      translation: `x${i}`,
      caseSensitive: false,
    }));
    seed(full);

    const inputs = container.querySelectorAll<HTMLInputElement>('.glossary-add input[type="text"]');
    const [term, translation] = Array.from(inputs);
    if (!term || !translation) throw new Error('add-entry inputs not found');
    await fireEvent.input(term, { target: { value: 'Overflow' } });
    await fireEvent.input(translation, { target: { value: 'Nope' } });
    const addBtn = container.querySelector<HTMLButtonElement>('[data-ega-glossary-add-button]');
    if (!addBtn) throw new Error('add button not found');
    await fireEvent.click(addBtn);

    await waitFor(() =>
      expect(container.textContent).toMatch(/The glossary holds 200 entries, the most Ega keeps/),
    );
    expect((await getSettings()).glossary).toHaveLength(200);
    expect(container.querySelectorAll('.glossary-row')).toHaveLength(0);
  });
});
