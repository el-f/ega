import * as v from 'valibot';
import { ALL_TASKS, ALL_TONES } from './task-prompts';
import { isKnownNativeCli } from './native-cli-registry';
import { isLoopbackOllamaUrl } from './ollama-url';
import {
  type BackendId,
  asBackendIdUnsafe,
  asLangIdUnsafe,
  LangIdSchema,
  LangPresetIdSchema,
} from './brands';
import { DEFAULT_CONTEXT_MENU_ITEMS, type ContextMenuItem } from './context-menu';
import { clampToSchema } from './settings-clamp';
import { toSingleLine } from './utils/single-line';
import { objectEntries, unwrapOptional, type AnySchema } from './valibot-introspect';
import { CLOUD_PROVIDER_IDS, apiKeyField, type CloudProviderId } from './provider-ids';
import { CLOUD_PROFILES } from './backends/provider-profiles';

/** Every cap the writers clamp to. The schema below is the only consumer, so a
 *  UI guard and the reader's clamp can never disagree about the number. */
export const RULE_BODY_MAX = 500;
export const RULES_MAX = 100;
export const USER_RECIPES_MAX = 50;
export const BACKEND_CHAIN_MAX = 10;
export const SITE_PREFS_MAX = 500;
export const CUSTOM_SLOTS_MAX = 50;
export const SLOT_NAME_MAX = 64;
export const SLOT_DESCRIPTION_MAX = 280;
export const CONTEXT_MENU_ITEMS_MAX = 50;
export const MENU_LABEL_MAX = 200;
export const VARIETY_LABEL_MAX = 200;
export const VARIETY_HINT_MAX = 500;
export const VARIETY_EXAMPLE_MAX = 500;
export const VARIETY_EXAMPLES_MAX = 20;
export const CUSTOM_LANG_EXAMPLES_MAX = 50;

// Accepts a BCP-47 code, an Ega preset id, or 'auto'; both brands erase to `LangSelection` at runtime.
const langSelectionSchema = v.union([LangIdSchema, LangPresetIdSchema, v.literal('auto')]);

const menuSurfaceSchema = v.picklist(['tooltip', 'sidepanel'] as const);

const contextMenuItemSchema = v.variant('kind', [
  v.object({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
    kind: v.literal('task'),
    enabled: v.boolean(),
    order: v.number(),
    label: v.pipe(v.string(), v.maxLength(MENU_LABEL_MAX)),
    task: v.picklist(ALL_TASKS),
    surface: menuSurfaceSchema,
    targetLang: v.optional(langSelectionSchema),
  }),
  v.object({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
    kind: v.literal('image-task'),
    enabled: v.boolean(),
    order: v.number(),
    label: v.pipe(v.string(), v.maxLength(MENU_LABEL_MAX)),
    task: v.picklist(['translate', 'explain'] as const),
    // A pre-v4 stored item has no surface; without a default the whole menu falls back to the shipped one.
    surface: v.optional(menuSurfaceSchema, 'sidepanel'),
  }),
  v.object({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
    kind: v.picklist(['page-translate', 'pick-element', 'site-toggle'] as const),
    enabled: v.boolean(),
    order: v.number(),
    label: v.pipe(v.string(), v.maxLength(MENU_LABEL_MAX)),
  }),
]);

/** Per-backend default model id. Cloud entries come off the provider profile; native defaults to '' (the CLI's own default). */
export const DEFAULT_MODEL: Readonly<Record<CloudProviderId | 'ollama' | 'native', string>> = {
  ...(Object.fromEntries(CLOUD_PROFILES.map((p) => [p.id, p.defaultModel])) as Record<
    CloudProviderId,
    string
  >),
  ollama: 'llama3.2',
  native: '',
};

/** Bump when prompt wording changes in a way custom templates must not inherit; stored rows are never auto-bumped. */
export const CURRENT_TEMPLATE_VERSION = 9;

