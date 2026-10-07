// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { getSettings, replaceSettings } from '@/shared/storage';
import Glossary from '@/options/tabs/Glossary.svelte';

type Entry = { term: string; translation: string; caseSensitive: boolean };

const A: Entry = { term: 'Alpha', translation: 'Aleph', caseSensitive: false };
const B: Entry = { term: 'Beta', translation: 'Bet', caseSensitive: false };
const C: Entry = { term: 'Gamma', translation: 'Gimel', caseSensitive: false };

async function rows(container: HTMLElement): Promise<void> {
  await waitFor(() =>
    expect(container.querySelectorAll('.glossary-row').length).toBeGreaterThan(0),
  );
}

/** On the next settings read, another surface appends C through the settings lock. */
function otherSurfaceWritesOnNextRead(): { done: () => Promise<unknown> } {
  let other: Promise<unknown> = Promise.resolve();
  const get = chromeMock.storage.local.get;
  let fired = false;
  chromeMock.storage.local.get = async (k?: Parameters<typeof get>[0]) => {
    const out = await get(k);
    if (!fired && k === 'ega.settings') {
      fired = true;
      other = replaceSettings((cur) => ({ ...cur, glossary: [...cur.glossary, C] }));
    }
    return out;
  };
  return {
    // The other write queues behind this tab's lock, so once it lands both writes are in.
    done: async () => {
      await vi.waitFor(() => expect(fired).toBe(true));
      await other;
      chromeMock.storage.local.get = get;
    },
  };
}

describe('Glossary — a write from another surface is not lost', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('keeps an entry another surface added while this tab was adding one', async () => {
    chromeMock.storage.local._raw.set('ega.settings', parseSettings({ glossary: [A] }));
    const { container } = render(Glossary);
    await rows(container);

    const inputs = container.querySelectorAll<HTMLInputElement>('.glossary-add input[type="text"]');
    const [term, translation] = Array.from(inputs);
    if (!term || !translation) throw new Error('add-entry inputs not found');
    await fireEvent.input(term, { target: { value: 'Delta' } });
    await fireEvent.input(translation, { target: { value: 'Dalet' } });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /add/i.test(b.textContent),
    );
    if (!addBtn) throw new Error('add button not found');

    const race = otherSurfaceWritesOnNextRead();
    await fireEvent.click(addBtn);
    await race.done();

    const terms = (await getSettings()).glossary.map((g) => g.term);
    expect(terms).toEqual(expect.arrayContaining(['Alpha', 'Delta', 'Gamma']));
    expect(terms).toHaveLength(3);
  });

  it('keeps an entry another surface added while this tab was removing one', async () => {
    chromeMock.storage.local._raw.set('ega.settings', parseSettings({ glossary: [A, B] }));
    const { container } = render(Glossary);
    await rows(container);

    // Delete lives in the open row.
    await fireEvent.click(
      container.querySelector('[aria-label="Edit entry Alpha"]') as HTMLButtonElement,
    );
    const alphaBtn = await waitFor(() =>
      container.querySelector<HTMLButtonElement>('[aria-label="Delete entry Alpha"]'),
    );
    if (!alphaBtn) throw new Error('delete button for Alpha not found');

    const race = otherSurfaceWritesOnNextRead();
    await fireEvent.click(alphaBtn);
    await race.done();

    const terms = (await getSettings()).glossary.map((g) => g.term);
    expect(terms).toEqual(['Beta', 'Gamma']);
  });
});
