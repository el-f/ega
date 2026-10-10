import * as v from 'valibot';
import { ALL_TASKS, ALL_TONES } from './task-prompts';
import { TRANSLATE_FORMAT } from './answer/formats-v1';
import { isKnownNativeCli } from './native-cli-registry';
import { isLoopbackUrl } from './loopback-url';
import {
  type BackendId,
  asBackendIdUnsafe,
  asLangIdUnsafe,
  LangIdSchema,
  LangPresetIdSchema,
} from './brands';
import { DEFAULT_CONTEXT_MENU_ITEMS, type ContextMenuItem } from './context-menu';
import { clampToSchema, isPlainObject, PROTO_KEYS } from './settings-clamp';
import { expandSnippets, resolveSnippets } from './snippets';
import { toSingleLine } from './utils/single-line';
import { objectEntries, unwrapOptional, type AnySchema } from './valibot-introspect';
import { CLOUD_PROVIDER_IDS, apiKeyField, type CloudProviderId } from './provider-ids';
import { CLOUD_PROFILES } from './backends/provider-profiles';

/** Every cap the writers clamp to. The schema below is the only consumer, so a
 *  UI guard and the reader's clamp can never disagree about the number. */
export const RULE_BODY_MAX = 500;
export const RULES_MAX = 100;
export const BACKEND_CHAIN_MAX = 10;
export const SITE_PREFS_MAX = 500;
export const CONTEXT_MENU_ITEMS_MAX = 50;
export const MENU_LABEL_MAX = 200;
export const VARIETY_LABEL_MAX = 200;
export const VARIETY_HINT_MAX = 500;
export const VARIETY_EXAMPLE_MAX = 500;
export const VARIETY_EXAMPLES_MAX = 20;
export const CUSTOM_LANG_EXAMPLES_MAX = 50;
export const DETECT_PATTERN_MAX = 500;
export const DETECT_FLAGS_MAX = 10;
export const GLOSSARY_MAX = 200;
export const GLOSSARY_FIELD_MAX = 100;

// Accepts a BCP-47 code, an Ega preset id, or 'auto'; both brands erase to `LangSelection` at runtime.
const langSelectionSchema = v.union([LangIdSchema, LangPresetIdSchema, v.literal('auto')]);

const menuSurfaceSchema = v.picklist(['tooltip', 'sidepanel'] as const);

/** A built-in task id or a custom task's uuid: the pattern varietyOverrides keys use. */
export const TaskIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(64),
  v.regex(/^[a-z0-9][\w-]*$/i, 'task ids are ASCII kebab/snake'),
);

