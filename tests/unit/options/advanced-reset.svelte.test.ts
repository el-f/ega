// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

// Stub confirmDialog so the destructive reset flow auto-accepts in tests.
vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

const AdvancedModule = await import('@/options/tabs/Advanced.svelte');
const Advanced = AdvancedModule.default;

describe('Advanced tab — Reset clears sitePrefs', () => {
  beforeEach(() => {
    resetChromeMock();
    try {
      sessionStorage.removeItem('ega-advanced-subtab');
      sessionStorage.removeItem('ega-advanced-chip');
      sessionStorage.removeItem('ega-settings-target');
    } catch {
      // ignore
    }
  });

  it('Reset prompt and generation settings wipes sitePrefs entries and resets Effort', async () => {
    // Seed: settings with an existing sitePref that reset should clear.
    const seeded = {
      ...DEFAULT_SETTINGS,
      advanced: { ...DEFAULT_SETTINGS.advanced, effort: 'high', maxTokens: 64 },
      sitePrefs: {
        'https://example.com': {
          lastDirection: { source: 'es', target: 'en' },
          disabled: true,
        },
      },
    } as unknown as Settings;
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: seeded,
    });

    const { container, findByRole } = render(Advanced, {
      props: { s: seeded, onSetSettings: () => {} },
    });
    await findByRole('tablist', { name: /Advanced sub-section/i });

    // Reset lives on the Data sub-tab.
    const dataTab = container.querySelector('[data-ega-subtab="data"]') as HTMLButtonElement | null;
    expect(dataTab).toBeTruthy();
    await fireEvent.click(dataTab as HTMLButtonElement);
    await new Promise((r) => setTimeout(r, 0));

    const btn = container.querySelector('[data-ega-reset-defaults]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await fireEvent.click(btn);

    const s = await vi.waitFor(async () => {
      const final = (await chromeMock.storage.local.get(STORAGE_KEYS.settings)) as Record<
        string,
        unknown
      >;
      const stored = final[STORAGE_KEYS.settings] as Settings;
      expect(stored.sitePrefs).toEqual({});
      return stored;
    });
    // The card names Effort and max answer length, so both come back too.
    expect(s.advanced.effort).toBe(DEFAULT_SETTINGS.advanced.effort);
    expect(s.advanced.maxTokens).toBe(DEFAULT_SETTINGS.advanced.maxTokens);
  });
});
