import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { getSettings, updateSettings } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { sel } from '@tests/_helpers/lang';

// The General tab writes the whole settings snapshot, so it can clobber another tab's write.
describe('General tab — round-trip persistence', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  /** Mirror the General-tab flush: read all settings, change one field, write it all back. */
  async function snapshotPatch<K extends keyof Awaited<ReturnType<typeof getSettings>>>(
    key: K,
    value: Awaited<ReturnType<typeof getSettings>>[K],
  ): Promise<void> {
    const s = await getSettings();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s as any)[key] = value;
    await updateSettings(s);
  }

  it('theme round-trips through snapshot write', async () => {
    await snapshotPatch('theme', 'dark');
    const s = await getSettings();
    expect(s.theme).toBe('dark');

    await snapshotPatch('theme', 'light');
    const s2 = await getSettings();
    expect(s2.theme).toBe('light');
  });

  it('defaultDisplayMode round-trips', async () => {
    await snapshotPatch('defaultDisplayMode', 'inline');
    const s = await getSettings();
    expect(s.defaultDisplayMode).toBe('inline');
  });

  it('bubbleMode round-trips (smart / always / never)', async () => {
    for (const mode of ['smart', 'always', 'never'] as const) {
      await snapshotPatch('bubbleMode', mode);
      const s = await getSettings();
      expect(s.bubbleMode).toBe(mode);
    }
  });

  it('defaultLang + defaultTargetLang round-trip', async () => {
    await snapshotPatch('defaultLang', sel('fr'));
    await snapshotPatch('defaultTargetLang', sel('de'));
    const s = await getSettings();
    expect(s.defaultLang).toBe('fr');
    expect(s.defaultTargetLang).toBe('de');
  });

  it('defaultTask / defaultTone round-trip', async () => {
    await snapshotPatch('defaultTask', 'reword');
    await snapshotPatch('defaultTone', 'formal');
    const s = await getSettings();
    expect(s.defaultTask).toBe('reword');
    expect(s.defaultTone).toBe('formal');
  });

  it('contextEnabled + pageContextLevel round-trip', async () => {
    await snapshotPatch('contextEnabled', false);
    await snapshotPatch('pageContextLevel', 'rich');
    const s = await getSettings();
    expect(s.contextEnabled).toBe(false);
    expect(s.pageContextLevel).toBe('rich');
  });

  it('streaming / confidencePill / tooltipClickOutside / tooltipShowSource all round-trip', async () => {
    await snapshotPatch('streaming', false);
    await snapshotPatch('confidencePill', false);
    await snapshotPatch('tooltipClickOutside', false);
    await snapshotPatch('tooltipShowSource', true);
    const s = await getSettings();
    expect(s.streaming).toBe(false);
    expect(s.confidencePill).toBe(false);
    expect(s.tooltipClickOutside).toBe(false);
    expect(s.tooltipShowSource).toBe(true);
  });

  it('pickerEnabled + pickerShortcut round-trip', async () => {
    await snapshotPatch('pickerEnabled', false);
    await snapshotPatch('pickerShortcut', 'Ctrl+Alt+P');
    const s = await getSettings();
    expect(s.pickerEnabled).toBe(false);
    expect(s.pickerShortcut).toBe('Ctrl+Alt+P');
  });

  it('shortcut round-trip', async () => {
    await snapshotPatch('shortcut', 'Ctrl+Alt+K');
    const s = await getSettings();
    expect(s.shortcut).toBe('Ctrl+Alt+K');
  });

  it('snapshot write from General preserves disabledVarieties across tabs', async () => {
    await updateSettings({ disabledVarieties: ['arabizi'] });
    await snapshotPatch('theme', 'dark');
    const s = await getSettings();
    expect(s.theme).toBe('dark');
    expect(s.disabledVarieties).toEqual(['arabizi']);
  });

  it('a snapshot write keeps sitePrefs written from another tab', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: {
        schemaVersion: 4,
        sitePrefs: {
          'https://example.com': { disabled: true },
        },
      },
    });

    await snapshotPatch('theme', 'dark');
    const s = await getSettings();
    expect(s.sitePrefs['https://example.com']?.disabled).toBe(true);
  });
});