const contextMenuItemSchema = v.variant('kind', [
  v.object({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
    kind: v.literal('task'),
    enabled: v.boolean(),
    order: v.number(),
    label: v.pipe(v.string(), v.maxLength(MENU_LABEL_MAX)),
    task: TaskIdSchema,
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
export const DEFAULT_MODEL: Readonly<
  Record<CloudProviderId | 'ollama' | 'localserver' | 'native', string>
> = {
  ...(Object.fromEntries(CLOUD_PROFILES.map((p) => [p.id, p.defaultModel])) as Record<
    CloudProviderId,
    string
  >),
  ollama: 'gemma4:e4b',
  // Empty: the server's first listed model, so a fresh setup works with whatever is loaded.
  localserver: '',
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

/** The v9 default as stored before the answer format left the editable text: today's default with the format joined on. */
export const V9_FULL_PROMPT_TEMPLATE: { system: string; user: string } = {
  system: DEFAULT_PROMPT_TEMPLATE.system + TRANSLATE_FORMAT.sep + TRANSLATE_FORMAT.text,
  user: DEFAULT_PROMPT_TEMPLATE.user,
};

/** True only when the stored template matches no shipped default, so the banner skips users who never edited it. */
export function isPromptTemplateCustomised(t: { system: string; user: string }): boolean {
  return ![DEFAULT_PROMPT_TEMPLATE, V9_FULL_PROMPT_TEMPLATE, PREVIOUS_PROMPT_TEMPLATE].some(
    (d) => t.system === d.system && t.user === d.user,
  );
}

/** Cloud-first for first-run UX. Diverges from registry order intentionally. */
const DEFAULT_BACKEND_ORDER: readonly BackendId[] = [
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
  'localserver',
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

export const TEMPLATE_MAX = 16_000;
const SNIPPET_NAME_MAX = 64;
const SNIPPET_BODY_MAX = 8192;

// Each half defaults on its own: a stored template missing one would otherwise reset the whole `advanced` section.
export const promptTemplate = v.strictObject({
  system: v.optional(
    v.pipe(v.string(), v.maxLength(TEMPLATE_MAX, 'system template max 16k chars')),
    DEFAULT_PROMPT_TEMPLATE.system,
  ),
  user: v.optional(
    v.pipe(v.string(), v.maxLength(TEMPLATE_MAX, 'user template max 16k chars')),
    DEFAULT_PROMPT_TEMPLATE.user,
  ),
});

const promptHalf = v.pipe(v.string(), v.maxLength(TEMPLATE_MAX));

/** A language's own prompt: only the halves that differ from the Translate prompt. A missing half runs Translate's, so a later Translate edit still reaches it. */
export const languagePromptSchema = v.strictObject({
  system: v.exactOptional(promptHalf),
  user: v.exactOptional(promptHalf),
});
export type LanguagePrompt = v.InferOutput<typeof languagePromptSchema>;

export const snippetsSchema = v.record(
  v.pipe(v.string(), v.minLength(1), v.maxLength(SNIPPET_NAME_MAX)),
  v.pipe(v.string(), v.maxLength(SNIPPET_BODY_MAX)),
);

/** One effort scale, shared by the global setting and every task; each backend maps it to its own field. */
export const EFFORT_LEVELS = ['off', 'low', 'medium', 'high'] as const;
export type TaskEffort = (typeof EFFORT_LEVELS)[number];

export const CUSTOM_TASK_LABEL_MAX = 40;
/** Cap on a list of task ids: the off list and each rule scope. */
const TASK_IDS_MAX = 64;

const taskPromptHalf = v.pipe(v.string(), v.maxLength(TEMPLATE_MAX));

/** settings.taskOverrides[task]: only the fields that differ from the shipped task. */
// Keep newer row fields on read/write; callers still see this build's known fields.
type KnownFields<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

export const taskEditSchema = v.looseObject({
  system: v.exactOptional(taskPromptHalf),
  user: v.exactOptional(taskPromptHalf),
  pageContext: v.exactOptional(v.boolean()),
  glossary: v.exactOptional(v.boolean()),
  effort: v.exactOptional(v.picklist(EFFORT_LEVELS)),
});
export type TaskEdit = KnownFields<v.InferOutput<typeof taskEditSchema>>;

/** One row of ega.customTasks. */
export const customTaskSchema = v.looseObject({
  id: TaskIdSchema,
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(CUSTOM_TASK_LABEL_MAX)),
  system: taskPromptHalf,
  user: v.pipe(
    taskPromptHalf,
    v.minLength(1),
    v.includes('{{text}}', 'the message must contain {{text}}'),
  ),
  output: v.picklist(['plain', 'card']),
  pageContext: v.boolean(),
  image: v.boolean(),
  glossary: v.boolean(),
  effort: v.exactOptional(v.picklist(EFFORT_LEVELS)),
  createdAt: v.pipe(v.number(), v.integer(), v.finite()),
});
export type CustomTask = KnownFields<v.InferOutput<typeof customTaskSchema>>;

/** Canonical model-id-per-backend shape. `native` holds an optional CLI model id; '' means the CLI default. */
const modelShape = v.strictObject({
  ...(Object.fromEntries(
    CLOUD_PROVIDER_IDS.map((id) => [id, v.optional(v.string(), DEFAULT_MODEL[id])]),
  ) as Record<CloudProviderId, v.OptionalSchema<v.StringSchema<undefined>, string>>),
  ollama: v.optional(v.string(), DEFAULT_MODEL.ollama),
  localserver: v.optional(v.string(), DEFAULT_MODEL.localserver),
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

/** The model a backend runs when its slot is empty; '' for an unknown id. */
export function defaultModelId(id: string): string {
  return Object.hasOwn(DEFAULT_MODEL, id) ? DEFAULT_MODEL[id as keyof typeof DEFAULT_MODEL] : '';
}

/** The model a backend runs: its slot, or the backend's default when the slot is empty. */
export function resolveModelId(model: ModelMap, id: string): string {
  return lookupModelId(model, id).trim() || defaultModelId(id);
}

/** Source of both the stored rules shape and the Rule type in shared/rules.ts. */
const ruleSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  // Rendered as one bare line in the system prompt, so a stored line break would open a fresh instruction.
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(RULE_BODY_MAX), v.transform(toSingleLine)),
  category: v.picklist(['always', 'never', 'prefer', 'format', 'unknown']),
  scope: v.object({
    tasks: v.optional(v.pipe(v.array(TaskIdSchema), v.maxLength(TASK_IDS_MAX)), []),
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

const autoDetectSchema = v.strictObject({
  regex: v.pipe(v.string(), v.maxLength(DETECT_PATTERN_MAX)),
  flags: v.pipe(v.string(), v.maxLength(DETECT_FLAGS_MAX)),
  minScore: v.pipe(v.number(), v.finite()),
});

/** One built-in language edit: only what differs from the shipped language. */
export const varietyEditSchema = v.partial(
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
    autoDetect: v.optional(autoDetectSchema),
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
  autoDetect: v.exactOptional(autoDetectSchema),
  createdAt: v.pipe(v.number(), v.integer(), v.finite()),
});

/** Term-to-translation pairs injected when the term appears in the source; scoped by language pair. */
export const glossaryEntrySchema = v.strictObject({
  // Same bare-line rendering as a rule body — see ruleSchema.body.
  term: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(GLOSSARY_FIELD_MAX, `glossary term max ${GLOSSARY_FIELD_MAX} chars`),
    v.transform(toSingleLine),
  ),
  translation: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(GLOSSARY_FIELD_MAX, `glossary translation max ${GLOSSARY_FIELD_MAX} chars`),
    v.transform(toSingleLine),
  ),
  sourceLang: v.optional(langSelectionSchema),
  targetLang: v.optional(langSelectionSchema),
  caseSensitive: v.optional(v.boolean(), false),
});

export type GlossaryEntryFromSchema = v.InferOutput<typeof glossaryEntrySchema>;

/** The languages file. Version 2 adds each language's own prompt; a version 1 file leaves the current ones alone. */
export interface VarietiesBundle {
  egaVarieties: {
    v: 1 | 2;
    exportedAt: string;
    customLanguages: v.InferOutput<typeof customLanguageSchema>[];
    varietyOverrides: Record<string, VarietyEditFromSchema>;
    disabledVarieties: string[];
    presetTemplates?: Record<string, LanguagePrompt>;
    /** Present when an exported prompt still holds @@name@@ refs (kept only while writing them out would pass TEMPLATE_MAX). */
    snippets?: Record<string, string>;
  };
}

export interface LanguageBundle {
  egaLanguage: {
    v: 1;
    exportedAt: string;
    language: v.InferOutput<typeof customLanguageSchema>;
    /** Absent when the language runs the Translate prompt. */
    prompt?: LanguagePrompt;
    /** Present when the prompt still holds @@name@@ refs. */
    snippets?: Record<string, string>;
  };
}

export interface GlossaryBundle {
  egaGlossary: { v: 1; exportedAt: string; entries: GlossaryEntryFromSchema[] };
}

/** Version 2 adds the Translate prompt, null when it is the shipped one; a version 1 file leaves it alone. */
export interface TasksBundle {
  egaTasks: {
    v: 2;
    exportedAt: string;
    customTasks: CustomTask[];
    taskOverrides: Record<string, TaskEdit>;
    disabledTasks: string[];
    translatePrompt: { system: string; user: string; templateVersion: number } | null;
    /** Present when an exported prompt still holds @@name@@ refs. */
    snippets?: Record<string, string>;
  };
}

// Literal loopback only: a hostname that resolves public at save time can point at 127.0.0.1 later.
const loopbackUrlSchema = (field: string) =>
  v.pipe(
    v.string(),
    v.maxLength(256),
    v.check(
      (raw: string) => raw === '' || isLoopbackUrl(raw),
      `${field} must be http(s) pointing at localhost / 127.0.0.1 / ::1`,
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
    v.record(v.pipe(v.string(), v.maxLength(64)), languagePromptSchema),
    () => ({}),
  ),
  temperature: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(2)), 0.2),
  maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(8192)), 2048),
  // Off keeps a thinking model as quiet as it allows; backends without an effort setting ignore it.
  effort: v.optional(v.picklist(EFFORT_LEVELS), 'off'),
  templateVersion: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0)),
    CURRENT_TEMPLATE_VERSION,
  ),
  // Equal to CURRENT_TEMPLATE_VERSION hides the mismatch banner even when the user's template is older.
  templateVersionAcknowledged: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  // Written out into the prompts on read (inlineSnippets); left here only while a prompt would pass TEMPLATE_MAX with them written out.
  snippets: v.optional(snippetsSchema, () => ({})),
  retryCount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3)), 1),
  backendProbeTtlMs: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(5_000), v.maxValue(300_000)),
    30_000,
  ),
  debugLogLevel: v.optional(v.picklist(['silent', 'error', 'warn', 'info', 'debug']), 'warn'),
  // Sorted least-specific first, so the most-specific rule sits closest to the end of the system prompt.
  rules: v.optional(v.pipe(v.array(ruleSchema), v.maxLength(RULES_MAX)), () => []),
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
  /** The first in-place replace shows how to undo it; later ones stay quiet. */
  inlineUndoHintShown: v.optional(v.boolean(), false),
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
  ollamaUrl: v.optional(loopbackUrlSchema('ollamaUrl')),
  localServerUrl: v.optional(loopbackUrlSchema('localServerUrl')),
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
    v.pipe(
      v.array(glossaryEntrySchema),
      v.maxLength(GLOSSARY_MAX, `glossary capped at ${GLOSSARY_MAX} entries`),
    ),
    () => [],
  ),
  advanced: v.optional(advancedShape, () => v.parse(advancedShape, {})),
  defaultTask: v.optional(TaskIdSchema, 'translate'),
  // Written whole by one helper, never deep-merged: a merge would bring back a field the user reset.
  taskOverrides: v.optional(v.record(v.picklist(ALL_TASKS), taskEditSchema), () => ({})),
  disabledTasks: v.optional(v.pipe(v.array(TaskIdSchema), v.maxLength(TASK_IDS_MAX)), () => []),
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