export const DEFAULT_PROMPT_TEMPLATE: { system: string; user: string } = {
  system: [
    'You translate {{langLabel}} into {{targetLangLabel}}.',
    '{{langHint}}',
    '{{targetLangHint}}',
    'Preserve names, numbers, code, URLs, @mentions, #hashtags, emoji, and any token the source author clearly wanted kept literal (brand names, handles). Translate the prose around them.',
    'Preserve verb tense, mood, number, person, voice. A past plural stays past plural; an imperative stays imperative; an intransitive does NOT gain a transitive object. Zero-anaphora subjects (common in Arabic, Spanish, Italian) stay implicit — do not invent "they" / "them" / "you" / "we" agents that aren\'t in the source.',
    'Preserve kinship, age, role, and address tokens (kids / boys / girls / sister / brother / sir / my friend / habibi / wled / shabab / guys). Keep each one and render it by its usual sense (shabab → guys, wled → kids); do NOT drop it or generalise it to "people" / "someone" / "them" / "everyone". The choice of address token is part of what the speaker said.',
    'Translate a fixed expression by what it MEANS, not word by word. Idioms, blessings, condolences, curses, oaths, greetings and set phrases carry a conventional sense a native speaker hears; render that sense. A word-by-word gloss that loses it is wrong — a condolence formula must read as a condolence, not as a sentence about its parts. When the target language has no equivalent phrase, state the meaning plainly.',
    'Preserve register and force, including vulgarity. A curse stays a curse, an insult stays an insult, sexual and scatological words stay explicit, a blessing stays a blessing. Never soften, sanitise, euphemise, omit, or replace an offensive term with a mild one or with a literal reading that hides the insult. You are reporting what the speaker said, not endorsing it.',
    'Keep who is speaking to whom. A vocative stays a vocative, and the target of an insult, curse or blessing stays the same person or group as in the source — never re-aim it at the addressee or at the speaker.',
    "If a source word or phrase is genuinely uncertain — slang you can't recognise, dialect-specific term you're unsure of, possible name vs common word — render your best guess wrapped in [?…] (e.g. \"[?barricade]\") rather than committing silently, AND lower the overall confidence value. Do not use [?…] for words you're confident in.",
    'Preserve obvious chant / refrain / repetition cadence — if the source repeats a phrase as a rhythmic device, the target must repeat too. Do not paraphrase the repetition into a single declarative sentence.',
    'If the text is short, single-phrase, or mixes the source variety with target-language fragments (e.g. "3eyzina, thank you!!"), still translate — do not hedge, do not narrate, do not produce bilingual analysis. Translate the source-variety portion; pass through any portion already in the target language unchanged. A slang, jargon or dialect word belongs to the source variety, not the target language, so it gets translated. Confidence reflects your certainty of the rendering, not the task\'s ambiguity.',
    'If ambiguous between two readings, pick the most likely without asking.',
    '{{examples}}',
    '{{explainInstr}}',
    '{{detectiveInstr}}',
    'Return JSON ONLY: {"translation": string, "confidence": number (0..1 — 1.0 = unambiguous, 0.8 = one clearly dominant reading, 0.5 = genuinely ambiguous between two readings, 0.2 = guessing — penalise for every [?…] token used), "detectedLang"?: string, "detectedDetail"?: string, "detectedLangs"?: Array<{id: string, detail?: string}>{{explainField}} }.',
    'If the variety has meaningful sub-dialects / regional or temporal markers (e.g. Arabizi → Levantine; Elvish → Quenya vs Sindarin), put a short (≤ 80 chars) descriptive tag in "detectedDetail", following the tagging rule above: only what the words themselves show. Omit it when there\'s nothing to add beyond the preset name.',
    'If and ONLY if the source clearly mixes multiple varieties (e.g. Arabizi mixed with Elvish, or Gen-Z slang interleaved with Spanglish), return a "detectedLangs" array with one entry per variety present — each entry is {id, detail?} with the same shape rules as detectedLang/detectedDetail. For a single-variety source, omit the field entirely.',
  ].join('\n'),
  user: ['{{context}}', 'TEXT:', '"""', '{{text}}', '"""'].join('\n'),
};

