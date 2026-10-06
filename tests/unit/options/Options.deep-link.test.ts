// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import Options from '@/options/Options.svelte';

function seed(): void {
  chromeMock.storage.local._raw.set('ega.settings', parseSettings({}));
}

/** Opens settings search, types the query, clicks the entry's result and returns the anchor once it paints. */
async function jumpVia(query: string, entryId: string): Promise<HTMLElement> {
  await fireEvent.keyDown(document, { key: ',', ctrlKey: true });
  const input = await waitFor(() => {
    const el = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    if (!el) throw new Error('search did not open');
    return el;
  });
  await fireEvent.input(input, { target: { value: query } });
  const row = await waitFor(() => {
    const el = document.querySelector(`[data-ega-settings-list-item="${entryId}"]`);
    if (!el) throw new Error(`no result for ${entryId}`);
    return el;
  });
  await fireEvent.click(row);
  return waitFor(
    () => {
      const el = document.querySelector<HTMLElement>(`[data-ega-setting="${entryId}"]`);
      if (!el) throw new Error('anchor never painted');
      return el;
    },
    { timeout: 10_000 },
  );
}

describe('Options — settings-search deep link reaches every tab', () => {
  beforeEach(() => {
    resetChromeMock();
    sessionStorage.clear();
    seed();
  });

  // The first test pays the cold tab-chunk import, so its budget must outlast its own 10 s wait.
  it('lands on the control, not the top of the tab, for a Translate-tab result', async () => {
    render(Options);

    const anchor = await jumpVia('temperature', 'advanced.temperature');
    await waitFor(() => expect(document.activeElement).toBe(anchor), { timeout: 10_000 });
    expect(anchor.getAttribute('data-flash')).toBe('true');
    // The target is consumed, so a later tab switch cannot re-scroll.
    expect(sessionStorage.getItem('ega-settings-target')).toBeNull();
  }, 15_000);

  // Default settings use Minimal page context, where these limits are off; the search result must still land.
  it.each([
    ['Page description length', 'advanced.descriptionContextCap'],
    ['Headings sent', 'advanced.headingTrailDepth'],
    ['Longest heading', 'advanced.headingTrailEntryCap'],
  ])('lands on the Rich-only limit "%s" under default settings', async (query, entryId) => {
    render(Options);

    const anchor = await jumpVia(query, entryId);
    await waitFor(() => expect(document.activeElement).toBe(anchor), { timeout: 10_000 });
    expect(anchor.closest('details')?.open).toBe(true);
  });

  it('Add a rule opens the rules editor on the Tasks tab, not the Advanced tab', async () => {
    render(Options);

    await fireEvent.keyDown(document, { key: 'R', ctrlKey: true, shiftKey: true });

    const body = await waitFor(
      () => {
        const el = document.querySelector<HTMLTextAreaElement>('[data-ega-manual-body]');
        if (!el) throw new Error('rules manual body never mounted');
        return el;
      },
      { timeout: 10_000 },
    );
    expect(document.querySelector('[data-ega-tab="tasks"]')).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(body), { timeout: 10_000 });
  });
});
