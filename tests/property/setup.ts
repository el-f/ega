// Shared fast-check arbitraries; not a vitest setupFile.
import * as fc from 'fast-check';
import { asLangIdUnsafe, asLangPresetIdUnsafe } from '@/shared/brands';
import type { Rule } from '@/shared/rules';
import type { GlossaryEntry } from '@/shared/glossary';
import type { CustomLanguage } from '@/shared/types';
import type { Recipe, RecipeRule } from '@/shared/recipes';
import { ALL_TASKS, type Task } from '@/shared/task-prompts';

// ---------------------------------------------------------------------------
// Primitive arbitraries

export const arbTask: fc.Arbitrary<Task> = fc.constantFrom(...(ALL_TASKS as readonly Task[]));

const arbShortStr = fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0);

const arbRuleId = fc.uuid();

const arbRuleBody = fc.string({ minLength: 1, maxLength: 400 }).filter((s) => s.trim().length > 0);

const arbRuleCategory = fc.constantFrom(
  'always',
  'never',
  'prefer',
  'format',
  'unknown',
) as fc.Arbitrary<Rule['category']>;

const arbRuleSource = fc.constantFrom('manual', 'recipe', 'describe') as fc.Arbitrary<
  Rule['source']
>;

const arbAddedAt = fc.constantFrom(
  '2024-01-01T00:00:00.000Z',
  '2024-06-15T12:30:00.000Z',
  '2025-03-20T08:45:00.000Z',
  '2025-11-07T16:00:00.000Z',
);

export const arbRule: fc.Arbitrary<Rule> = fc.record({
  id: arbRuleId,
  body: arbRuleBody,
  category: arbRuleCategory,
  scope: fc.record({
    tasks: fc.oneof(fc.constant([] as Task[]), fc.array(arbTask, { minLength: 1, maxLength: 3 })),
    sites: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 })),
  }),
  source: arbRuleSource,
  recipeId: fc.option(fc.string({ minLength: 1, maxLength: 64 })),
  addedAt: arbAddedAt,
  enabled: fc.boolean(),
});

// ---------------------------------------------------------------------------
// GlossaryEntry

const LANG_CODES = ['en', 'ar', 'fr', 'de', 'es', 'ja'] as const;
type KnownLang = (typeof LANG_CODES)[number];

function brandLang(code: KnownLang | 'auto'): GlossaryEntry['sourceLang'] {
  if (code === 'auto') return 'auto';
  return asLangIdUnsafe(code);
}

const arbLangOrAuto = fc.constantFrom(...LANG_CODES, 'auto' as const);

export const arbGlossaryEntry: fc.Arbitrary<GlossaryEntry> = fc
  .record({
    term: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    translation: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    hasSrcLang: fc.boolean(),
    srcLang: arbLangOrAuto,
    hasTgtLang: fc.boolean(),
    tgtLang: arbLangOrAuto,
    caseSensitive: fc.boolean(),
  })
  .map(({ term, translation, hasSrcLang, srcLang, hasTgtLang, tgtLang, caseSensitive }) => {
    const e: GlossaryEntry = { term, translation, caseSensitive };
    if (hasSrcLang) e.sourceLang = brandLang(srcLang);
    if (hasTgtLang) e.targetLang = brandLang(tgtLang);
    return e;
  });

export { arbLangOrAuto };

// ---------------------------------------------------------------------------
// CustomLanguage

export const arbCustomLanguage: fc.Arbitrary<CustomLanguage> = fc.record({
  id: fc
    .string({ minLength: 1, maxLength: 60 })
    .filter((s) => /^[a-z0-9][\w-]*$/i.test(s))
    .map((s) => asLangPresetIdUnsafe(s)),
  label: fc.string({ minLength: 1, maxLength: 200 }),
  hint: fc.string({ maxLength: 500 }),
  examples: fc.array(
    fc.record({
      src: fc.string({ maxLength: 200 }),
      tgt: fc.string({ maxLength: 200 }),
    }),
    { maxLength: 5 },
  ),
  createdAt: fc.integer({ min: 0, max: Date.now() }),
});

// ---------------------------------------------------------------------------
// Recipe / RecipeRule

const arbRecipeRule: fc.Arbitrary<RecipeRule> = fc
  .record({
    body: arbShortStr,
    category: arbRuleCategory,
    hasSites: fc.boolean(),
    sites: fc.array(fc.string({ maxLength: 100 }), { maxLength: 3 }),
  })
  .map(({ body, category, hasSites, sites }) => {
    const r: RecipeRule = { body, category };
    if (hasSites && sites.length > 0) r.scopeSites = sites;
    return r;
  });

export const arbRecipe: fc.Arbitrary<Recipe> = fc
  .record({
    id: arbShortStr,
    task: arbTask,
    label: arbShortStr,
    description: fc.string({ maxLength: 200 }),
    hasRules: fc.boolean(),
    rules: fc.array(arbRecipeRule, { maxLength: 10 }),
  })
  .map(({ id, task, label, description, hasRules, rules }) => {
    const r: Recipe = { id, task, label, description };
    if (hasRules && rules.length > 0) r.rules = rules;
    return r;
  });