/** The v8 default, verbatim: profiles that saved any setting hold it on disk. Delete at CURRENT_TEMPLATE_VERSION 10. */
export const PREVIOUS_PROMPT_TEMPLATE: { system: string; user: string } = {
  system: [
    'You translate {{langLabel}} into {{targetLangLabel}}.',
    '{{langHint}}',
    '{{targetLangHint}}',
    'Preserve names, numbers, code, URLs, @mentions, #hashtags, emoji, and any token the source author clearly wanted kept literal (brand names, handles). Translate the prose around them.',
    'Preserve verb tense, mood, number, person, voice. A past plural stays past plural; an imperative stays imperative; an intransitive does NOT gain a transitive object. Zero-anaphora subjects (common in Arabic, Spanish, Italian) stay implicit — do not invent "they" / "them" / "you" / "we" agents that aren\'t in the source.',
    'Preserve kinship, age, role, and address tokens (kids / boys / girls / sister / brother / sir / my friend / habibi / wled / shabab / guys). Render them literally; do NOT generalise to "people" / "someone" / "them" / "everyone". The choice of address token is part of what the speaker said.',
    'Translate a fixed expression by what it MEANS, not word by word. Idioms, blessings, condolences, curses, oaths, greetings and set phrases carry a conventional sense a native speaker hears; render that sense. A word-by-word gloss that loses it is wrong — a condolence formula must read as a condolence, not as a sentence about its parts. When the target language has no equivalent phrase, state the meaning plainly.',
    'Preserve register and force, including vulgarity. A curse stays a curse, an insult stays an insult, sexual and scatological words stay explicit, a blessing stays a blessing. Never soften, sanitise, euphemise, omit, or replace an offensive term with a mild one or with a literal reading that hides the insult. You are reporting what the speaker said, not endorsing it.',
    'Keep who is speaking to whom. A vocative stays a vocative, and the target of an insult, curse or blessing stays the same person or group as in the source — never re-aim it at the addressee or at the speaker.',
    "If a source word or phrase is genuinely uncertain — slang you can't recognise, dialect-specific term you're unsure of, possible name vs common word — render your best guess wrapped in [?…] (e.g. \"[?barricade]\") rather than committing silently, AND lower the overall confidence value. Do not use [?…] for words you're confident in.",
    'Preserve obvious chant / refrain / repetition cadence — if the source repeats a phrase as a rhythmic device, the target must repeat too. Do not paraphrase the repetition into a single declarative sentence.',
    'If the text is short, single-phrase, or mixes the source variety with target-language fragments (e.g. "3eyzina, thank you!!"), still translate — do not hedge, do not narrate, do not produce bilingual analysis. Translate the source-variety portion; pass through any portion already in the target language unchanged. Confidence reflects your certainty of the rendering, not the task\'s ambiguity.',
    'If ambiguous between two readings, pick the most likely without asking.',
    '{{examples}}',
    '{{explainInstr}}',
    '{{detectiveInstr}}',
    'Return JSON ONLY: {"translation": string, "confidence": number (0..1 — 1.0 = unambiguous, 0.8 = one clearly dominant reading, 0.5 = genuinely ambiguous between two readings, 0.2 = guessing — penalise for every [?…] token used), "detectedLang"?: string, "detectedDetail"?: string, "detectedLangs"?: Array<{id: string, detail?: string}>{{explainField}} }.',
    'If the variety has meaningful sub-dialects / regional or temporal markers (e.g. Arabizi → Levantine Arabic — Lebanese; Elvish → Quenya vs Sindarin; Gen-Z slang → current TikTok era), put a short (≤ 80 chars) descriptive tag in "detectedDetail". Omit it when there\'s nothing to add beyond the preset name.',
    'If and ONLY if the source clearly mixes multiple varieties (e.g. Arabizi mixed with Elvish, or Gen-Z slang interleaved with Spanglish), return a "detectedLangs" array with one entry per variety present — each entry is {id, detail?} with the same shape rules as detectedLang/detectedDetail. For a single-variety source, omit the field entirely.',
  ].join('\n'),
  user: ['{{context}}', 'TEXT:', '"""', '{{text}}', '"""'].join('\n'),
};

/** True only when the stored template matches neither the current nor the previous default, so the banner skips users who never edited it. */
export function isPromptTemplateCustomised(t: { system: string; user: string }): boolean {
  return ![DEFAULT_PROMPT_TEMPLATE, PREVIOUS_PROMPT_TEMPLATE].some(
    (d) => t.system === d.system && t.user === d.user,
  );
}

/** Cloud-first for first-run UX. Diverges from registry order intentionally. */
const DEFAULT_BACKEND_ORDER: readonly BackendId[] = [
  'anthropic',
  'openai',
  'gemini',
  'ollama',
  'native',
  'groq',
  'deepseek',
  'together',
  'mistral',
  'xai',
  'fireworks',
  'openrouter',
].map((s) => asBackendIdUnsafe(s));

/** Fresh-install: native + anthropic + gemini enabled (README points a new user at a free Gemini key), every other cloud backend opt-in. */
const DEFAULT_DISABLED_BACKENDS: readonly BackendId[] = [
  'openai',
  'groq',
  'deepseek',
  'together',
  'mistral',
  'xai',
  'fireworks',
  'openrouter',
  'ollama',
].map((s) => asBackendIdUnsafe(s));

const trimmedString = v.pipe(v.string(), v.trim());

const backendIdLike = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[a-z0-9][\w-]*$/i, 'backend ids are ASCII kebab/snake'),
  v.transform((s): BackendId => asBackendIdUnsafe(s)),
);

const themePref = v.picklist(['system', 'light', 'dark']);
const displayMode = v.picklist(['tooltip', 'inline']);
const imageTranslateSurface = v.picklist(['sidepanel', 'tooltip']);
const pageContextLevel = v.picklist(['minimal', 'rich']);
const bubbleMode = v.picklist(['always', 'smart', 'never']);
// 'inplace' replaces the block's own text; 'bilingual' renders the translation in a sibling block below it.
const pageTranslateMode = v.picklist(['bilingual', 'inplace']);

