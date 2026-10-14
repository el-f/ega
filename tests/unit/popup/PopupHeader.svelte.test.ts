// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import PopupHeader from '@/popup/PopupHeader.svelte';

describe('PopupHeader', () => {
  const baseProps = {
    settings: null,
    onOpenOptions: vi.fn(),
  };

  it('renders brand text', () => {
    const { getByText } = render(PopupHeader, { props: baseProps });
    expect(getByText(/Ega/)).toBeTruthy();
  });

  it('has no "Open side panel" button — the tools tile owns that action', () => {
    const { queryByRole } = render(PopupHeader, { props: baseProps });
    expect(queryByRole('button', { name: /Open side panel/i })).toBeNull();
  });

  it('settings IconButton is named "Open settings" and fires onOpenOptions', async () => {
    const onOpenOptions = vi.fn();
    const { getByRole } = render(PopupHeader, {
      props: { ...baseProps, onOpenOptions },
    });
    await fireEvent.click(getByRole('button', { name: 'Open settings' }));
    expect(onOpenOptions).toHaveBeenCalled();
  });

  it('chip jump parks "backends" where the options page consumes it', async () => {
    const { DEFAULT_SETTINGS } = await import('@/shared/settings-defaults');
    const { consumePendingOptionsTab } = await import('@/shared/open-options-tab');
    // No API key configured, so the chip click takes the jump branch, not the popover.
    const { container } = render(PopupHeader, {
      props: {
        settings: DEFAULT_SETTINGS,
        onOpenOptions: vi.fn(),
      },
    });

    const chip = container.querySelector<HTMLButtonElement>('.active-backend-chip');
    expect(chip).not.toBeNull();
    // The jump belongs to the settled empty state; while the probe runs the chip opens its popover.
    await waitFor(() => {
      if (chip?.classList.contains('checking') !== false) throw new Error('probe still running');
    });
    await fireEvent.click(chip as HTMLButtonElement);

    await waitFor(async () => {
      expect(await consumePendingOptionsTab()).toBe('backends');
    });
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });
});
