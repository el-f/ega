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

    // Another surface writes the glossary while this tab sits open.
    seed([C, A, B]);

    const alphaBtn = container.querySelector<HTMLButtonElement>(
      '[aria-label="Delete entry Alpha"]',
    );
    if (!alphaBtn) throw new Error('delete button for Alpha not found');
    await fireEvent.click(alphaBtn);

    await vi.waitFor(async () =>
      expect((await getSettings()).glossary.map((g) => g.term)).toEqual(['Gamma', 'Beta']),
    );
  });

  // Renders 200 glossary rows, which took 4586ms of the 5s default under coverage instrumentation.
  it('refuses the 201st entry against the stored list, not a stale snapshot', async () => {
    seed([A]);
    const { container } = render(Glossary);
    await rows(container);

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
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /add/i.test(b.textContent),
    );
    if (!addBtn) throw new Error('add button not found');
    await fireEvent.click(addBtn);

    await waitFor(() => expect(container.textContent).toMatch(/glossary limit is 200 entries/i));
    expect((await getSettings()).glossary).toHaveLength(200);
  }, 20_000);
});