const TEMPLATE_MAX = 16_000;

// Each half defaults on its own: a stored template missing one would otherwise reset the whole `advanced` section.
const promptTemplate = v.strictObject({
  system: v.optional(
    v.pipe(v.string(), v.maxLength(TEMPLATE_MAX, 'system template max 16k chars')),
    DEFAULT_PROMPT_TEMPLATE.system,
  ),
  user: v.optional(
    v.pipe(v.string(), v.maxLength(TEMPLATE_MAX, 'user template max 16k chars')),
    DEFAULT_PROMPT_TEMPLATE.user,
  ),
});

/** Canonical model-id-per-backend shape. `native` holds an optional CLI model id; '' means the CLI default. */
const modelShape = v.strictObject({
  ...(Object.fromEntries(
    CLOUD_PROVIDER_IDS.map((id) => [id, v.optional(v.string(), DEFAULT_MODEL[id])]),
  ) as Record<CloudProviderId, v.OptionalSchema<v.StringSchema<undefined>, string>>),
  ollama: v.optional(v.string(), DEFAULT_MODEL.ollama),
  native: v.optional(v.string(), DEFAULT_MODEL.native),
});

export type ModelMap = v.InferOutput<typeof modelShape>;

/** Dynamic-key access on the strict ModelMap shape. Returns '' when `id` is
 *  not a known slot (e.g. 'auto' / 'unknown') or the slot is empty. */
export function lookupModelId(model: ModelMap, id: string): string {
  if (!Object.hasOwn(model, id)) return '';
  const v = (model as Record<string, unknown>)[id];
  return typeof v === 'string' ? v : '';
}

/** Source of both the stored rules shape and the Rule type in shared/rules.ts. */
const ruleSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  // Rendered as one bare line in the system prompt, so a stored line break would open a fresh instruction.
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(RULE_BODY_MAX), v.transform(toSingleLine)),
  category: v.picklist(['always', 'never', 'prefer', 'format', 'unknown']),
  scope: v.object({
    tasks: v.optional(v.array(v.picklist(ALL_TASKS)), []),
    sites: v.optional(v.array(v.pipe(v.string(), v.maxLength(2048)))),
  }),
  source: v.picklist(['manual', 'recipe', 'describe']),
  recipeId: v.optional(v.pipe(v.string(), v.maxLength(64))),
  addedAt: v.pipe(v.string(), v.maxLength(40)),
  enabled: v.optional(v.boolean(), true),
});

export type RuleFromSchema = v.InferOutput<typeof ruleSchema>;

// Wire-side patch. strict rejects retired SitePref keys at the boundary;
// storage tolerates them via sitePrefStored (strip-mode).
const sitePrefPatch = v.partial(
  v.strictObject({
    disabled: v.optional(v.boolean()),
    defaultLang: v.optional(langSelectionSchema),
    lastDirection: v.optional(
      v.strictObject({ source: langSelectionSchema, target: langSelectionSchema }),
    ),
  }),
);

const varietyEditSchema = v.partial(
  v.strictObject({
    label: v.optional(v.pipe(v.string(), v.maxLength(VARIETY_LABEL_MAX))),
    hint: v.optional(v.pipe(v.string(), v.maxLength(VARIETY_HINT_MAX))),
    examples: v.optional(
      v.pipe(
        v.array(
          v.strictObject({
            src: v.pipe(v.string(), v.maxLength(VARIETY_EXAMPLE_MAX)),
            tgt: v.pipe(v.string(), v.maxLength(VARIETY_EXAMPLE_MAX)),
          }),
        ),
        v.maxLength(VARIETY_EXAMPLES_MAX),
      ),
    ),
    autoDetect: v.optional(
      v.strictObject({
        regex: v.pipe(v.string(), v.maxLength(500)),
        flags: v.pipe(v.string(), v.maxLength(10)),
        minScore: v.pipe(v.number(), v.finite()),
      }),
    ),
  }),
);

export type VarietyEditFromSchema = v.InferOutput<typeof varietyEditSchema>;

export const customLanguageSchema = v.strictObject({
  id: LangPresetIdSchema,
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(VARIETY_LABEL_MAX)),
  hint: v.pipe(v.string(), v.maxLength(VARIETY_HINT_MAX)),
  examples: v.pipe(
    v.array(
      v.strictObject({
        src: v.pipe(v.string(), v.maxLength(VARIETY_EXAMPLE_MAX)),
        tgt: v.pipe(v.string(), v.maxLength(VARIETY_EXAMPLE_MAX)),
      }),
    ),
    v.maxLength(CUSTOM_LANG_EXAMPLES_MAX),
  ),
  autoDetect: v.exactOptional(
    v.strictObject({
      regex: v.pipe(v.string(), v.maxLength(500)),
      flags: v.pipe(v.string(), v.maxLength(10)),
      minScore: v.pipe(v.number(), v.finite()),
    }),
  ),
  createdAt: v.pipe(v.number(), v.integer(), v.finite()),
});

