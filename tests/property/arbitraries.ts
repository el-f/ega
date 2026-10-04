import * as fc from 'fast-check';
import { asLangIdUnsafe, asLangPresetIdUnsafe } from '@/shared/brands';
import type { Rule } from '@/shared/rules';
import type { GlossaryEntry } from '@/shared/glossary';
import type { CustomLanguage } from '@/shared/types';
import type { CustomTask } from '@/shared/settings-schema';
import { ALL_TASKS, type Task } from '@/shared/task-prompts';

// ---------------------------------------------------------------------------
// Primitive arbitraries

export const arbTask: fc.Arbitrary<Task> = fc.constantFrom(...(ALL_TASKS as readonly Task[]));

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

/** Ids are drawn from a small pool with the built-in ids in it, so collisions and repeats happen often. */
export const arbCustomTask: fc.Arbitrary<CustomTask> = fc.record({
  id: fc.oneof(fc.constantFrom(...ALL_TASKS, 'c1', 'c2', 'c3'), fc.uuid()),
  label: fc.string({ minLength: 1, maxLength: 40 }),
  system: fc.string({ maxLength: 200 }),
  user: fc.string({ maxLength: 100 }).map((s) => `${s}{{text}}`),
  output: fc.constantFrom('plain' as const, 'card' as const),
  pageContext: fc.boolean(),
  image: fc.boolean(),
  glossary: fc.boolean(),
  createdAt: fc.integer({ min: 0, max: 2_000_000_000_000 }),
});

/** A task id no built-in has: a custom task's uuid, a kebab id, or a string the id schema refuses. */
export const arbForeignTaskId: fc.Arbitrary<string> = fc
  .oneof(fc.uuid(), fc.stringMatching(/^[a-z0-9][\w-]{0,20}$/), fc.string({ maxLength: 12 }))
  .filter((id) => !(ALL_TASKS as readonly string[]).includes(id));
