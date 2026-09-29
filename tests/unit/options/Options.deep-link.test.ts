// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import Options from '@/options/Options.svelte';

function seed(): void {
  chromeMock.storage.local._raw.set('ega.settings', parseSettings({}));
}

describe('Options — settings-search deep link reaches every tab', () => {
  beforeEach(() => {
    resetChromeMock();
    sessionStorage.clear();
    seed();
  });

  it('lands on the control, not the top of the tab, for a Translate-tab result', async () => {
    render(Options);

    await fireEvent.keyDown(document, { key: ',', ctrlKey: true });
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
      if (!el) throw new Error('search did not open');
      return el;
    });
    await fireEvent.input(input, { target: { value: 'temperature' } });

    const row = await waitFor(() => {
      const el = document.querySelector('[data-ega-settings-list-item="advanced.temperature"]');
      if (!el) throw new Error('no temperature result');
      return el;
    });
    await fireEvent.click(row);

    const anchor = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>('[data-ega-setting="advanced.temperature"]');
        if (!el) throw new Error('anchor never painted');
        return el;
      },
      { timeout: 3000 },
    );
    await waitFor(() => expect(document.activeElement).toBe(anchor), { timeout: 3000 });
    expect(anchor.getAttribute('data-flash')).toBe('true');
    // The target is consumed, so a later tab switch cannot re-scroll.
    expect(sessionStorage.getItem('ega-settings-target')).toBeNull();
  });

  it('Add a rule opens the Templates rules editor, not the Advanced tab', async () => {
    render(Options);

    await fireEvent.keyDown(document, { key: 'R', ctrlKey: true, shiftKey: true });

    const body = await waitFor(
      () => {
        const el = document.querySelector<HTMLTextAreaElement>('[data-ega-manual-body]');
        if (!el) throw new Error('rules manual body never mounted');
        return el;
      },
      { timeout: 3000 },
    );
    expect(
      document.querySelector('[data-ega-workbench-chip="rules"]')?.getAttribute('aria-selected'),
    ).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(body), { timeout: 3000 });
  });
});