/** Term-to-translation pairs injected when the term appears in the source; scoped by language pair. */
const glossaryEntrySchema = v.strictObject({
  // Same bare-line rendering as a rule body — see ruleSchema.body.
  term: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(100, 'glossary term max 100 chars'),
    v.transform(toSingleLine),
  ),
  translation: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(100, 'glossary translation max 100 chars'),
    v.transform(toSingleLine),
  ),
  sourceLang: v.optional(langSelectionSchema),
  targetLang: v.optional(langSelectionSchema),
  caseSensitive: v.optional(v.boolean(), false),
});

export type GlossaryEntryFromSchema = v.InferOutput<typeof glossaryEntrySchema>;

export const varietiesBundleSchema = v.strictObject({
  egaVarieties: v.strictObject({
    v: v.literal(1),
    exportedAt: v.string(),
    customLanguages: v.pipe(
      v.array(customLanguageSchema),
      v.maxLength(200, 'customLanguages array capped at 200'),
    ),
    varietyOverrides: v.record(v.string(), varietyEditSchema),
    disabledVarieties: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
      v.maxLength(200),
    ),
  }),
});

/** Lenient variant used by the options import parser: any array element passes for
 *  customLanguages, so one malformed entry is skipped instead of failing the bundle. */
export const varietiesBundleLenientSchema = v.strictObject({
  egaVarieties: v.strictObject({
    v: v.literal(1),
    exportedAt: v.string(),
    customLanguages: v.array(v.unknown()),
    varietyOverrides: v.record(v.string(), varietyEditSchema),
    disabledVarieties: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
      v.maxLength(200),
    ),
  }),
});

export type VarietiesBundle = v.InferOutput<typeof varietiesBundleSchema>;

export const taskPresetsBundleSchema = v.strictObject({
  egaTaskPresets: v.strictObject({
    v: v.literal(1),
    exportedAt: v.string(),
    taskTemplates: v.record(v.picklist(ALL_TASKS), v.optional(promptTemplate)),
    taskBackends: v.record(
      v.picklist(ALL_TASKS),
      v.optional(v.union([backendIdLike, v.literal('auto')])),
    ),
    taskTemperatures: v.record(
      v.picklist(ALL_TASKS),
      v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2))),
    ),
    // Added after v1 shipped: absent means "leave mine alone", not "clear mine".
    taskMaxTokens: v.optional(
      v.record(
        v.picklist(ALL_TASKS),
        v.optional(v.pipe(v.number(), v.integer(), v.minValue(16), v.maxValue(8192))),
      ),
    ),
    taskReasoningEfforts: v.optional(
      v.record(v.picklist(ALL_TASKS), v.optional(v.picklist(['low', 'medium', 'high']))),
    ),
    taskTones: v.optional(v.record(v.picklist(ALL_TASKS), v.optional(v.picklist(ALL_TONES)))),
    defaultTask: v.picklist(ALL_TASKS),
    defaultTone: v.picklist(ALL_TONES),
  }),
});

export type TaskPresetsBundle = v.InferOutput<typeof taskPresetsBundleSchema>;

// Literal loopback only: a hostname that resolves public at save time can point at 127.0.0.1 later.
const ollamaUrlSchema = v.pipe(
  v.string(),
  v.maxLength(256),
  v.check(
    (raw: string) => raw === '' || isLoopbackOllamaUrl(raw),
    'ollamaUrl must be http(s) pointing at localhost / 127.0.0.1 / ::1',
  ),
);

/** Recursive partial (valibot's v.partial is shallow), keeping strictObject at every level. */
function deepPartialRuntime(schema: AnySchema): AnySchema {
  const entries = objectEntries(schema);
  if (!entries) return v.optional(schema);
  const next: Record<string, AnySchema> = {};
  for (const [key, field] of Object.entries(entries)) {
    const peeled = unwrapOptional(field) as AnySchema;
    next[key] = v.optional(objectEntries(peeled) ? deepPartialRuntime(peeled) : peeled);
  }
  return v.strictObject(next);
}

type DeepPartial<T> =
  T extends Record<string, unknown> ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

