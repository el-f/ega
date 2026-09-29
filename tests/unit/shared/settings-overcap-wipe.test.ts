import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSettings, updateSettings } from '@/shared/storage';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { SITE_PREFS_MAX } from '@/shared/settings-schema';
import type { Rule } from '@/shared/rules';
import { chromeMock } from '../../mocks/chrome';

/** An over-cap write must not cost the other settings in its section. */

const KEY = 'ega.settings';

/** A rule valid in every field except the one under test. */
const mkRule = (body: string): Rule =>
  ({
    id: 'r1',
    body,
    category: 'always',
    scope: { tasks: [] },
    source: 'manual',
    addedAt: '2026-01-01T00:00:00.000Z',
    enabled: true,
  }) as unknown as Rule;

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('over-cap writes must not wipe the advanced section', () => {
  it('keeps sibling advanced settings when a rule body exceeds the 500-char cap', async () => {
    await updateSettings({ advanced: { ...DEFAULT_SETTINGS.advanced, maxTokens: 4242 } });

    const longRule = mkRule('x'.repeat(600));
    await updateSettings({
      advanced: { ...DEFAULT_SETTINGS.advanced, maxTokens: 4242, rules: [longRule] },
    });

    const after = await getSettings();
    expect(after.advanced.maxTokens).toBe(4242);
  });

  it('keeps sibling advanced settings when a task backend chain exceeds 10 entries', async () => {
    await updateSettings({ advanced: { ...DEFAULT_SETTINGS.advanced, maxTokens: 777 } });

    const eleven = Array.from({ length: 11 }, (_, i) => `b${i}`);
    await updateSettings({
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        maxTokens: 777,
        taskBackendChains: { translate: eleven },
      } as unknown as (typeof DEFAULT_SETTINGS)['advanced'],
    });

    const after = await getSettings();
    expect(after.advanced.maxTokens).toBe(777);
  });

  it('bounds sitePrefs at the cap, dropping the oldest origins', async () => {
    const raw = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
    const prefs: Record<string, unknown> = {};
    for (let i = 0; i < SITE_PREFS_MAX + 5; i += 1) {
      prefs[`https://s${i}.example`] = { disabled: true };
    }
    raw['sitePrefs'] = prefs;
    await chrome.storage.local.set({ [KEY]: raw });

    const after = await getSettings();
    expect(Object.keys(after.sitePrefs)).toHaveLength(SITE_PREFS_MAX);
    expect(after.sitePrefs['https://s0.example']).toBeUndefined();
    expect(after.sitePrefs[`https://s${SITE_PREFS_MAX + 4}.example`]).toEqual({ disabled: true });
  });

  describe('with nested keys read back sorted, as Chrome returns them', () => {
    const sortKeys = (x: unknown): unknown =>
      x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, sortKeys((x as Record<string, unknown>)[k])]),
          )
        : x;

    const get = chromeMock.storage.local.get;
    beforeEach(() => {
      chromeMock.storage.local.get = async (k?: Parameters<typeof get>[0]) =>
        sortKeys(await get(k)) as Record<string, unknown>;
    });
    afterEach(() => {
      chromeMock.storage.local.get = get;
    });

    const memo = { lastDirection: { source: 'auto', target: 'he' } };

    it('keeps an off switch that sorts first when the map is full of remembered directions', async () => {
      const raw = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
      const prefs: Record<string, unknown> = { 'http://bank.example': { disabled: true } };
      for (let i = 0; i < SITE_PREFS_MAX; i += 1) prefs[`https://s${i}.example`] = memo;
      raw['sitePrefs'] = prefs;
      await chrome.storage.local.set({ [KEY]: raw });

      const after = await getSettings();
      expect(after.sitePrefs['http://bank.example']?.disabled).toBe(true);
      expect(Object.keys(after.sitePrefs)).toHaveLength(SITE_PREFS_MAX);
    });

    it('keeps an off switch added through updateSettings on a full map', async () => {
      const prefs: Record<string, unknown> = {};
      for (let i = 0; i < SITE_PREFS_MAX; i += 1) prefs[`https://s${i}.example`] = memo;
      const raw = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
      raw['sitePrefs'] = prefs;
      await chrome.storage.local.set({ [KEY]: raw });

      await updateSettings({ sitePrefs: { 'http://10.0.0.1': { disabled: true } } });

      const after = await getSettings();
      expect(after.sitePrefs['http://10.0.0.1']?.disabled).toBe(true);
      expect(Object.keys(after.sitePrefs)).toHaveLength(SITE_PREFS_MAX);
    });
  });

  it('drops retired batch length keys without losing a sibling', async () => {
    const raw = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
    raw['batchMinLength'] = 25;
    raw['batchMaxLength'] = 3000;
    raw['batchConcurrency'] = 7;
    await chrome.storage.local.set({ [KEY]: raw });

    const after = await getSettings();
    expect(after.batchConcurrency).toBe(7);
    expect((after as unknown as Record<string, unknown>)['batchMinLength']).toBeUndefined();
    expect((after as unknown as Record<string, unknown>)['batchMaxLength']).toBeUndefined();
  });

  it('raw over-cap data already in storage does not take the section down', async () => {
    const raw = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
    (raw['advanced'] as Record<string, unknown>)['maxTokens'] = 1234;
    (raw['advanced'] as Record<string, unknown>)['rules'] = [mkRule('y'.repeat(600))];
    await chrome.storage.local.set({ [KEY]: raw });

    const after = await getSettings();
    expect(after.advanced.maxTokens).toBe(1234);
  });
});
