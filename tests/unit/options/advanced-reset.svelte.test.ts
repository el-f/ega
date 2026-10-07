// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';
import type { Settings } from '@/shared/types';

const AdvancedModule = await import('@/options/tabs/Advanced.svelte');
const Advanced = AdvancedModule.default;

async function storedSettings(): Promise<Settings> {
  const out = (await chromeMock.storage.local.get(STORAGE_KEYS.settings)) as Record<
    string,
    unknown
  >;
  return out[STORAGE_KEYS.settings] as Settings;
}

let pushed: ToastMsg[] = [];

describe('Advanced — Reset prompt and model settings', () => {
  beforeEach(() => {
    resetChromeMock();
    sessionStorage.clear();
    pushed = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
  });

  it('acts at once, keeps site overrides, and Undo puts the old values back', async () => {
    const seeded = {
      ...DEFAULT_SETTINGS,
      advanced: { ...DEFAULT_SETTINGS.advanced, effort: 'high', maxTokens: 64, temperature: 0.9 },
      sitePrefs: { 'https://example.com': { disabled: true } },
    } as unknown as Settings;
    await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: seeded });

    const { container } = render(Advanced, { props: { s: seeded, onSetSettings: () => {} } });
    const btn = await vi.waitFor(() => {
      const b = container.querySelector('[data-ega-reset-defaults]');
      if (!b) throw new Error('Reset not mounted');
      return b as HTMLButtonElement;
    });
    await fireEvent.click(btn);

    const s = await vi.waitFor(async () => {
      const stored = await storedSettings();
      expect(stored.advanced.effort).toBe(DEFAULT_SETTINGS.advanced.effort);
      return stored;
    });
    expect(s.advanced.maxTokens).toBe(DEFAULT_SETTINGS.advanced.maxTokens);
    expect(s.advanced.temperature).toBe(DEFAULT_SETTINGS.advanced.temperature);
    // Site overrides have their own card now.
    expect(Object.keys(s.sitePrefs).length).toBeGreaterThan(0);

    await vi.waitFor(() => expect(pushed).toHaveLength(1));
    expect(pushed[0]?.message).toBe('Prompt and model settings are back to defaults');
    expect(pushed[0]?.action?.label).toBe('Undo');
    pushed[0]?.action?.onClick();
    await vi.waitFor(async () => {
      const back = await storedSettings();
      expect(back.advanced.effort).toBe('high');
      expect(back.advanced.maxTokens).toBe(64);
      expect(back.advanced.temperature).toBe(0.9);
    });
  });

  it('Undo puts an edited prompt back with its own template version, so the newer-prompt notice still shows', async () => {
    const custom = { system: 'House rules. {{langHint}}', user: 'TEXT:\n{{text}}' };
    const seeded = {
      ...DEFAULT_SETTINGS,
      advanced: { ...DEFAULT_SETTINGS.advanced, promptTemplate: custom, templateVersion: 8 },
    } as unknown as Settings;
    await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: seeded });

    const { container } = render(Advanced, { props: { s: seeded, onSetSettings: () => {} } });
    const btn = await vi.waitFor(() => {
      const b = container.querySelector('[data-ega-reset-defaults]');
      if (!b) throw new Error('Reset not mounted');
      return b as HTMLButtonElement;
    });
    await fireEvent.click(btn);
    await vi.waitFor(() => expect(pushed).toHaveLength(1));
    pushed[0]?.action?.onClick();
    await vi.waitFor(async () => {
      const back = await storedSettings();
      expect(back.advanced.promptTemplate).toEqual(custom);
      expect(back.advanced.templateVersion).toBe(8);
    });
  });
});