// Lifted so the advanced field's factory default can call `v.parse(advancedShape, {})`
// to expand its own field defaults rather than emit a bare `{}`.
const advancedShape = v.strictObject({
  promptTemplate: v.optional(promptTemplate, () => ({ ...DEFAULT_PROMPT_TEMPLATE })),
  perPresetTemplates: v.optional(
    v.record(v.pipe(v.string(), v.maxLength(64)), promptTemplate),
    () => ({}),
  ),
  temperature: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(2)), 0.2),
  maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(8192)), 2048),
  // Read only when the active model is a reasoning model; every other backend ignores it.
  reasoningEffort: v.optional(v.picklist(['low', 'medium', 'high']), 'medium'),
  templateVersion: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0)),
    CURRENT_TEMPLATE_VERSION,
  ),
  // Equal to CURRENT_TEMPLATE_VERSION hides the mismatch banner even when the user's template is older.
  templateVersionAcknowledged: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  taskTemplates: v.optional(
    v.record(v.picklist(ALL_TASKS), v.optional(promptTemplate)),
    () => ({}),
  ),
  // Templates reference these as `@@name@@`; resolved before slots and capped at depth 3 in `src/shared/snippets.ts`.
  snippets: v.optional(
    v.record(
      v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
      v.pipe(v.string(), v.maxLength(8192)),
    ),
    () => ({}),
  ),
  retryCount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3)), 1),
  backendProbeTtlMs: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(5_000), v.maxValue(300_000)),
    30_000,
  ),
  taskBackendChains: v.optional(
    v.record(
      v.picklist(ALL_TASKS),
      v.optional(v.pipe(v.array(backendIdLike), v.maxLength(BACKEND_CHAIN_MAX))),
    ),
    () => ({}),
  ),
  taskTones: v.optional(
    v.record(v.picklist(ALL_TASKS), v.optional(v.picklist(ALL_TONES))),
    () => ({}),
  ),
  debugLogLevel: v.optional(v.picklist(['silent', 'error', 'warn', 'info', 'debug']), 'warn'),
  // Sorted least-specific first, so the most-specific rule sits closest to the end of the system prompt.
  rules: v.optional(v.pipe(v.array(ruleSchema), v.maxLength(RULES_MAX)), () => []),
  // Inner recipe shape validated in `src/shared/recipes.ts`;
  // unknown here keeps settings parse forgiving.
  userRecipes: v.optional(v.pipe(v.array(v.unknown()), v.maxLength(USER_RECIPES_MAX)), () => []),
  customSlotDescriptions: v.optional(
    v.pipe(
      v.record(
        v.pipe(v.string(), v.minLength(1), v.maxLength(SLOT_NAME_MAX)),
        v.pipe(v.string(), v.maxLength(SLOT_DESCRIPTION_MAX)),
      ),
      v.maxEntries(CUSTOM_SLOTS_MAX, 'customSlotDescriptions capped at 50 entries'),
    ),
    () => ({}),
  ),
});

