import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseStoredSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

type Raw = Record<string, unknown>;
type Advanced = Record<string, unknown>;

/** Each section holds a canary value and no poison touches a canary field, so a canary back at its default means the reader reset the whole section. */
function canarySettings(): Raw {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    theme: 'dark',
    cacheEnabled: false,
    defaultTargetLang: 'fr',
    taskMaxTokens: { explain: 512 },
    glossary: [{ term: 'Ega', translation: 'Ega' }],
    varietyOverrides: { arabizi: { label: 'My Arabizi' } },
    disabledVarieties: ['arabizi'],
    advanced: {
      ...structuredClone(DEFAULT_SETTINGS.advanced),
      maxTokens: 4242,
      promptTemplate: { system: 'MYSYS', user: 'MYUSER' },
      snippets: { greeting: 'hi' },
      rules: [
        {
          id: 'canary',
          body: 'always keep names untranslated',
          category: 'always',
          scope: { tasks: [] },
          source: 'manual',
          addedAt: '2026-08-14T00:00:00.000Z',
          enabled: true,
        },
      ],
    },
  } as Raw;
}

const adv = (raw: Raw): Advanced => raw['advanced'] as Advanced;

const POISONS: readonly ((raw: Raw, over: number) => void)[] = [
  (raw, over) => {
    adv(raw)['customSlotDescriptions'] = { tone: 'x'.repeat(280 + over) };
  },
  (raw, over) => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 50 + (over % 40) + 1; i += 1) many[`slot${i}`] = 'd';
    adv(raw)['customSlotDescriptions'] = many;
  },
  (raw, over) => {
    adv(raw)['userRecipes'] = Array.from({ length: 50 + (over % 40) + 1 }, (_, i) => ({ id: i }));
  },
  (raw, over) => {
    adv(raw)['taskBackendChains'] = {
      translate: Array.from({ length: 10 + (over % 20) + 1 }, () => 'anthropic'),
    };
  },
  (raw, over) => {
    adv(raw)['perPresetTemplates'] = { arabizi: { system: 'S'.repeat(16_000 + over), user: 'u' } };
  },
  (raw) => {
    adv(raw)['debugLogLevel'] = 'verbose';
  },
  (raw, over) => {
    adv(raw)['retryCount'] = over;
  },
  (raw) => {
    adv(raw)['retiredLabsToggle'] = { nested: true };
  },
  (raw) => {
    raw['retiredTopLevelField'] = 42;
  },
  (raw, over) => {
    raw['selectionContextCap'] = 800 + over;
  },
  (raw, over) => {
    raw['customLanguagesAreNotHere'] = 'x'.repeat(over);
  },
  (raw, over) => {
    raw['taskTemperatures'] = { translate: 2 + over, 'retired-task': 1 };
  },
  (raw, over) => {
    raw['contextMenuLayout'] = `layout-${over}`;
  },
  (raw, over) => {
    raw['sitePrefs'] = { 'https://example.com': { disabled: true, retiredKey: over } };
  },
];

const poisonArb = fc.constantFrom(...POISONS);

describe('preCleanForStorage (via parseStoredSettings)', () => {
  it('never returns a malformed object for any raw input — always valid Settings or throws', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        const result = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
        expect(result).not.toBeNull();
        expect(typeof result.theme).toBe('string');
        expect(typeof result.advanced).toBe('object');
        expect(Array.isArray(result.advanced.rules)).toBe(true);
        expect(Array.isArray(result.backendOrder)).toBe(true);
      }),
    );
  });

  it('never throws — always returns a usable Settings', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        expect(() => parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS })).not.toThrow();
      }),
    );
  });

  it('returns DEFAULT_SETTINGS for null input', () => {
    const result = parseStoredSettings(null, { defaults: DEFAULT_SETTINGS });
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('returns DEFAULT_SETTINGS for undefined input', () => {
    const result = parseStoredSettings(undefined, { defaults: DEFAULT_SETTINGS });
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('strips __proto__ / constructor / prototype injection keys', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[\w ]+$/.test(s)),
        (val) => {
          const poisoned = JSON.parse(
            JSON.stringify({ __proto__: { injected: val }, theme: 'dark' }),
          ) as unknown;
          const result = parseStoredSettings(poisoned, { defaults: DEFAULT_SETTINGS });
          expect((result as Record<string, unknown>)['injected']).toBeUndefined();
        },
      ),
    );
  });

  it('absorbs unknown advanced keys without crashing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'profiles',
          'activeProfile',
          'templateHistory',
          'goldenInputs',
          'nativePersistentSession',
        ),
        (unknownKey) => {
          const raw = {
            ...DEFAULT_SETTINGS,
            advanced: {
              ...DEFAULT_SETTINGS.advanced,
              [unknownKey]: { someField: 'value' },
            },
          };
          expect(() => parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS })).not.toThrow();
        },
      ),
    );
  });

  it('any single over-cap field leaves every sibling intact', () => {
    fc.assert(
      fc.property(poisonArb, fc.integer({ min: 1, max: 4000 }), (poison, over) => {
        const raw = canarySettings();
        poison(raw, over);

        const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

        expect(out.theme).toBe('dark');
        expect(out.cacheEnabled).toBe(false);
        expect(out.defaultTargetLang).toBe('fr');
        expect(out.advanced.maxTokens).toBe(4242);
        expect(out.advanced.promptTemplate.system).toBe('MYSYS');
        expect(out.advanced.snippets['greeting']).toBe('hi');
        expect(out.advanced.rules.map((r) => r.id)).toEqual(['canary']);
        expect(out.taskMaxTokens?.explain).toBe(512);
        expect(out.glossary[0]?.term).toBe('Ega');
        expect(out.varietyOverrides['arabizi']?.label).toBe('My Arabizi');
        expect(out.disabledVarieties).toEqual(['arabizi']);
        expect(out.contextMenuItems).toHaveLength(DEFAULT_SETTINGS.contextMenuItems.length);
      }),
    );
  });

  it('never keeps a rule with an unknown source value', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            body: fc.string({ minLength: 1, maxLength: 100 }),
            category: fc.constantFrom('always', 'never', 'prefer', 'format', 'unknown'),
            scope: fc.constant({ tasks: [] }),
            source: fc.constantFrom('manual', 'inplace', 'recipe', 'describe'),
            recipeId: fc.option(fc.string({ minLength: 1, maxLength: 40 })),
            // noInvalidDate: Invalid Date's toISOString() throws mid-generation
            addedAt: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
            enabled: fc.boolean(),
          }),
          { maxLength: 10 },
        ),
        (rules) => {
          const raw = {
            ...DEFAULT_SETTINGS,
            advanced: { ...DEFAULT_SETTINGS.advanced, rules },
          };
          const result = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
          const known = new Set(['manual', 'recipe', 'describe']);
          expect(result.advanced.rules.every((r) => known.has(r.source))).toBe(true);
        },
      ),
    );
  });
});
