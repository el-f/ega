import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  getSettings,
  updateSettings,
  replaceRules,
  replaceSitePrefs,
  replaceVarietyOverrides,
  replaceTaskOverrides,
  replacePerPresetTemplates,
  getCustomLanguages,
  upsertCustomLanguage,
  deleteCustomLanguage,
} from '@/shared/storage';
import { exportAll, exportVarieties } from '@/shared/storage/backup';
import { importAs } from '@tests/_helpers/import-bundle';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS, DEFAULT_PROMPT_TEMPLATE } from '@/shared/settings-defaults';
import type { Settings, VarietiesBundle } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { preset, sel } from '@tests/_helpers/lang';

const bid = (s: string) => asBackendIdUnsafe(s);

describe('storage', () => {
  it('returns defaults when unset', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await getCustomLanguages()).toEqual([]);
  });

  it('returns default pickerEnabled=true and pickerShortcut from DEFAULT_SETTINGS when storage is empty', async () => {
    const s = await getSettings();
    expect(s.pickerEnabled).toBe(true);
    expect(s.pickerShortcut).toBe('Ctrl+Shift+E');
  });

  it('default cacheEnabled=true when storage is empty', async () => {
    const s = await getSettings();
    expect(s.cacheEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.cacheEnabled).toBe(true);
  });

  it('sanitizer keeps cacheEnabled=false (explicit user opt-out)', async () => {
    await updateSettings({ cacheEnabled: false });
    const s = await getSettings();
    expect(s.cacheEnabled).toBe(false);
  });

  it('sanitizer falls back to the default when an old row has no cacheEnabled', async () => {
    // updateSettings merges, so dropping a field needs a raw chrome.storage.local write.
    const raw: Record<string, unknown> = {
      ...DEFAULT_SETTINGS,
    };
    delete raw['cacheEnabled'];
    await chrome.storage.local.set({ 'ega.settings': raw });
    const s = await getSettings();
    expect(s.cacheEnabled).toBe(true);
  });

  it('preserves a CUSTOMIZED template AND its stored templateVersion on read', async () => {
    // The version banner reads templateVersion — bumping it silently would stop the banner firing.
    const customized = 'Custom user wording with no sentinel, {{text}} slot.';
    const raw: Record<string, unknown> = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        templateVersion: 4,
        promptTemplate: { system: customized, user: '{{text}}' },
      },
    };
    await chrome.storage.local.set({ 'ega.settings': raw });
    const s = await getSettings();
    expect(s.advanced.templateVersion).toBe(4);
    expect(s.advanced.promptTemplate.system).toBe(customized);
  });

  it('customized template seeded at templateVersion 0 preserves both body and version', async () => {
    // Version 0 is older than any default and the text has no sentinel, so nothing may be rewritten.
    const customized = 'CUSTOM SYSTEM (no legacy sentinel) — banner-fixture seed';
    const customizedUser = 'CUSTOM USER {{text}}';
    const raw: Record<string, unknown> = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        templateVersion: 0,
        promptTemplate: { system: customized, user: customizedUser },
      },
    };
    await chrome.storage.local.set({ 'ega.settings': raw });
    const s = await getSettings();
    expect(s.advanced.templateVersion).toBe(0);
    expect(s.advanced.promptTemplate.system).toBe(customized);
    expect(s.advanced.promptTemplate.user).toBe(customizedUser);
  });

  it('merges partial updates and preserves advanced block', async () => {
    await updateSettings({ theme: 'dark' });
    const s = await getSettings();
    expect(s.theme).toBe('dark');
    expect(s.defaultLang).toBe(DEFAULT_SETTINGS.defaultLang);
    expect(s.advanced.temperature).toBe(0.2);
    expect(s.advanced.promptTemplate).toEqual(DEFAULT_PROMPT_TEMPLATE);
  });

  it('a stored row carrying an unknown top-level key still loads (repair drops the key)', async () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_SETTINGS, schemaVersion: 3 };
    await chrome.storage.local.set({ 'ega.settings': legacy });
    const s = await getSettings();
    expect(s.theme).toBe(DEFAULT_SETTINGS.theme);
    expect((s as unknown as Record<string, unknown>)['schemaVersion']).toBeUndefined();
  });

  it('default settings include empty varietyOverrides and disabledVarieties', async () => {
    const s = await getSettings();
    expect(s.varietyOverrides).toEqual({});
    expect(s.disabledVarieties).toEqual([]);
  });

  it('default defaultTargetLang is "en"', async () => {
    const s = await getSettings();
    expect(s.defaultTargetLang).toBe('en');
  });

  it('round-trips a non-English defaultTargetLang through updateSettings', async () => {
    await updateSettings({ defaultTargetLang: sel('fr') });
    const s = await getSettings();
    expect(s.defaultTargetLang).toBe('fr');
  });

  it('sanitizer falls back to "en" for legacy rows missing defaultTargetLang', async () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete legacy['defaultTargetLang'];
    await chrome.storage.local.set({ 'ega.settings': legacy });
    const s = await getSettings();
    expect(s.defaultTargetLang).toBe('en');
  });

  it('sanitizer clamps oversized / non-string defaultTargetLang to "en"', async () => {
    await chrome.storage.local.set({
      'ega.settings': { ...DEFAULT_SETTINGS, defaultTargetLang: 'x'.repeat(50) },
    });
    expect((await getSettings()).defaultTargetLang).toBe('en');

    await chrome.storage.local.set({
      'ega.settings': { ...DEFAULT_SETTINGS, defaultTargetLang: 42 },
    });
    expect((await getSettings()).defaultTargetLang).toBe('en');
  });

  it('sanitizer GCs retired SitePref fields (autoBanner / displayMode / suppressBubble / promptTemplate) on read', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        ...DEFAULT_SETTINGS,
        sitePrefs: {
          'https://discord.com': {
            autoBanner: false,
            disabled: false,
            displayMode: 'inline',
            suppressBubble: true,
            promptTemplate: { system: 'SYS', user: 'USR {{text}}' },
            defaultLang: 'genz-slang',
          },
        },
      },
    });
    const s = await getSettings();
    const discord = s.sitePrefs['https://discord.com'];
    if (!discord) throw new Error('expected discord pref');
    expect(discord.disabled).toBe(false);
    expect(discord.defaultLang).toBe('genz-slang');
    // Record cast — the typed shape has no such keys, so only a raw read catches a regression.
    const raw = discord as unknown as Record<string, unknown>;
    expect(raw['autoBanner']).toBeUndefined();
    expect(raw['displayMode']).toBeUndefined();
    expect(raw['suppressBubble']).toBeUndefined();
    expect(raw['promptTemplate']).toBeUndefined();
  });

  it('an unknown advanced key is stripped and every sibling survives', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        ...DEFAULT_SETTINGS,
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          optionsIaV2: false,
          promptTemplate: { system: 'CUSTOM', user: 'CUSTOM {{text}}' },
        },
      },
    });
    const s = await getSettings();
    expect((s.advanced as unknown as Record<string, unknown>)['optionsIaV2']).toBeUndefined();
    expect(s.advanced.promptTemplate.system).toBe('CUSTOM');
  });

  it('sanitizes SitePref.lastDirection: accepts well-formed, rejects malformed', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        ...DEFAULT_SETTINGS,
        sitePrefs: {
          'https://good.example': {
            disabled: false,
            lastDirection: { source: 'en', target: 'es' },
          },
          'https://empty.example': {
            disabled: false,
            lastDirection: { source: '', target: 'es' },
          },
          'https://oversized.example': {
            disabled: false,
            lastDirection: { source: 'x'.repeat(17), target: 'en' },
          },
          'https://not-object.example': {
            disabled: false,
            lastDirection: 'nope',
          },
          'https://half.example': {
            disabled: false,
            lastDirection: { source: 'en' },
          },
        },
      },
    });
    const s = await getSettings();
    expect(s.sitePrefs['https://good.example']?.lastDirection).toEqual({
      source: 'en',
      target: 'es',
    });
    expect(s.sitePrefs['https://empty.example']?.lastDirection).toBeUndefined();
    expect(s.sitePrefs['https://oversized.example']?.lastDirection).toBeUndefined();
    expect(s.sitePrefs['https://not-object.example']?.lastDirection).toBeUndefined();
    expect(s.sitePrefs['https://half.example']?.lastDirection).toBeUndefined();
  });

  it('replaceSitePrefs writes the exact map — does not merge with the prior one', async () => {
    await updateSettings({
      sitePrefs: {
        'https://a.example': { disabled: false, defaultLang: sel('fr') },
        'https://b.example': { disabled: false },
      },
    });

    // updateSettings would merge and keep a.example; replaceSitePrefs must not.
    await replaceSitePrefs({
      'https://b.example': { disabled: false },
    });
    const s1 = await getSettings();
    expect(Object.keys(s1.sitePrefs)).toEqual(['https://b.example']);
    expect(s1.sitePrefs['https://a.example']).toBeUndefined();

    // Clearing an optional field means writing the host without that key.
    await replaceSitePrefs({
      'https://b.example': {
        disabled: false,
        defaultLang: sel('es'),
      },
    });
    await replaceSitePrefs({
      'https://b.example': { disabled: false },
    });
    const s2 = await getSettings();
    expect(s2.sitePrefs['https://b.example']?.defaultLang).toBeUndefined();
  });

  it('replaceVarietyOverrides writes the exact map — does not merge with the prior one', async () => {
    await updateSettings({
      varietyOverrides: {
        arabizi: { hint: 'OVERRIDDEN' },
        'elvish-quenya': { hint: 'E' },
      },
    });

    // updateSettings would merge and keep the arabizi override; replaceVarietyOverrides must not.
    await replaceVarietyOverrides({
      'elvish-quenya': { hint: 'E' },
    });
    const s = await getSettings();
    expect(Object.keys(s.varietyOverrides)).toEqual(['elvish-quenya']);
    expect(s.varietyOverrides['arabizi']).toBeUndefined();
  });

  describe('replaceTaskOverrides — delete-then-replace', () => {
    it('drops a task and a field that were deleted from the snapshot', async () => {
      await updateSettings({
        taskOverrides: {
          translate: { effort: 'high' },
          explain: { effort: 'high' },
          grammar: { system: 'Fix it.', effort: 'low' },
        },
      });
      await replaceTaskOverrides((cur) => {
        const next = { ...cur };
        delete next.translate;
        next.grammar = { system: 'Fix it.' };
        return next;
      });
      const s = await getSettings();
      expect(s.taskOverrides).toEqual({
        explain: { effort: 'high' },
        grammar: { system: 'Fix it.' },
      });
    });
  });

  describe('replacePerPresetTemplates — advanced-nested wholesale replace', () => {
    it('replacePerPresetTemplates drops a deleted preset override', async () => {
      const tpl = (suffix: string) => ({
        system: `sys-${suffix}`,
        user: `usr-${suffix}`,
      });
      await replacePerPresetTemplates({ arabizi: tpl('a'), 'elvish-quenya': tpl('e') });
      const cur = (await getSettings()).advanced.perPresetTemplates;
      const next = { ...cur };
      delete next['arabizi'];
      await replacePerPresetTemplates(next);
      const s = await getSettings();
      expect(Object.keys(s.advanced.perPresetTemplates)).toEqual(['elvish-quenya']);
    });
  });

  it('replaceRules runs read-modify-write inside the settings lock', async () => {
    const mk = (id: string, body: string) => ({
      id,
      body,
      category: 'always' as const,
      scope: { tasks: [] },
      source: 'manual' as const,
      addedAt: '2026-05-16T00:00:00.000Z',
      enabled: true,
    });
    // Read-modify-write via getSettings() + updateSettings() outside the lock drops one append.
    await Promise.all([
      replaceRules((cur) => [...cur, mk('r1', 'one')]),
      replaceRules((cur) => [...cur, mk('r2', 'two')]),
      replaceRules((cur) => [...cur, mk('r3', 'three')]),
    ]);
    const s = await getSettings();
    const ids = s.advanced.rules.map((r) => r.id).sort();
    expect(ids).toEqual(['r1', 'r2', 'r3']);
  });

  it('default pageContextLevel is minimal', async () => {
    const s = await getSettings();
    expect(s.pageContextLevel).toBe('minimal');
  });

  it('sanitizes pageContextLevel values (minimal / rich; else falls back to minimal)', async () => {
    await chrome.storage.local.set({
      'ega.settings': { ...DEFAULT_SETTINGS, pageContextLevel: 'garbage' },
    });
    const bundle = {
      version: 1 as const,
      exportedAt: '2026-04-18',
      settings: { ...DEFAULT_SETTINGS, pageContextLevel: 'garbage' } as unknown as Settings,
      customLanguages: [],
    };
    await importAs(bundle, 'settings', { includeApiKeys: true });
    const s = await getSettings();
    expect(s.pageContextLevel).toBe('minimal');

    // 'off' is no longer a valid level; the other two round-trip untouched.
    for (const lv of ['minimal', 'rich'] as const) {
      await importAs(
        {
          ...bundle,
          settings: { ...DEFAULT_SETTINGS, pageContextLevel: lv } as unknown as Settings,
        },
        'settings',
        { includeApiKeys: true },
      );
      const s2 = await getSettings();
      expect(s2.pageContextLevel).toBe(lv);
    }
  });

  it('an unknown pageContextLevel value falls back to minimal via field repair', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        ...DEFAULT_SETTINGS,
        pageContextLevel: 'off',
        contextEnabled: true,
      },
    });
    const s = await getSettings();
    expect(s.pageContextLevel).toBe('minimal');
    expect(s.contextEnabled).toBe(true);
  });

  it('upserts and deletes custom languages', async () => {
    const lang = {
      id: preset('c1'),
      label: 'WoW jargon',
      hint: 'WoW raid',
      examples: [],
      createdAt: 1,
    };
    await upsertCustomLanguage(lang);
    expect(await getCustomLanguages()).toHaveLength(1);
    await upsertCustomLanguage({ ...lang, label: 'WoW jargon v2' });
    const list = await getCustomLanguages();
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe('WoW jargon v2');
    await deleteCustomLanguage('c1');
    expect(await getCustomLanguages()).toHaveLength(0);
  });

  describe('export/import', () => {
    it('strips API keys by default (safe share)', async () => {
      await updateSettings({ anthropicApiKey: 'sk-live-secret', openaiApiKey: 'sk-oai-secret' });
      const bundle = await exportAll();
      expect(bundle.version).toBe(1);
      expect(bundle.settings.anthropicApiKey).toBeUndefined();
      expect(bundle.settings.openaiApiKey).toBeUndefined();
    });

    it('includes API keys when explicitly opted in', async () => {
      await updateSettings({ anthropicApiKey: 'sk-live-secret', openaiApiKey: 'sk-oai-secret' });
      const bundle = await exportAll({ includeApiKeys: true });
      expect(bundle.settings.anthropicApiKey).toBe('sk-live-secret');
      expect(bundle.settings.openaiApiKey).toBe('sk-oai-secret');
    });

    it('round-trips settings + custom languages', async () => {
      await updateSettings({ theme: 'dark', anthropicApiKey: 'sk-round-trip' });
      await upsertCustomLanguage({
        id: preset('r1'),
        label: 'Round trip',
        hint: 'test',
        examples: [{ src: 'a', tgt: 'b' }],
        createdAt: 1,
      });
      const bundle = await exportAll({ includeApiKeys: true });

      // parse(stringify(...)) drops undefined fields the way a real file round-trip does.
      await chrome.storage.local.clear();
      await importAs(JSON.parse(JSON.stringify(bundle)), 'settings', { includeApiKeys: true });

      const s = await getSettings();
      expect(s.theme).toBe('dark');
      expect(s.anthropicApiKey).toBe('sk-round-trip');
      const c = await getCustomLanguages();
      expect(c).toHaveLength(1);
      expect(c[0]?.examples).toHaveLength(1);
    });

    it('rejects a file that carries no Ega root key', async () => {
      await expect(importAs(null, 'settings')).rejects.toThrow(/not an Ega backup/);
      await expect(importAs('nope', 'settings')).rejects.toThrow(/not an Ega backup/);
      await expect(importAs({}, 'settings')).rejects.toThrow(/not an Ega backup/);
    });

    it('a newer backup asks for an update; an unknown version is not a backup', async () => {
      await expect(importAs({ version: 3 }, 'settings')).rejects.toThrow(
        'This backup is from a newer Ega. Update Ega, then import it.',
      );
      await expect(
        importAs({ version: 0, settings: {}, customLanguages: [] }, 'settings'),
      ).rejects.toThrow(/not an Ega backup/);
    });

    it('rejects missing settings / customLanguages', async () => {
      await expect(importAs({ version: 1, customLanguages: [] }, 'settings')).rejects.toThrow(
        /not an Ega backup/,
      );
      await expect(importAs({ version: 1, settings: {} }, 'settings')).rejects.toThrow(
        /not an Ega backup/,
      );
    });

    it('strips API keys from the bundle by default (safe share)', async () => {
      const bundle = {
        version: 1,
        exportedAt: '2026-04-18T00:00:00Z',
        settings: {
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'sk-evil',
          openaiApiKey: 'sk-also-evil',
        },
        customLanguages: [],
      };
      await importAs(bundle, 'settings');
      const s = await getSettings();
      expect(s.anthropicApiKey).toBeUndefined();
      expect(s.openaiApiKey).toBeUndefined();
    });

    it('sanitizes prototype-pollution attempts in perPresetTemplates', async () => {
      const bundle = {
        version: 1,
        exportedAt: '2026-04-18',
        settings: {
          ...DEFAULT_SETTINGS,
          advanced: {
            ...DEFAULT_SETTINGS.advanced,
            perPresetTemplates: {
              __proto__: { system: 'BAD', user: 'BAD {{text}}' },
              constructor: 'not-an-object',
              arabizi: { system: 'ok', user: '{{text}}' },
            } as unknown as Record<string, never>,
          },
        },
        customLanguages: [],
      };
      await importAs(bundle, 'settings');
      const s = await getSettings();
      expect(s.advanced.perPresetTemplates['arabizi']).toEqual({ system: 'ok', user: '{{text}}' });
      expect(Object.hasOwn(s.advanced.perPresetTemplates, '__proto__')).toBe(false);
      expect(Object.hasOwn(s.advanced.perPresetTemplates, 'constructor')).toBe(false);
    });

    it('clamps out-of-range advanced numbers (NaN, -1, huge)', async () => {
      const bundle = {
        version: 1,
        exportedAt: '2026-04-18',
        settings: {
          ...DEFAULT_SETTINGS,
          advanced: {
            ...DEFAULT_SETTINGS.advanced,
            temperature: Number.NaN,
            maxTokens: 9_999_999,
          },
        },
        customLanguages: [],
      };
      await importAs(bundle, 'settings');
      const s = await getSettings();
      expect(Number.isFinite(s.advanced.temperature)).toBe(true);
      expect(s.advanced.maxTokens).toBeLessThanOrEqual(8192);
    });

    it('rejects arrays disguised as settings', async () => {
      await expect(
        importAs({ version: 1, settings: [], customLanguages: [] }, 'settings'),
      ).rejects.toThrow(/not an Ega backup/);
    });

    it('a bundle without backendOrder imports with the default order', async () => {
      const bundle = {
        version: 1 as const,
        exportedAt: '2025-01-01',
        settings: { ...DEFAULT_SETTINGS } as unknown as Record<string, unknown>,
        customLanguages: [] as unknown[],
      };
      delete (bundle.settings as Record<string, unknown>)['backendOrder'];
      await importAs(bundle, 'settings', { includeApiKeys: true });
      const s = await getSettings();
      expect(s.backendOrder).toEqual(DEFAULT_SETTINGS.backendOrder);
    });

    it("strip-keys import keeps the user's CURRENT API keys", async () => {
      // The confirm dialog promises "use your current keys", so the live keys must survive.
      await updateSettings({ anthropicApiKey: 'sk-MY-LIVE', openaiApiKey: 'sk-MY-LIVE-O' });
      const shared = {
        version: 1 as const,
        exportedAt: '2026-04-18',
        settings: {
          ...DEFAULT_SETTINGS,
          anthropicApiKey: 'sk-from-shared-bundle',
          openaiApiKey: 'sk-from-shared-bundle-o',
        },
        customLanguages: [],
      };
      await importAs(shared, 'settings'); // default: strip keys
      const after = await getSettings();
      expect(after.anthropicApiKey).toBe('sk-MY-LIVE');
      expect(after.openaiApiKey).toBe('sk-MY-LIVE-O');
    });
  });

  describe('dangling-reference sanitization (read-time cross-checks)', () => {
    // Dangling ids are dropped with a console.warn, not kept as UI selections the user cannot fix.
    let warnSpy: MockInstance;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
    });

    async function writeRaw(patch: Record<string, unknown>): Promise<void> {
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, ...patch },
      });
    }

    it('backendOrder keeps the stored priority and drops unknown ids', async () => {
      await writeRaw({
        backendOrder: ['gemini', 'fakebackend', 'anthropic', 'openai'],
        disabledBackends: [],
      });
      const s = await getSettings();
      // fakebackend is dropped; the remaining registered ids are appended in default order.
      expect(s.backendOrder.slice(0, 3)).toEqual(['gemini', 'anthropic', 'openai']);
      expect(s.backendOrder).not.toContain('fakebackend');
      // No warn assertion here — warnSpy fires only for non-string entries.
    });

    it('disabledBackends filters out IDs not in registry', async () => {
      await writeRaw({ disabledBackends: ['openai', 'fakebackend', 'gemini'] });
      const s = await getSettings();
      expect(s.disabledBackends).toEqual(['openai', 'gemini']);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('disabledVarieties filters out IDs not in built-ins or customs', async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.customLanguages]: [
          { id: 'my-custom', label: 'Custom', hint: 'h', examples: [], createdAt: 1 },
        ],
      });
      await writeRaw({ disabledVarieties: ['arabizi', 'ghost-preset', 'my-custom', 'also-ghost'] });
      const s = await getSettings();
      expect(s.disabledVarieties).toEqual(['arabizi', 'my-custom']);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('varietyOverrides drops keys not in built-ins or customs', async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.customLanguages]: [
          { id: 'my-custom', label: 'Custom', hint: 'h', examples: [], createdAt: 1 },
        ],
      });
      await writeRaw({
        varietyOverrides: {
          arabizi: { hint: 'override-hint' },
          'ghost-preset': { hint: 'should-be-dropped' },
          'my-custom': { hint: 'custom-override' },
        },
      });
      const s = await getSettings();
      expect(Object.keys(s.varietyOverrides).sort()).toEqual(['arabizi', 'my-custom']);
      expect(s.varietyOverrides['arabizi']?.hint).toBe('override-hint');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('sitePrefs[host].defaultLang is dropped if not in built-ins or customs', async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.customLanguages]: [
          { id: 'my-custom', label: 'Custom', hint: 'h', examples: [], createdAt: 1 },
        ],
      });
      await writeRaw({
        sitePrefs: {
          'https://a.example': { disabled: false, defaultLang: 'arabizi' },
          'https://b.example': { disabled: false, defaultLang: 'ghost-preset' },
          'https://c.example': { disabled: false, defaultLang: 'my-custom' },
          'https://d.example': { disabled: false, defaultLang: 'auto' },
          'https://e.example': { disabled: false, defaultLang: 'en' },
        },
      });
      const s = await getSettings();
      expect(s.sitePrefs['https://a.example']?.defaultLang).toBe('arabizi');
      expect(s.sitePrefs['https://b.example']?.defaultLang).toBeUndefined();
      expect(s.sitePrefs['https://c.example']?.defaultLang).toBe('my-custom');
      // 'auto' and ISO codes are language codes, not variety ids, so the membership check skips them.
      expect(s.sitePrefs['https://d.example']?.defaultLang).toBe('auto');
      expect(s.sitePrefs['https://e.example']?.defaultLang).toBe('en');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('Settings.defaultLang falls back to "auto" if dangling variety id', async () => {
      await writeRaw({ defaultLang: 'ghost-preset' });
      const s = await getSettings();
      expect(s.defaultLang).toBe('auto');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('Settings.defaultLang preserves a known variety id', async () => {
      await writeRaw({ defaultLang: 'arabizi' });
      const s = await getSettings();
      expect(s.defaultLang).toBe('arabizi');
    });

    it('Settings.defaultLang preserves "auto" and ISO codes', async () => {
      await writeRaw({ defaultLang: 'auto' });
      expect((await getSettings()).defaultLang).toBe('auto');
      await writeRaw({ defaultLang: 'fr' });
      expect((await getSettings()).defaultLang).toBe('fr');
    });

    it('Settings.defaultTargetLang falls back to "en" if dangling variety id', async () => {
      await writeRaw({ defaultTargetLang: 'ghost-preset' });
      const s = await getSettings();
      expect(s.defaultTargetLang).toBe('en');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('sitePrefs[host].lastDirection.{source,target} drop the field if either side dangles', async () => {
      await writeRaw({
        sitePrefs: {
          'https://good.example': {
            disabled: false,
            lastDirection: { source: 'arabizi', target: 'en' },
          },
          'https://bad-source.example': {
            disabled: false,
            lastDirection: { source: 'ghost-preset', target: 'en' },
          },
          'https://bad-target.example': {
            disabled: false,
            lastDirection: { source: 'auto', target: 'ghost-preset' },
          },
        },
      });
      const s = await getSettings();
      expect(s.sitePrefs['https://good.example']?.lastDirection).toEqual({
        source: 'arabizi',
        target: 'en',
      });
      expect(s.sitePrefs['https://bad-source.example']?.lastDirection).toBeUndefined();
      expect(s.sitePrefs['https://bad-target.example']?.lastDirection).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('updateSettings concurrency', () => {
    it('serializes concurrent writes to different top-level fields — neither patch is lost', async () => {
      // The delay on set() widens the read window so both callers read before either write lands.
      const area = chrome.storage.local as unknown as {
        set: (items: Record<string, unknown>) => Promise<void>;
      };
      const origSet = area.set.bind(chrome.storage.local);
      area.set = (items: Record<string, unknown>) =>
        new Promise<void>((r) => {
          setTimeout(() => {
            void origSet(items).then(r);
          }, 5);
        });
      try {
        const [a, b] = await Promise.all([
          updateSettings({ cacheEnabled: false }),
          updateSettings({ pickerEnabled: false }),
        ]);
        // Each return value carries its own patch; the bug shows in what lands on disk.
        expect(a.cacheEnabled).toBe(false);
        expect(b.pickerEnabled).toBe(false);
        const final = await getSettings();
        expect(final.cacheEnabled).toBe(false);
        expect(final.pickerEnabled).toBe(false);
      } finally {
        area.set = origSet;
      }
    });

    it('serializes concurrent writes to arrays — second patch does not clobber first', async () => {
      const area = chrome.storage.local as unknown as {
        set: (items: Record<string, unknown>) => Promise<void>;
      };
      const origSet = area.set.bind(chrome.storage.local);
      area.set = (items: Record<string, unknown>) =>
        new Promise<void>((r) => {
          setTimeout(() => {
            void origSet(items).then(r);
          }, 5);
        });
      try {
        await Promise.all([
          updateSettings({ disabledBackends: ['openai'].map(bid) }),
          updateSettings({
            backendOrder: ['gemini', 'groq', 'anthropic', 'openai', 'native'].map(bid),
          }),
        ]);
        const final = await getSettings();
        expect(final.disabledBackends).toEqual(['openai']);
        expect(final.backendOrder.slice(0, 4)).toEqual(['gemini', 'groq', 'anthropic', 'openai']);
      } finally {
        area.set = origSet;
      }
    });
  });

  describe('updateSettings deep-merge — task map shapes', () => {
    beforeEach(async () => {
      await chrome.storage.local.clear();
    });

    it('a taskOverrides patch replaces the whole map, so a reset field cannot come back', async () => {
      await updateSettings({ taskOverrides: { translate: { effort: 'low' } } });
      await updateSettings({ taskOverrides: { explain: { effort: 'high' } } });
      const s = await getSettings();
      expect(s.taskOverrides).toEqual({ explain: { effort: 'high' } });
    });

    it('partial varietyOverrides update preserves untouched keys', async () => {
      await updateSettings({ varietyOverrides: { arabizi: { hint: 'A' } } });
      await updateSettings({ varietyOverrides: { 'elvish-quenya': { hint: 'E' } } });
      const s = await getSettings();
      expect(s.varietyOverrides['arabizi']).toEqual({ hint: 'A' });
      expect(s.varietyOverrides['elvish-quenya']).toEqual({ hint: 'E' });
    });
  });

  describe('exportVarieties / varieties import', () => {
    beforeEach(async () => {
      await chrome.storage.local.clear();
    });

    it('round-trips a full bundle', async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: {
          ...DEFAULT_SETTINGS,
          varietyOverrides: { arabizi: { hint: 'Arabizi (mine)' } },
          disabledVarieties: ['elvish-quenya'],
        },
        [STORAGE_KEYS.customLanguages]: [
          {
            id: 'custom-test',
            label: 'Pirate',
            hint: 'Talk like a pirate',
            examples: [],
            createdAt: 1714521600000,
          },
        ],
      });
      const bundle = await exportVarieties();
      expect(bundle.egaVarieties.v).toBe(2);
      expect(bundle.egaVarieties.customLanguages).toHaveLength(1);
      expect(bundle.egaVarieties.varietyOverrides['arabizi']?.hint).toBe('Arabizi (mine)');
      expect(bundle.egaVarieties.disabledVarieties).toEqual(['elvish-quenya']);

      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: {
          ...DEFAULT_SETTINGS,
          varietyOverrides: {},
          disabledVarieties: [],
        },
        [STORAGE_KEYS.customLanguages]: [],
      });
      const { result } = await importAs(bundle, 'varieties');
      expect(result.customLanguagesAdded).toBe(1);
      expect(result.varietyOverridesApplied).toBe(1);
      expect(result.disabledVarietiesApplied).toBe(1);
      expect(result.droppedDanglingOverrides).toEqual([]);
      expect(result.droppedUnknownDisabled).toEqual([]);

      const customs = await getCustomLanguages();
      expect(customs).toHaveLength(1);
      const settings = await getSettings();
      expect(settings.varietyOverrides['arabizi']?.hint).toBe('Arabizi (mine)');
      expect(settings.disabledVarieties).toEqual(['elvish-quenya']);
    });

    it('a failed settings write leaves the custom languages as they were', async () => {
      const mine = { id: 'custom-mine', label: 'Mine', hint: 'h', examples: [], createdAt: 1 };
      await chrome.storage.local.set({ [STORAGE_KEYS.customLanguages]: [mine] });
      const realSet = chrome.storage.local.set.bind(chrome.storage.local);
      const failSettingsWrite = ((items: Record<string, unknown>) =>
        STORAGE_KEYS.settings in items
          ? Promise.reject(new Error('quota'))
          : realSet(items)) as typeof chrome.storage.local.set;
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementation(failSettingsWrite);
      await expect(
        importAs(
          {
            egaVarieties: {
              v: 1,
              exportedAt: new Date().toISOString(),
              customLanguages: [{ ...mine, id: 'custom-theirs', label: 'Theirs' }],
              varietyOverrides: {},
              disabledVarieties: [],
            },
          },
          'varieties',
        ),
      ).rejects.toThrow('quota');
      setSpy.mockRestore();
      expect((await getCustomLanguages()).map((c) => c.id)).toEqual(['custom-mine']);
    });

    it('REPLACES varietyOverrides — an override on a preset absent from the bundle is dropped', async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: {
          ...DEFAULT_SETTINGS,
          varietyOverrides: { arabizi: { hint: 'STALE EDIT' } },
        },
      });
      await importAs(
        {
          egaVarieties: {
            v: 1,
            exportedAt: new Date().toISOString(),
            customLanguages: [],
            varietyOverrides: { 'elvish-quenya': { hint: 'imported' } },
            disabledVarieties: [],
          },
        },
        'varieties',
      );
      const s = await getSettings();
      // The dialog promises "replaced", so the stale arabizi override must be gone, not merged.
      expect(s.varietyOverrides['arabizi']).toBeUndefined();
      expect(s.varietyOverrides['elvish-quenya']?.hint).toBe('imported');
    });

    it('rejects a file with no varieties root key', async () => {
      await expect(importAs({ wrong: 'shape' }, 'varieties')).rejects.toThrow(/not an Ega backup/);
    });

    it('rejects a non-object (e.g. string)', async () => {
      // The UI layer catches JSON.parse first; a non-object reaching here must still give a readable error.
      await expect(importAs('not json {', 'varieties')).rejects.toThrow(/not an Ega backup/);
    });

    it('surfaces the first failing field path in the schema-validation error', async () => {
      // The object passes the top-level key check, so only the dotted path tells a caller what failed.
      await expect(
        importAs(
          {
            egaVarieties: {
              v: 1,
              exportedAt: '2026-01-01',
              customLanguages: 'not-an-array',
              varietyOverrides: {},
              disabledVarieties: [],
            },
          },
          'varieties',
        ),
      ).rejects.toThrow(/invalid varieties bundle.*customLanguages/i);
    });

    it('rejects wrong version', async () => {
      await expect(
        importAs(
          {
            egaVarieties: {
              v: 3,
              exportedAt: '2026-01-01',
              customLanguages: [],
              varietyOverrides: {},
              disabledVarieties: [],
            },
          },
          'varieties',
        ),
      ).rejects.toThrow(/exported by a different Ega version/i);
    });

    it('a v1 import drops the prompt of a custom language it removes, as deleting it would', async () => {
      const tpl = { system: 'Pirate.', user: '{{text}}' };
      const kept = { system: 'Arabizi.', user: '{{text}}' };
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: {
          ...DEFAULT_SETTINGS,
          advanced: {
            ...DEFAULT_SETTINGS.advanced,
            perPresetTemplates: { 'custom-gone': tpl, arabizi: kept },
          },
        },
        [STORAGE_KEYS.customLanguages]: [
          { id: 'custom-gone', label: 'Pirate', hint: 'h', examples: [], createdAt: 1 },
        ],
      });
      await importAs(
        {
          egaVarieties: {
            v: 1,
            exportedAt: '2026-10-02',
            customLanguages: [],
            varietyOverrides: {},
            disabledVarieties: [],
          },
        },
        'varieties',
      );
      expect((await getSettings()).advanced.perPresetTemplates).toEqual({ arabizi: kept });
    });

    it('carries each language prompt; a version 1 file keeps the current ones', async () => {
      const mine = { system: 'Levantine first.', user: '{{text}}' };
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: {
          ...DEFAULT_SETTINGS,
          advanced: { ...DEFAULT_SETTINGS.advanced, perPresetTemplates: { arabizi: mine } },
        },
      });
      const file = JSON.parse(JSON.stringify(await exportVarieties()));
      expect(file.egaVarieties.presetTemplates).toEqual({ arabizi: mine });

      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
      const { result } = await importAs(
        {
          egaVarieties: {
            ...file.egaVarieties,
            presetTemplates: { ...file.egaVarieties.presetTemplates, 'no-such-language': mine },
          },
        },
        'varieties',
      );
      expect(result.presetTemplatesApplied).toBe(1);
      expect(result.droppedDanglingOverrides).toEqual(['no-such-language']);
      expect((await getSettings()).advanced.perPresetTemplates).toEqual({ arabizi: mine });

      const v1 = { egaVarieties: { ...file.egaVarieties, v: 1 } };
      delete v1.egaVarieties.presetTemplates;
      const kept = { system: 'kept', user: '{{text}}' };
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: {
          ...DEFAULT_SETTINGS,
          advanced: { ...DEFAULT_SETTINGS.advanced, perPresetTemplates: { arabizi: kept } },
        },
      });
      await importAs(v1, 'varieties');
      expect((await getSettings()).advanced.perPresetTemplates).toEqual({ arabizi: kept });
    });

    it('drops dangling override ids and reports them', async () => {
      const bundle: VarietiesBundle = {
        egaVarieties: {
          v: 1,
          exportedAt: '2026-01-01',
          customLanguages: [],
          varietyOverrides: { 'no-such-builtin': { label: 'X' } },
          disabledVarieties: [],
        },
      };
      const { result } = await importAs(bundle, 'varieties');
      expect(result.droppedDanglingOverrides).toEqual(['no-such-builtin']);
      expect(result.varietyOverridesApplied).toBe(0);
    });

    it('drops unknown disabled ids and reports them', async () => {
      const bundle: VarietiesBundle = {
        egaVarieties: {
          v: 1,
          exportedAt: '2026-01-01',
          customLanguages: [],
          varietyOverrides: {},
          disabledVarieties: ['no-such-id'],
        },
      };
      const { result } = await importAs(bundle, 'varieties');
      expect(result.droppedUnknownDisabled).toEqual(['no-such-id']);
      expect(result.disabledVarietiesApplied).toBe(0);
    });

    it('skips malformed custom entries and imports valid ones', async () => {
      const malformed = { id: 'bad', label: 42, hint: 'ok', examples: [], createdAt: 1 };
      const valid = {
        id: 'custom-good',
        label: 'Good',
        hint: 'valid entry',
        examples: [],
        createdAt: 1000,
      };
      const bundle = {
        egaVarieties: {
          v: 1,
          exportedAt: '2026-01-01',
          customLanguages: [malformed, valid],
          varietyOverrides: {},
          disabledVarieties: [],
        },
      };
      const { result } = await importAs(bundle, 'varieties');
      expect(result.customLanguagesAdded).toBe(1);
      expect(result.skippedBroken).toBe(1);
      const customs = await getCustomLanguages();
      expect(customs).toHaveLength(1);
      expect(customs[0]?.label).toBe('Good');
    });

    it('returns skippedBroken=0 for a fully valid bundle', async () => {
      const bundle: VarietiesBundle = {
        egaVarieties: {
          v: 1,
          exportedAt: '2026-01-01',
          customLanguages: [],
          varietyOverrides: {},
          disabledVarieties: [],
        },
      };
      const { result } = await importAs(bundle, 'varieties');
      expect(result.skippedBroken).toBe(0);
    });
  });

  it('exportAll -> settings import preserves taskOverrides / defaultTask / defaultTone', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: {
        ...DEFAULT_SETTINGS,
        taskOverrides: { summarize: { system: 'X', user: 'U {{text}}' } },
        defaultTask: 'reword',
        defaultTone: 'blunt',
      },
    });
    const bundle = await exportAll({ includeApiKeys: false });
    await chrome.storage.local.clear();
    await importAs(bundle, 'settings', { includeApiKeys: false });
    const s = await getSettings();
    expect(s.taskOverrides.summarize).toEqual({ system: 'X', user: 'U {{text}}' });
    expect(s.defaultTask).toBe('reword');
    expect(s.defaultTone).toBe('blunt');
  });

  describe('mutation invariants', () => {
    beforeEach(async () => {
      await chrome.storage.local.clear();
    });

    it('upsertCustomLanguage with same id twice updates in-place (idempotent upsert)', async () => {
      const lang = {
        id: preset('mi-1'),
        label: 'v1',
        hint: 'hint',
        examples: [] as { src: string; tgt: string }[],
        createdAt: 1,
      };
      await upsertCustomLanguage(lang);
      await upsertCustomLanguage({ ...lang, label: 'v2' });
      await upsertCustomLanguage({ ...lang, label: 'v3' });

      const list = await getCustomLanguages();
      expect(list.filter((l) => l.id === lang.id)).toHaveLength(1);
      expect(list.find((l) => l.id === lang.id)?.label).toBe('v3');
    });

    it('deleteCustomLanguage for absent id does not throw and leaves list intact', async () => {
      const lang = {
        id: preset('mi-2'),
        label: 'keep',
        hint: 'h',
        examples: [] as { src: string; tgt: string }[],
        createdAt: 1,
      };
      await upsertCustomLanguage(lang);

      await expect(deleteCustomLanguage('does-not-exist')).resolves.toBeUndefined();

      const list = await getCustomLanguages();
      expect(list.find((l) => l.id === lang.id)).toBeDefined();
    });

    it('a settings import rejects a bad version without mutating existing settings', async () => {
      await updateSettings({ theme: 'dark' });
      const before = await getSettings();

      await expect(
        importAs({ version: 99, settings: {}, customLanguages: [] }, 'settings'),
      ).rejects.toThrow();

      const after = await getSettings();
      expect(after.theme).toBe(before.theme);
    });

    it('a settings import rejects a malformed settings object without mutating existing settings', async () => {
      await updateSettings({ theme: 'dark' });

      await expect(
        importAs({ version: 1, settings: [], customLanguages: [] }, 'settings'),
      ).rejects.toThrow();

      const after = await getSettings();
      expect(after.theme).toBe('dark');
    });

    it('replaceSitePrefs({}) clears all site prefs (reversibility to empty)', async () => {
      await updateSettings({
        sitePrefs: {
          'https://a.example': { disabled: false },
          'https://b.example': { disabled: true },
        },
      });
      await replaceSitePrefs({});
      const s = await getSettings();
      expect(Object.keys(s.sitePrefs)).toHaveLength(0);
    });

    it('a full-snapshot write keeps disabledVarieties written by another writer', async () => {
      await updateSettings({ disabledVarieties: ['arabizi'] });
      await updateSettings({ ...(await getSettings()), theme: 'dark' });
      const s = await getSettings();
      expect(s.theme).toBe('dark');
      expect(s.disabledVarieties).toEqual(['arabizi']);
    });

    it('a full-snapshot write keeps sitePrefs from the stored row', async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: {
          schemaVersion: 4,
          sitePrefs: { 'https://example.com': { disabled: true } },
        },
      });
      await updateSettings({ ...(await getSettings()), theme: 'dark' });
      const s = await getSettings();
      expect(s.sitePrefs['https://example.com']?.disabled).toBe(true);
    });

    it('Reset-all (advanced defaults + replaceSitePrefs({})) keeps API keys and perPresetTemplates', async () => {
      await updateSettings({
        anthropicApiKey: 'sk-ant-x',
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          perPresetTemplates: { arabizi: { system: 'keep', user: 'me' } },
        },
      });
      // The partial advanced patch the Advanced tab's Reset button sends.
      await updateSettings({
        advanced: {
          promptTemplate: { ...DEFAULT_PROMPT_TEMPLATE },
          temperature: DEFAULT_SETTINGS.advanced.temperature,
          maxTokens: DEFAULT_SETTINGS.advanced.maxTokens,
        } as Settings['advanced'],
      });
      await replaceSitePrefs({});
      const s = await getSettings();
      expect(s.anthropicApiKey).toBe('sk-ant-x');
      expect(s.advanced.perPresetTemplates['arabizi']).toEqual({ system: 'keep', user: 'me' });
    });

    it('replaceVarietyOverrides after partial updateSettings merge correctly replaces overrides', async () => {
      await updateSettings({ varietyOverrides: { arabizi: { hint: 'from-update' } } });
      await replaceVarietyOverrides({ 'elvish-quenya': { hint: 'from-replace' } });

      const s = await getSettings();
      expect(s.varietyOverrides['arabizi']).toBeUndefined();
      expect(s.varietyOverrides['elvish-quenya']?.hint).toBe('from-replace');
    });

    it('a varieties import run twice replaces customs each time (wholesale replace, not append)', async () => {
      const bundle1 = {
        egaVarieties: {
          v: 1 as const,
          exportedAt: '2026-01-01',
          customLanguages: [
            {
              id: preset('custom-a'),
              label: 'LangA',
              hint: 'a',
              examples: [] as { src: string; tgt: string }[],
              createdAt: 1,
            },
          ],
          varietyOverrides: {},
          disabledVarieties: [],
        },
      };
      const bundle2 = {
        egaVarieties: {
          v: 1 as const,
          exportedAt: '2026-01-01',
          customLanguages: [
            {
              id: preset('custom-b'),
              label: 'LangB',
              hint: 'b',
              examples: [] as { src: string; tgt: string }[],
              createdAt: 2,
            },
          ],
          varietyOverrides: {},
          disabledVarieties: [],
        },
      };

      await importAs(bundle1, 'varieties');
      await importAs(bundle2, 'varieties');

      const customs = await getCustomLanguages();
      expect(customs).toHaveLength(1);
      expect(customs[0]?.label).toBe('LangB');
    });
  });

  describe('backendOrder — normalization', () => {
    it('a row without backendOrder falls back to the default order', async () => {
      await chrome.storage.local.set({
        'ega.settings': { disabledBackends: ['groq'] },
      });
      const s = await getSettings();
      expect(s.backendOrder).toEqual(DEFAULT_SETTINGS.backendOrder);
      expect(s.disabledBackends).toEqual(['groq']);
    });

    it('appends missing registered backends at the end on read', async () => {
      await chrome.storage.local.set({
        'ega.settings': { backendOrder: ['anthropic', 'gemini'] },
      });
      const s = await getSettings();
      expect(s.backendOrder[0]).toBe('anthropic');
      expect(s.backendOrder).toContain('groq');
      expect(s.backendOrder).toContain('deepseek');
    });

    it('an opt-in backend an older stored order never had stays off after an update', async () => {
      await chrome.storage.local.set({
        'ega.settings': {
          backendOrder: ['anthropic', 'ollama', 'native', 'gemini'],
          disabledBackends: ['ollama'],
        },
      });
      const s = await getSettings();
      expect(s.backendOrder).toContain('localserver');
      expect(s.disabledBackends).toContain('localserver');
      expect(s.disabledBackends).toContain('ollama');
      // A backend the stored order already had keeps the user's choice.
      expect(s.disabledBackends).not.toContain('native');
      expect(s.disabledBackends).not.toContain('gemini');
    });

    it('keeps an opt-in backend on once the stored order has it enabled', async () => {
      await chrome.storage.local.set({
        'ega.settings': { backendOrder: [...DEFAULT_SETTINGS.backendOrder], disabledBackends: [] },
      });
      expect((await getSettings()).disabledBackends).toEqual([]);
    });

    it('drops unknown ids and dedupes', async () => {
      await chrome.storage.local.set({
        'ega.settings': { backendOrder: ['openai', 'bogus', 'openai', 'gemini'] },
      });
      const s = await getSettings();
      expect(s.backendOrder.filter((id) => id === 'openai')).toHaveLength(1);
      expect(s.backendOrder).not.toContain('bogus');
    });

    it('writes the normalized order, so the caller does not hold a stale one', async () => {
      const written = await updateSettings({
        backendOrder: ['openai', 'bogus', 'openai'].map((id) => bid(id)),
      });
      expect(written.backendOrder.filter((id) => id === 'openai')).toHaveLength(1);
      expect(written.backendOrder).not.toContain('bogus');

      const raw = (await chrome.storage.local.get('ega.settings'))['ega.settings'] as {
        backendOrder: string[];
      };
      expect(raw.backendOrder).toEqual(written.backendOrder);
    });

    it('refuses to write a settings update that would leave zero enabled backends', async () => {
      // With every backend disabled the router has no fallback path left.
      await chrome.storage.local.set({
        'ega.settings': { disabledBackends: [] },
      });
      await expect(
        updateSettings({
          disabledBackends: [
            'anthropic',
            'openai',
            'gemini',
            'ollama',
            'localserver',
            'native',
            'groq',
            'deepseek',
            'together',
            'mistral',
            'xai',
            'fireworks',
            'openrouter',
          ].map(bid),
        }),
      ).rejects.toThrow(/at least one backend/i);
    });
  });
});

