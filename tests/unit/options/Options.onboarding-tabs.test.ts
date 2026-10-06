// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '../../mocks/chrome';
import Options from '@/options/Options.svelte';

const getStarted = (): Element | null => document.querySelector('[data-ega-get-started]');
const notice = (): Element | null => document.querySelector('[data-ega-status-bar="needs-key"]');

describe('Options — Get started and the notice', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('Get started shows on Backends only, and the page never shows it and the notice together', async () => {
    render(Options);
    await waitFor(() => {
      expect(notice()).not.toBeNull();
    });
    expect(getStarted()).toBeNull();

    await fireEvent.click(screen.getByRole('tab', { name: /Backends/ }));
    await waitFor(() => {
      expect(getStarted()).not.toBeNull();
    });
    expect(notice()).toBeNull();

    await fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }));
    await waitFor(() => {
      expect(getStarted()).toBeNull();
      expect(notice()).not.toBeNull();
    });
  });

  it('offers the three ways to start and "Skip for now"', async () => {
    render(Options);
    await fireEvent.click(await screen.findByRole('tab', { name: /Backends/ }));
    for (const name of [
      'Use a free Gemini key',
      'Use another API key',
      'Run on this computer',
      'Skip for now',
    ]) {
      expect(await screen.findByRole('button', { name })).toBeTruthy();
    }
  });
});