/** `advanced` keys a past version persisted: saved recipes, custom-variable notes and the old effort key. Dropped before the parse, so they never send the section into repair. */
const RETIRED_ADVANCED_KEYS: readonly string[] = [
  'userRecipes',
  'customSlotDescriptions',
  'reasoningEffort',
];

/** Top-level keys a past version persisted. `settingsSchema` is strict, so a stored
 *  row still carrying one fails the first parse and enters the repair loop. */
const RETIRED_SETTINGS_KEYS: readonly string[] = [
  'batchMinLength',
  'batchMaxLength',
  'taskBackends',
  'taskTemperatures',
  'taskMaxTokens',
  'taskReasoningEfforts',
];

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

/** A valid id no task has, so a rule scoped to it matches nothing. */
export const UNKNOWN_TASK_ID = 'unknown-task';

/** The clamp would drop a scope with no valid id, and an empty scope means every task; so a bad id becomes one that matches nothing. */
function closeRuleScopes(advanced: unknown): unknown {
  if (!isPlainObject(advanced) || !Array.isArray(advanced['rules'])) return advanced;
  const rules = advanced['rules'].map((r: unknown) => {
    if (!isPlainObject(r) || !isPlainObject(r['scope']) || r['scope']['tasks'] === undefined)
      return r;
    const raw = r['scope']['tasks'];
    // An empty stored scope is a real "every task" rule, not a broken one.
    if (Array.isArray(raw) && raw.length === 0) return r;
    const valid = Array.isArray(raw) ? raw.filter((t: unknown) => v.is(TaskIdSchema, t)) : [];
    const tasks = valid.length > 0 ? [...new Set(valid)] : [UNKNOWN_TASK_ID];
    return { ...r, scope: { ...r['scope'], tasks } };
  });
  return { ...advanced, rules };
}