export const settingsSchema = v.strictObject({
  theme: v.optional(themePref, 'system'),
  defaultDisplayMode: v.optional(displayMode, 'tooltip'),
  /** 'inplace' replaces the block's own text; 'bilingual' renders the translation in a sibling block below it. */
  pageTranslateMode: v.optional(pageTranslateMode, 'inplace'),
  defaultLang: v.optional(langSelectionSchema, 'auto'),
  defaultTargetLang: v.optional(langSelectionSchema, () => asLangIdUnsafe('en')),
  contextEnabled: v.optional(v.boolean(), true),
  /** Explain on a text selection attaches the page's one dominant image so the
   *  model can read the picture the text is about. Off stops the download. */
  explainUsesPageImage: v.optional(v.boolean(), true),
  pageContextLevel: v.optional(pageContextLevel, 'minimal'),
  streaming: v.optional(v.boolean(), true),
  imageTranslateSurface: v.optional(imageTranslateSurface, 'sidepanel'),
  confidencePill: v.optional(v.boolean(), true),
  tooltipClickOutside: v.optional(v.boolean(), true),
  tooltipShowSource: v.optional(v.boolean(), false),
  tooltipDraggable: v.optional(v.boolean(), false),
  pickerEnabled: v.optional(v.boolean(), true),
  pickerShortcut: v.optional(trimmedString, 'Ctrl+Shift+E'),
  bubbleMode: v.optional(bubbleMode, 'smart'),
  smartBubbleBannerShown: v.optional(v.boolean(), false),
  bubbleFirstRunSeen: v.optional(v.boolean(), false),
  onboardingDismissed: v.optional(v.boolean(), false),
  shortcut: v.optional(trimmedString, 'Ctrl+Shift+L'),
  sitePrefs: v.optional(v.record(v.pipe(v.string(), v.maxLength(2048)), sitePrefPatch), () => ({})),
  ...(Object.fromEntries(
    CLOUD_PROVIDER_IDS.map((id) => [apiKeyField(id), v.optional(v.string())]),
  ) as Record<
    ReturnType<typeof apiKeyField>,
    v.OptionalSchema<v.StringSchema<undefined>, undefined>
  >),
  apiKeyEditedAt: v.optional(
    v.record(
      v.picklist(CLOUD_PROVIDER_IDS),
      v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
    ),
    () => ({}),
  ),
  ollamaUrl: v.optional(ollamaUrlSchema),
  nativeCli: v.optional(
    v.pipe(
      v.string(),
      v.check((s: string) => isKnownNativeCli(s), 'unknown nativeCli id'),
    ),
  ),
  backendOrder: v.optional(v.array(backendIdLike), () => [...DEFAULT_BACKEND_ORDER]),
  disabledBackends: v.optional(v.array(backendIdLike), () => [...DEFAULT_DISABLED_BACKENDS]),
  model: v.optional(modelShape, () => ({ ...DEFAULT_MODEL })),
  disabledVarieties: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))), v.maxLength(200)),
    () => [],
  ),
  varietyOverrides: v.optional(
    v.record(
      v.pipe(
        v.string(),
        v.minLength(1),
        v.maxLength(64),
        v.regex(/^[a-z0-9][\w-]*$/i, 'variety ids are ASCII kebab/snake'),
      ),
      varietyEditSchema,
    ),
    () => ({}),
  ),
  glossary: v.optional(
    v.pipe(v.array(glossaryEntrySchema), v.maxLength(200, 'glossary capped at 200 entries')),
    () => [],
  ),
  advanced: v.optional(advancedShape, () => v.parse(advancedShape, {})),
  taskBackends: v.optional(
    v.record(v.picklist(ALL_TASKS), v.optional(v.union([backendIdLike, v.literal('auto')]))),
    () => ({}),
  ),
  defaultTask: v.optional(v.picklist(ALL_TASKS), 'translate'),
  defaultTone: v.optional(v.picklist(ALL_TONES), 'neutral'),
  cacheEnabled: v.optional(v.boolean(), true),
  selectionContextCap: v.optional(v.pipe(v.number(), v.integer(), v.minValue(50), v.maxValue(800))),
  smartBubbleMinLength: v.optional(v.pipe(v.number(), v.integer(), v.minValue(3), v.maxValue(15))),
  headingTrailDepth: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10))),
  headingTrailEntryCap: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(50), v.maxValue(200)),
  ),
  descriptionContextCap: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(100), v.maxValue(500)),
  ),
  translateTimeoutMs: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(30_000), v.maxValue(300_000)),
  ),
  imageTranslateTimeoutMs: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(60_000), v.maxValue(300_000)),
  ),
  localBackendTimeoutMs: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(500), v.maxValue(5_000)),
  ),
  // Spawns the CLI child on boot, so the first translate skips the 7-12s cold start.
  preWarmNative: v.optional(v.boolean(), true),
  batchConcurrency: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10))),
  confidencePillThreshold: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  streamingFlushMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(500))),
  taskTemperatures: v.optional(
    v.record(v.picklist(ALL_TASKS), v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2)))),
  ),
  // Per-task overrides. Fall through to advanced.maxTokens when absent.
  taskMaxTokens: v.optional(
    v.record(
      v.picklist(ALL_TASKS),
      v.optional(v.pipe(v.number(), v.integer(), v.minValue(16), v.maxValue(8192))),
    ),
  ),
  // Per-task overrides. Fall through to advanced.reasoningEffort when absent.
  taskReasoningEfforts: v.optional(
    v.record(v.picklist(ALL_TASKS), v.optional(v.picklist(['low', 'medium', 'high']))),
  ),
  captureResultMeta: v.optional(v.boolean(), true),
  contextMenuItems: v.optional(
    // Narrows only the inferred type to the canonical union; contextMenuItemSchema still validates at runtime.
    v.pipe(v.array(contextMenuItemSchema), v.maxLength(CONTEXT_MENU_ITEMS_MAX)) as v.GenericSchema<
      ContextMenuItem[]
    >,
    () => structuredClone(DEFAULT_CONTEXT_MENU_ITEMS),
  ),
  contextMenuLayout: v.optional(v.picklist(['nested', 'flat'] as const), 'nested'),
});

export type SettingsFromSchema = v.InferOutput<typeof settingsSchema>;

/** Optional keys with no default: the read path deletes them rather than setting undefined (exactOptionalPropertyTypes). */
export const OPTIONAL_SETTINGS_KEYS: readonly string[] = Object.entries(
  (settingsSchema as unknown as { entries: Record<string, { type: string; default?: unknown }> })
    .entries,
)
  .filter(([, entry]) => entry.type === 'optional' && entry.default === undefined)
  .map(([key]) => key);