describe('a settings import cannot leave the row unwritable', () => {
  it('re-enables the first backend when the bundle disabled every one, so a later theme save still lands', async () => {
    const cur = await getSettings();
    const bundle = await exportAll();
    await importAs(
      {
        ...bundle,
        settings: { ...bundle.settings, disabledBackends: [...cur.backendOrder] },
      },
      'settings',
      { includeApiKeys: false },
    );
    const after = await getSettings();
    expect(after.disabledBackends).not.toContain(after.backendOrder[0]);
    await expect(updateSettings({ theme: 'dark' })).resolves.toMatchObject({ theme: 'dark' });
  });

  it('still refuses a patch that disables the last backend', async () => {
    const cur = await getSettings();
    await expect(updateSettings({ disabledBackends: [...cur.backendOrder] })).rejects.toThrow(
      /at least one backend/i,
    );
  });

  it("keeps a custom language's autoDetect through a full restore", async () => {
    const bundle = await exportAll();
    await importAs(
      {
        ...bundle,
        customLanguages: [
          {
            id: 'custom-elvish-x',
            label: 'Elvish X',
            hint: 'made up',
            examples: [{ src: 'a', tgt: 'b' }],
            autoDetect: { regex: '\bnamarie\b', flags: 'i', minScore: 0.5 },
            createdAt: 1,
          },
        ],
      },
      'settings',
      { includeApiKeys: false },
    );
    const langs = await getCustomLanguages();
    expect(langs.find((l) => l.id === 'custom-elvish-x')?.autoDetect).toEqual({
      regex: '\bnamarie\b',
      flags: 'i',
      minScore: 0.5,
    });
  });
});

it('the storage module exposes one import path', async () => {
  const mod = await import('@/shared/storage');
  expect(['importAll', 'importVarieties', 'importTaskPresets'].filter((k) => k in mod)).toEqual([]);
});
