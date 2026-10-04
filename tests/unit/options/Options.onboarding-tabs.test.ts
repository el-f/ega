// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '../../mocks/chrome';
import Options from '@/options/Options.svelte';

const WELCOME = { name: 'Get started with Ega' };

describe('Options — the welcome banner', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('shows on Translate and Backends only; other tabs get the short needs-key bar', async () => {
    render(Options);
    await waitFor(() => {
      expect(screen.getByRole('region', WELCOME)).toBeTruthy();
    });

    await fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }));
    await waitFor(() => {
      expect(screen.queryByRole('region', WELCOME)).toBeNull();
      expect(document.querySelector('[data-ega-status-bar="needs-key"]')).not.toBeNull();
    });

    await fireEvent.click(screen.getByRole('tab', { name: /Backends/ }));
    await waitFor(() => {
      expect(screen.getByRole('region', WELCOME)).toBeTruthy();
    });
  });

  it('offers "Skip for now" as the dismiss action', async () => {
    render(Options);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skip for now' })).toBeTruthy();
    });
  });
});
