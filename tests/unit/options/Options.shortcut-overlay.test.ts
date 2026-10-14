// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import Options from '@/options/Options.svelte';

// Drives the real producer: a prop-level test would pass with the overlay wired to nothing.

describe('Options — the shortcuts overlay shows the stored bindings', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('renders the rebound chords, not the shipped defaults', async () => {
    chromeMock.storage.local._raw.set(
      'ega.settings',
      parseSettings({
        onboardingDismissed: true,
        shortcut: 'Alt+Shift+Y',
        pickerShortcut: 'Ctrl+Alt+P',
      }),
    );
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });

    await fireEvent.keyDown(document, { key: '?' });

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('.shortcut-row'));
      const text = (term: string): string =>
        rows
          .find((r) => (r.querySelector('dt')?.textContent ?? '').includes(term))
          ?.querySelector('dd')?.textContent ?? '';
      expect(text('Translate selection')).toBe('Alt+Shift+Y');
      expect(text('Start the element picker')).toBe('Ctrl+Alt+P');
    });
  });
});
