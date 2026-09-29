import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMock } from '../../mocks/chrome';
import { getSettings, updateSettings, replaceSitePrefs } from '@/shared/storage';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_TEMPLATE } from '@/shared/prompts';

describe('Advanced tab — round-trip persistence', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  /** Mirrors Advanced.svelte's patchAdvanced. */
  async function patchAdvanced(p: Partial<typeof DEFAULT_SETTINGS.advanced>): Promise<void> {
    const s = await getSettings();
    await updateSettings({ advanced: { ...s.advanced, ...p } });
  }

  it('promptTemplate round-trip (save + re-read)', async () => {
    const tpl = { system: 'custom system', user: 'custom user {{text}}' };
    await patchAdvanced({ promptTemplate: tpl });
    const s = await getSettings();
    expect(s.advanced.promptTemplate).toEqual(tpl);
  });

  it('reset template restores shipped default', async () => {
    await patchAdvanced({ promptTemplate: { system: 'junk', user: 'junk' } });
    await patchAdvanced({ promptTemplate: { ...DEFAULT_TEMPLATE } });
    const s = await getSettings();
    expect(s.advanced.promptTemplate).toEqual(DEFAULT_TEMPLATE);
  });

  it('temperature + maxTokens round-trip', async () => {
    await patchAdvanced({ temperature: 0.7, maxTokens: 1000 });
    const s = await getSettings();
    expect(s.advanced.temperature).toBe(0.7);
    expect(s.advanced.maxTokens).toBe(1000);
  });

  it('perPresetTemplates: add, edit, remove', async () => {
    await patchAdvanced({
      perPresetTemplates: { arabizi: { system: 'a-sys', user: 'a-usr' } },
    });
    let s = await getSettings();
    expect(s.advanced.perPresetTemplates['arabizi']).toEqual({
      system: 'a-sys',
      user: 'a-usr',
    });

    await patchAdvanced({
      perPresetTemplates: { arabizi: { system: 'a-sys-v2', user: 'a-usr-v2' } },
    });
    s = await getSettings();
    expect(s.advanced.perPresetTemplates['arabizi']?.system).toBe('a-sys-v2');

    await patchAdvanced({ perPresetTemplates: {} });
    s = await getSettings();
    expect(s.advanced.perPresetTemplates['arabizi']).toBeUndefined();
  });

  it('perPresetTemplates: removing one preserves the others', async () => {
    await patchAdvanced({
      perPresetTemplates: {
        arabizi: { system: 'a', user: 'A' },
        elvish: { system: 'e', user: 'E' },
      },
    });
    let s = await getSettings();
    expect(Object.keys(s.advanced.perPresetTemplates).sort()).toEqual(['arabizi', 'elvish']);

    const next = { ...s.advanced.perPresetTemplates };
    delete next['arabizi'];
    await patchAdvanced({ perPresetTemplates: next });
    s = await getSettings();
    expect(s.advanced.perPresetTemplates['arabizi']).toBeUndefined();
    expect(s.advanced.perPresetTemplates['elvish']).toEqual({ system: 'e', user: 'E' });
  });

  it('cacheEnabled toggle round-trip', async () => {
    await updateSettings({ cacheEnabled: false });
    let s = await getSettings();
    expect(s.cacheEnabled).toBe(false);
    await updateSettings({ cacheEnabled: true });
    s = await getSettings();
    expect(s.cacheEnabled).toBe(true);
  });

  it('Reset-all nukes sitePrefs via replaceSitePrefs({})', async () => {
    await updateSettings({
      sitePrefs: {
        'https://example.com': { disabled: true },
      },
    });
    let s = await getSettings();
    expect(s.sitePrefs['https://example.com']).toBeDefined();

    // These two calls stand in for the Reset-all footer button.
    await patchAdvanced({
      promptTemplate: { ...DEFAULT_TEMPLATE },
      temperature: DEFAULT_SETTINGS.advanced.temperature,
      maxTokens: DEFAULT_SETTINGS.advanced.maxTokens,
    });
    await replaceSitePrefs({});

    s = await getSettings();
    expect(s.sitePrefs).toEqual({});
    expect(s.advanced.promptTemplate).toEqual(DEFAULT_TEMPLATE);
    expect(s.advanced.temperature).toBe(DEFAULT_SETTINGS.advanced.temperature);
  });

  it('Reset-all PRESERVES perPresetTemplates (intentional — per the comment)', async () => {
    await patchAdvanced({
      perPresetTemplates: { arabizi: { system: 'keep', user: 'me' } },
    });
    await patchAdvanced({
      promptTemplate: { ...DEFAULT_TEMPLATE },
      temperature: DEFAULT_SETTINGS.advanced.temperature,
      maxTokens: DEFAULT_SETTINGS.advanced.maxTokens,
    });
    const s = await getSettings();
    expect(s.advanced.perPresetTemplates['arabizi']).toEqual({
      system: 'keep',
      user: 'me',
    });
  });

  it('Reset-all PRESERVES API keys (intentional)', async () => {
    await updateSettings({ anthropicApiKey: 'sk-ant-x' });
    await patchAdvanced({
      promptTemplate: { ...DEFAULT_TEMPLATE },
      temperature: DEFAULT_SETTINGS.advanced.temperature,
      maxTokens: DEFAULT_SETTINGS.advanced.maxTokens,
    });
    await replaceSitePrefs({});
    const s = await getSettings();
    expect(s.anthropicApiKey).toBe('sk-ant-x');
  });
});
