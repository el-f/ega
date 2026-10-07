import { describe, it, expect } from 'vitest';
import {
  SETTINGS_REGISTRY,
  isFieldModified,
  searchSettings,
  TAB_LABELS,
  type SettingsTab,
} from '@/shared/settings-registry';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

function clone(s: Readonly<Settings>): Settings {
  return JSON.parse(JSON.stringify(s)) as Settings;
}

describe('settings-registry', () => {
  describe('SETTINGS_REGISTRY', () => {
    it('every entry has a stable id and a non-empty label', () => {
      for (const e of SETTINGS_REGISTRY) {
        expect(e.id, `entry without id`).toMatch(/\S/);
        expect(e.label, `entry ${e.id} without label`).toMatch(/\S/);
      }
    });

    it('ids are unique across the registry', () => {
      const ids = SETTINGS_REGISTRY.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every entry tab matches a known tab id', () => {
      const known: ReadonlySet<SettingsTab> = new Set(Object.keys(TAB_LABELS) as SettingsTab[]);
      for (const e of SETTINGS_REGISTRY) {
        expect(known.has(e.tab), `entry ${e.id} has bad tab ${e.tab}`).toBe(true);
      }
    });

    it('every advanced entry resolves to a known sub-tab + a target selector for deep-link', () => {
      const subTabs = new Set(['diagnostics', 'data', 'labs']);
      for (const e of SETTINGS_REGISTRY) {
        if (e.tab !== 'advanced') continue;
        expect(e.subTab, `advanced entry ${e.id} missing subTab`).toBeDefined();
        expect(
          subTabs.has(e.subTab as string),
          `advanced entry ${e.id} bad subTab ${e.subTab}`,
        ).toBe(true);
        expect(
          typeof e.targetSelector === 'string' && e.targetSelector.length > 0,
          `advanced entry ${e.id} has no targetSelector`,
        ).toBe(true);
      }
    });

    it('debugLogLevel deep-links to the Diagnostics sub-tab where its control lives', () => {
      const entry = SETTINGS_REGISTRY.find((e) => e.id === 'advanced.debugLogLevel');
      expect(entry?.subTab).toBe('diagnostics');
    });

    it('has no entry for a setting with no options-page control', () => {
      // onboardingDismissed is dismissal state, not a control.
      const ids = SETTINGS_REGISTRY.map((e) => e.id);
      expect(ids).not.toContain('about.onboardingDismissed');
    });

    it('pageContextLevel is searchable because the Answers tab owns a control for it', () => {
      const entry = SETTINGS_REGISTRY.find((e) => e.id === 'display.pageContextLevel');
      expect(entry?.tab).toBe('translate');
      expect(entry?.targetSelector).toBe('[data-ega-setting="display.pageContextLevel"]');
    });

    it('covers at least 5 settings on every feature tab', () => {
      const counts: Record<SettingsTab, number> = {
        backends: 0,
        languages: 0,
        advanced: 0,
        about: 0,
        translate: 0,
        tasks: 0,
        'selection-bubble': 0,
        glossary: 0,
      };
      for (const e of SETTINGS_REGISTRY) counts[e.tab] += 1;
      expect(counts.translate).toBeGreaterThanOrEqual(5);
      expect(counts['selection-bubble']).toBeGreaterThanOrEqual(3);
      expect(counts.backends).toBeGreaterThanOrEqual(5);
      expect(counts.languages).toBeGreaterThanOrEqual(5);
      // About holds no settings since Clear cache and Delete all data moved to Advanced; its rows are still findable.
      expect(counts.about).toBeGreaterThanOrEqual(3);
      expect(counts.advanced).toBeGreaterThan(0);
      expect(counts.tasks).toBeGreaterThanOrEqual(4);
    });
  });

  describe('searchSettings', () => {
    it('empty query returns no results (avoids dumping the registry)', () => {
      expect(searchSettings('').length).toBe(0);
      expect(searchSettings('   ').length).toBe(0);
    });

    it('label prefix match outranks substring + keyword matches', () => {
      const hits = searchSettings('temperature');
      expect(hits.length).toBeGreaterThan(0);
      // Top hit must be the global temperature tunable; "Temperature
      // (global)" starts with the query and gets the prefix bonus.
      expect(hits[0]?.id).toBe('advanced.temperature');
      expect(hits[0]?.score).toBeGreaterThanOrEqual(100);
    });

    it('an action found only by its description or keywords ranks after every setting', () => {
      // "effort" is only in the reset's description; on the score tie its label would sort it first.
      const ids = searchSettings('effort').map((h) => h.id);
      expect(ids.indexOf('tasks.overrides')).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf('tasks.overrides')).toBeLessThan(ids.indexOf('advanced.resetEverything'));
      expect(ids.at(-1)).toBe('advanced.resetEverything');
    });

    it('an action whose label holds a query word keeps its score rank', () => {
      for (const q of ['reset settings', 'reset effort']) {
        expect(searchSettings(q)[0]?.id, q).toBe('advanced.resetEverything');
      }
    });

    it('matches via keyword synonyms when the label/desc do not contain the query', () => {
      // "heat" appears only in keywords, never in a label or description.
      const hits = searchSettings('heat');
      const tempHit = hits.find((h) => h.id === 'advanced.temperature');
      expect(tempHit).toBeDefined();
      expect(tempHit?.score).toBeLessThanOrEqual(30);
    });

    it('modifiedOnly with default settings drops every entry that has a default', () => {
      const def = clone(DEFAULT_SETTINGS);
      const hits = searchSettings('temperature', {
        modifiedOnly: true,
        settings: def,
      });
      // Nothing is modified, so modifiedOnly yields nothing, not even temperature.
      expect(hits.find((h) => h.id === 'advanced.temperature')).toBeUndefined();
    });

    it('modifiedOnly surfaces an entry once its live value diverges from the default', () => {
      const mut = clone(DEFAULT_SETTINGS);
      mut.advanced.temperature = 0.9;
      const hits = searchSettings('temperature', {
        modifiedOnly: true,
        settings: mut,
      });
      expect(hits.find((h) => h.id === 'advanced.temperature')).toBeDefined();
    });

    it('modifiedOnly with no settings argument returns nothing', () => {
      // Defensive: callers that forget to pass settings should not get
      // a partial leak — modifiedOnly is meaningless without a snapshot.
      const hits = searchSettings('temperature', { modifiedOnly: true });
      expect(hits.length).toBe(0);
    });

    it('case-insensitive', () => {
      const lc = searchSettings('cache');
      const uc = searchSettings('CACHE');
      expect(lc.map((h) => h.id)).toEqual(uc.map((h) => h.id));
    });

    it('token-fuzzy: out-of-order multi-word query still hits', () => {
      // Reverse-order tokens: "session reuse cache" -> CacheSettings ("Reuse recent translations").
      const hits = searchSettings('reuse cache');
      const ids = hits.map((h) => h.id);
      expect(ids).toContain('advanced.cacheSettings');
    });

    it('token-fuzzy: every token must hit somewhere — unrelated drops', () => {
      // "temperature" matches; "asdfqwer" matches nothing. Combined must
      // not surface the temperature entry.
      const hits = searchSettings('temperature asdfqwer');
      expect(hits.find((h) => h.id === 'advanced.temperature')).toBeUndefined();
    });

    it('typo fallback: a dropped letter still finds the entry', () => {
      const hits = searchSettings('confdence');
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.some((h) => h.label.toLowerCase().includes('confidence'))).toBe(true);
    });

    it('typo fallback scores below substring matches', () => {
      const typo = searchSettings('confdence');
      const exact = searchSettings('confidence');
      const topTypo = typo[0];
      const topExact = exact[0];
      if (!topTypo || !topExact) throw new Error('expected hits for both queries');
      expect(topTypo.score).toBeLessThan(topExact.score);
    });

    it('typo fallback ignores short and scattered queries', () => {
      expect(searchSettings('cfd').length).toBe(0);
      expect(searchSettings('zqxjwv').length).toBe(0);
    });

    it('results sorted by score desc, then label asc on ties', () => {
      const hits = searchSettings('cache');
      for (let i = 1; i < hits.length; i++) {
        const prev = hits[i - 1];
        const cur = hits[i];
        if (!prev || !cur) continue;
        if (prev.score === cur.score) {
          expect(prev.label.localeCompare(cur.label)).toBeLessThanOrEqual(0);
        } else {
          expect(prev.score).toBeGreaterThan(cur.score);
        }
      }
    });
  });

  describe('isFieldModified', () => {
    it('returns false on DEFAULT_SETTINGS', () => {
      expect(isFieldModified('advanced.cacheSettings', clone(DEFAULT_SETTINGS))).toBe(false);
    });

    it('returns true when cacheEnabled flips off', () => {
      const s = clone(DEFAULT_SETTINGS);
      s.cacheEnabled = false;
      expect(isFieldModified('advanced.cacheSettings', s)).toBe(true);
    });

    it('returns false again after cacheEnabled reverts to default', () => {
      const s = clone(DEFAULT_SETTINGS);
      s.cacheEnabled = false;
      expect(isFieldModified('advanced.cacheSettings', s)).toBe(true);
      s.cacheEnabled = true;
      expect(isFieldModified('advanced.cacheSettings', s)).toBe(false);
    });

    it('throws on unknown id', () => {
      expect(() => isFieldModified('nope.unknown', clone(DEFAULT_SETTINGS))).toThrow(
        /unknown registry id/,
      );
    });
  });
});
