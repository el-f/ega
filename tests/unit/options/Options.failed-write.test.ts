// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import * as storage from '@/shared/storage';
import { toastStore } from '@/shared/components/toastStore';
import Options from '@/options/Options.svelte';

function seedSettings(overrides: Record<string, unknown> = {}): void {
  chromeMock.storage.local._raw.set('ega.settings', parseSettings(overrides));
}

describe('Options.svelte — a theme write that fails', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    delete document.documentElement.dataset['theme'];
  });

  it('puts the theme back and tells the user instead of showing a value that is not stored', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    seedSettings({ onboardingDismissed: true, theme: 'light' });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    await new Promise<void>((r) => setTimeout(r, 0));

    vi.spyOn(storage, 'updateSettings').mockRejectedValue(new Error('disk i/o failed'));
    const dark = container.querySelector<HTMLButtonElement>('[data-ega-theme="dark"]');
    if (!dark) throw new Error('dark theme button not found');
    await fireEvent.click(dark);

    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