/** The old per-task maps become task edits: a MOVE, never a copy, so a reset of the new field stays reset. The old value wins, field by field: only an older build or a hand-edited file still writes it. */
function liftLegacyTaskFields(out: Record<string, unknown>): void {
  const adv = isPlainObject(out['advanced']) ? { ...out['advanced'] } : null;
  const templates = adv && isPlainObject(adv['taskTemplates']) ? adv['taskTemplates'] : {};
  const efforts = isPlainObject(out['taskReasoningEfforts']) ? out['taskReasoningEfforts'] : {};
  const overrides: Record<string, unknown> = isPlainObject(out['taskOverrides'])
    ? { ...out['taskOverrides'] }
    : {};
  const snippets = Object.fromEntries(
    Object.entries(adv && isPlainObject(adv['snippets']) ? adv['snippets'] : {}).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
  const editOf = (t: string): Record<string, unknown> =>
    isPlainObject(overrides[t]) ? { ...overrides[t] } : {};
  // Translate and Explain run the language template, so their old entries never ran and are dropped.
  for (const t of ALL_TASKS.filter((x) => x !== 'translate' && x !== 'explain')) {
    const tpl = templates[t];
    if (!isPlainObject(tpl)) continue;
    const edit = editOf(t);
    const halves = (['system', 'user'] as const).filter((h) => typeof tpl[h] === 'string');
    for (const h of halves) edit[h] = tpl[h];
    // That template read the page context through its slot, so it keeps getting it.
    if (
      edit['pageContext'] === undefined &&
      halves.some((h) => resolveSnippets(String(tpl[h]), snippets).includes('{{context}}'))
    ) {
      edit['pageContext'] = true;
    }
    if (halves.length > 0) overrides[t] = edit;
  }
  for (const t of ALL_TASKS) {
    if (typeof efforts[t] === 'string') overrides[t] = { ...editOf(t), effort: efforts[t] };
  }
  if (Object.keys(overrides).length > 0) out['taskOverrides'] = overrides;
  delete out['taskReasoningEfforts'];
  if (adv) {
    delete adv['taskTemplates'];
    out['advanced'] = adv;
  }
}

/** Writes every `@@name@@` out into the prompts and drops the snippet map, all or nothing: if any prompt would pass TEMPLATE_MAX, nothing changes and the runtime keeps expanding them. */
function inlineSnippets(out: Record<string, unknown>): void {
  if (!isPlainObject(out['advanced'])) return;
  const adv: Record<string, unknown> = { ...out['advanced'] };
  out['advanced'] = adv;
  // The entries and bodies the clamp keeps (long bodies cut, proto names dropped), so the text matches what the runtime expanded.
  const snippets = Object.fromEntries(
    Object.entries(isPlainObject(adv['snippets']) ? adv['snippets'] : {})
      .filter(
        (e): e is [string, string] =>
          typeof e[1] === 'string' &&
          e[0].length >= 1 &&
          e[0].length <= SNIPPET_NAME_MAX &&
          !PROTO_KEYS.has(e[0]),
      )
      .map(([k, body]) => [k, body.slice(0, SNIPPET_BODY_MAX)]),
  );
  if (Object.keys(snippets).length === 0) {
    delete adv['snippets'];
    return;
  }
  const holders: Record<string, unknown>[] = [];
  if (isPlainObject(adv['promptTemplate'])) holders.push(adv['promptTemplate']);
  if (isPlainObject(adv['perPresetTemplates'])) {
    for (const t of Object.values(adv['perPresetTemplates'])) if (isPlainObject(t)) holders.push(t);
  }
  if (isPlainObject(out['taskOverrides'])) {
    for (const t of Object.values(out['taskOverrides'])) if (isPlainObject(t)) holders.push(t);
  }
  const writes: [Record<string, unknown>, 'system' | 'user', string][] = [];
  for (const h of holders) {
    for (const half of ['system', 'user'] as const) {
      const text = h[half];
      if (typeof text !== 'string') continue;
      const expanded = expandSnippets(text, snippets);
      if (text.length > TEMPLATE_MAX || expanded.length > TEMPLATE_MAX) return;
      if (expanded !== text) writes.push([h, half, expanded]);
    }
  }
  // Copy each written holder, so the caller's raw row is never mutated.
  const copies = new Map<Record<string, unknown>, Record<string, unknown>>();
  for (const [h, half, text] of writes) {
    const copy = copies.get(h) ?? { ...h };
    copy[half] = text;
    copies.set(h, copy);
  }
  const swap = (t: unknown): unknown => (isPlainObject(t) ? (copies.get(t) ?? t) : t);
  if (isPlainObject(adv['promptTemplate'])) adv['promptTemplate'] = swap(adv['promptTemplate']);
  if (isPlainObject(adv['perPresetTemplates'])) {
    adv['perPresetTemplates'] = Object.fromEntries(
      Object.entries(adv['perPresetTemplates']).map(([k, t]) => [k, swap(t)]),
    );
  }
  if (isPlainObject(out['taskOverrides'])) {
    out['taskOverrides'] = Object.fromEntries(
      Object.entries(out['taskOverrides']).map(([k, t]) => [k, swap(t)]),
    );
  }
  delete adv['snippets'];
}

/** Fixes needed before the first parse (proto keys, the old per-task maps, snippets, retired keys, rule scopes, sitePrefs shape and 500-origin cap); clampToSchema does the rest. */
function preCleanForStorage(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = stripProtoKeys({ ...raw });
  liftLegacyTaskFields(out);
  inlineSnippets(out);
  for (const k of RETIRED_SETTINGS_KEYS) delete out[k];
  if (isPlainObject(out['advanced'])) {
    const adv: Record<string, unknown> = { ...out['advanced'] };
    // The old key defaulted to medium and every save wrote it, so only a picked low or high carries over.
    const old = adv['reasoningEffort'];
    if (adv['effort'] === undefined && (old === 'low' || old === 'high')) adv['effort'] = old;
    for (const k of RETIRED_ADVANCED_KEYS) delete adv[k];
    out['advanced'] = adv;
  }
  if (out['advanced'] !== undefined) out['advanced'] = closeRuleScopes(out['advanced']);
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