const settingsPatchSchema = deepPartialRuntime(settingsSchema);

type SettingsPatch = DeepPartial<SettingsFromSchema>;

/** Throws on invalid shape — callers wanting fallback use `safeParse`. */
export function parseSettings(raw: unknown): SettingsFromSchema {
  return v.parse(settingsSchema, raw);
}

/** Throws v.ValiError on a bad shape. */
export function parseSettingsPatch(raw: unknown): SettingsPatch {
  return v.parse(settingsPatchSchema, raw) as SettingsPatch;
}

export interface ParseStoredSettingsOptions {
  defaults: SettingsFromSchema;
}

/** JSON.parse makes __proto__ an own key that re-enters the prototype on assignment; strip it first. */
function stripProtoKeys<T extends Record<string, unknown>>(o: T): T {
  for (const k of ['__proto__', 'constructor', 'prototype']) {
    if (Object.hasOwn(o, k)) delete (o as Record<string, unknown>)[k];
  }
  return o;
}

/** Top-level keys a past version persisted. `settingsSchema` is strict, so a stored
 *  row still carrying one fails the first parse and enters the repair loop. */
const RETIRED_SETTINGS_KEYS: readonly string[] = ['batchMinLength', 'batchMaxLength'];

/** Non-strict on read so retired keys on disk are dropped; the wire-side sitePrefPatch stays strict. */
const sitePrefStored = v.partial(
  v.object({
    disabled: v.optional(v.boolean()),
    defaultLang: v.optional(langSelectionSchema),
    lastDirection: v.optional(
      v.strictObject({ source: langSelectionSchema, target: langSelectionSchema }),
    ),
  }),
);

const sitePrefsStoredSchema = v.record(v.pipe(v.string(), v.maxLength(2048)), sitePrefStored);

/** Fixes needed before the first parse (proto keys, retired keys, sitePrefs shape and 500-origin cap); clampToSchema does the rest. */
function preCleanForStorage(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = stripProtoKeys({ ...raw });
  for (const k of RETIRED_SETTINGS_KEYS) delete out[k];
  if (out['sitePrefs']) {
    const prefs = clampToSchema(sitePrefsStoredSchema, out['sitePrefs']) as Record<string, unknown>;
    out['sitePrefs'] = capSitePrefs(prefs);
  }
  return out;
}

// Chrome reads nested keys back sorted, not by age, so the cap evicts remembered directions before any off switch.
function capSitePrefs(prefs: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(prefs);
  if (entries.length <= SITE_PREFS_MAX) return prefs;
  const isOff = ([, p]: [string, unknown]): boolean =>
    (p as { disabled?: unknown } | null)?.disabled === true;
  const off = entries.filter(isOff).slice(-SITE_PREFS_MAX);
  const memo = entries.filter((e) => !isOff(e));
  const room = SITE_PREFS_MAX - off.length;
  return Object.fromEntries([...off, ...memo.slice(Math.max(0, memo.length - room))]);
}

export function parseStoredSettings(
  raw: unknown,
  opts: ParseStoredSettingsOptions,
): SettingsFromSchema {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...opts.defaults };
  }
  const cleaned = preCleanForStorage(raw as Record<string, unknown>);

  const first = v.safeParse(settingsSchema, cleaned);
  if (first.success) return first.output;

  // Degrade one field at a time: clamp what a cap can fix, drop what it cannot.
  const dropped: string[] = [];
  const clamped = clampToSchema(settingsSchema, cleaned, dropped) as Record<string, unknown>;
  if (dropped.length > 0) {
    console.debug(`[ega.storage] dropped stored settings keys: ${dropped.join(', ')}`);
  }
  const second = v.safeParse(settingsSchema, clamped);
  if (second.success) return second.output;

  // Only an unfixable field reaches here; replace its whole top-level section.
  const repaired: Record<string, unknown> = { ...clamped };
  const seen = new Set<string>();
  for (const issue of second.issues) {
    const top = issue.path?.[0]?.key;
    if (typeof top !== 'string' || seen.has(top)) continue;
    seen.add(top);
    if (top in opts.defaults) {
      // The one repair a user can notice: a whole section goes back to defaults. Say so.
      console.warn(`[ega.storage] reset stored settings section "${top}" to defaults`);
      // Deep-clone to avoid aliasing — callers might mutate.
      repaired[top] = structuredClone((opts.defaults as Record<string, unknown>)[top]);
    } else {
      delete repaired[top];
    }
  }

  const third = v.safeParse(settingsSchema, repaired);
  if (third.success) return third.output;

  return structuredClone(opts.defaults);
}
