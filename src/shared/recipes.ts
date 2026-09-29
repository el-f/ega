import * as v from 'valibot';
import { ALL_TASKS, ALL_TONES, type Task, type Tone } from './task-prompts';
import { RULE_BODY_MAX } from './settings-schema';
import type { PromptTemplate } from './types';

// Mirrors `RuleCategory` from ./rules; the union body is identical.
export type RuleCategory = 'always' | 'never' | 'prefer' | 'format' | 'unknown';

export interface RecipeRule {
  body: string;
  category: RuleCategory;
  scopeSites?: readonly string[];
}

export interface Recipe {
  id: string;
  task: Task;
  label: string;
  description: string;
  template?: PromptTemplate;
  rules?: readonly RecipeRule[];
  generationParams?: {
    temperature?: number;
    maxTokens?: number;
    tone?: Tone;
  };
}

// Rule bodies are deduped against users' stored rules by exact text (filterDupeRecipeRules), so never reword or respell them.
export const BUNDLED_RECIPES: readonly Recipe[] = Object.freeze([
  // ---- Translate (4) ----
  {
    id: 'translate-keep-slang',
    task: 'translate',
    label: 'Keep slang verbatim',
    description:
      'Preserve slang, abbreviations, and informal markers verbatim instead of normalizing to a formal target register.',
    rules: [
      {
        body: 'Always preserve slang words, abbreviations, and informal markers verbatim — do not normalise.',
        category: 'always',
      },
      {
        body: 'Never invent untranslated words — if uncertain, wrap in [?…] markers.',
        category: 'never',
      },
    ],
  },
  {
    id: 'translate-formal-target',
    task: 'translate',
    label: 'Formal target',
    description:
      'Translate informal source text into a formal target register regardless of source tone.',
    rules: [
      {
        body: 'Always use formal register in the target language regardless of source register.',
        category: 'always',
      },
      {
        body: 'Prefer full sentences and precise vocabulary over colloquial phrasing.',
        category: 'prefer',
      },
    ],
  },
  {
    id: 'translate-match-source-tone',
    task: 'translate',
    label: 'Match source tone exactly',
    description:
      'Mirror the source register, formality, and emotional coloring as closely as the target language allows.',
    rules: [
      {
        body: 'Always match the source register and emotional tone in the target — do not soften, formalise, or sanitise.',
        category: 'always',
      },
    ],
  },
  {
    id: 'translate-bilingual-mode',
    task: 'translate',
    label: 'Bilingual mode (preserve original alongside)',
    description:
      'Return the translation followed by the original source text on a new line, so the reader sees both.',
    rules: [
      {
        body: 'Format output as "<translation>\\n\\n— original: <source>" so the original line is preserved alongside.',
        category: 'format',
      },
    ],
  },

  // ---- Explain (4) ----
  {
    id: 'explain-quick-tldr',
    task: 'explain',
    label: 'Quick tldr',
    description: 'Produce a single-sentence explanation suitable for a hover tooltip.',
    rules: [
      { body: 'Format the explanation as a single sentence under 30 words.', category: 'format' },
      { body: 'Prefer plain language over jargon.', category: 'prefer' },
    ],
    generationParams: { maxTokens: 200 },
  },
  {
    id: 'explain-cultural-anthropologist',
    task: 'explain',
    label: 'Cultural anthropologist',
    description:
      'Explain cultural context, idioms, and references that a non-native reader would miss.',
    rules: [
      {
        body: 'Always surface cultural references, idioms, and historical context that a non-native reader would miss.',
        category: 'always',
      },
      {
        body: 'Never gloss over puns, wordplay, or regional slang — call them out by name.',
        category: 'never',
      },
    ],
  },
  {
    id: 'explain-eli5',
    task: 'explain',
    label: 'Eli5',
    description:
      'Explain like the reader is five — short sentences, everyday vocabulary, concrete analogies.',
    rules: [
      { body: 'Prefer short sentences and everyday vocabulary.', category: 'prefer' },
      {
        body: 'Always use concrete analogies in place of abstract terminology.',
        category: 'always',
      },
      {
        body: 'Never use technical jargon without an inline plain-language gloss.',
        category: 'never',
      },
    ],
  },
  {
    id: 'explain-footnote-brief',
    task: 'explain',
    label: 'Footnote-style brief',
    description:
      'Render the explanation as a compact footnote: 2-3 short paragraphs, citation-style, no headers.',
    rules: [
      { body: 'Format as 2-3 short paragraphs with no headers, no bullets.', category: 'format' },
      {
        body: 'Prefer citation-style attributions ("see X") for external references.',
        category: 'prefer',
      },
    ],
  },

  // ---- Summarize (3) ----
  {
    id: 'summarize-one-line-tweet',
    task: 'summarize',
    label: 'One-line tweet',
    description: 'Compress to a single tweet-length sentence (≤ 280 characters).',
    rules: [
      { body: 'Format the summary as a single sentence under 280 characters.', category: 'format' },
      {
        body: 'Never include hashtags, @-mentions, or emoji unless the source contained them.',
        category: 'never',
      },
    ],
    generationParams: { maxTokens: 120 },
  },
  {
    id: 'summarize-three-bullets',
    task: 'summarize',
    label: 'Three bullets',
    description: 'Three terse bullet points covering the main claims of the source.',
    rules: [
      { body: 'Format as exactly three bullet points, each under 20 words.', category: 'format' },
      { body: 'Never editorialise — state the claims, do not evaluate them.', category: 'never' },
    ],
  },
  {
    id: 'summarize-newsletter-blurb',
    task: 'summarize',
    label: 'Newsletter blurb',
    description:
      'A 2-3 sentence newsletter-style preview that hooks the reader without spoiling the punchline.',
    rules: [
      { body: 'Format as 2-3 sentences in newsletter-preview voice.', category: 'format' },
      { body: 'Prefer a hook in the opening sentence over a topical summary.', category: 'prefer' },
      { body: "Never reveal the source's conclusion or punchline.", category: 'never' },
    ],
  },

  // ---- Reword (4) ----
  {
    id: 'reword-linkedin-polish',
    task: 'reword',
    label: 'LinkedIn polish',
    description:
      'Rewrite as polished LinkedIn-post copy: first-person, professional, lightly aspirational.',
    rules: [
      {
        body: 'Always write in first-person professional voice suitable for LinkedIn.',
        category: 'always',
      },
      {
        body: 'Prefer concrete metrics or outcomes over vague claims of impact.',
        category: 'prefer',
      },
      {
        body: 'Never use buzzword stacks ("synergy", "leverage", "value-add").',
        category: 'never',
      },
    ],
    generationParams: { tone: 'formal' },
  },
  {
    id: 'reword-slack-friendly',
    task: 'reword',
    label: 'Slack-friendly',
    description:
      'Rewrite for a Slack message: short sentences, conversational tone, no email salutations.',
    rules: [
      { body: 'Prefer short sentences and conversational phrasing.', category: 'prefer' },
      {
        body: 'Never include email-style greetings or sign-offs ("Hi team,", "Best,").',
        category: 'never',
      },
    ],
    generationParams: { tone: 'casual' },
  },
  {
    id: 'reword-email-formal',
    task: 'reword',
    label: 'Email-formal',
    description: 'Rewrite as a formal email: greeting, complete sentences, polite sign-off.',
    rules: [
      { body: 'Always include an opening greeting and a polite sign-off.', category: 'always' },
      {
        body: 'Format as full paragraphs — no bullet points unless the source had them.',
        category: 'format',
      },
    ],
    generationParams: { tone: 'formal' },
  },
  {
    id: 'reword-less-corporate',
    task: 'reword',
    label: 'Less corporate',
    description:
      'Strip corporate-speak and replace with plain direct language while preserving meaning.',
    rules: [
      {
        body: 'Never use corporate buzzwords ("circle back", "deliverables", "stakeholders", "leverage").',
        category: 'never',
      },
      { body: 'Prefer concrete verbs over abstract nouns.', category: 'prefer' },
    ],
    generationParams: { tone: 'blunt' },
  },

  // ---- Grammar (3) ----
  {
    id: 'grammar-light-touch',
    task: 'grammar',
    label: 'Light touch (typos only)',
    description:
      'Fix typos and spelling only — leave phrasing, punctuation choices, and voice untouched.',
    rules: [
      {
        body: 'Always limit corrections to typos and obvious spelling mistakes.',
        category: 'always',
      },
      {
        body: 'Never alter punctuation, phrasing, or word choice when the source is grammatically valid.',
        category: 'never',
      },
    ],
  },
  {
    id: 'grammar-heavy-edit',
    task: 'grammar',
    label: 'Heavy edit (full pass)',
    description: 'Full editorial pass: grammar, punctuation, awkward phrasing, run-on sentences.',
    rules: [
      {
        body: 'Always tighten run-on sentences and fix awkward phrasing in addition to grammar.',
        category: 'always',
      },
      { body: 'Prefer active voice over passive where the source allows.', category: 'prefer' },
    ],
  },
  {
    id: 'grammar-preserve-voice',
    task: 'grammar',
    label: 'Preserve voice',
    description:
      "Fix mechanical errors but preserve the author's voice, including intentional stylistic choices.",
    rules: [
      {
        body: 'Always preserve intentional stylistic choices — slang, sentence fragments used for effect, idiosyncratic punctuation.',
        category: 'always',
      },
      { body: "Never normalise the author's voice toward a textbook register.", category: 'never' },
    ],
  },

  // ---- Suggest replies (3) ----
  {
    id: 'replies-three-friendly',
    task: 'suggest-replies',
    label: 'Three friendly',
    description:
      'Three warm, casual reply options — all friendly tone, varying in length and substance.',
    rules: [
      { body: 'Always write all three replies in a warm, casual tone.', category: 'always' },
      {
        body: 'Prefer varying length and substance across the three replies, not just phrasing.',
        category: 'prefer',
      },
    ],
  },
  {
    id: 'replies-three-professional',
    task: 'suggest-replies',
    label: 'Three professional',
    description: 'Three professional reply options suitable for workplace messaging.',
    rules: [
      {
        body: 'Always write all three replies in a professional workplace register.',
        category: 'always',
      },
      { body: 'Never include emoji or slang.', category: 'never' },
    ],
    generationParams: { tone: 'formal' },
  },
  {
    id: 'replies-funny-dismissive-curious',
    task: 'suggest-replies',
    label: 'Funny + dismissive + curious',
    description:
      'One witty reply, one dismissive one-liner, one curious follow-up question. Distinct voices.',
    rules: [
      {
        body: 'Format as exactly three replies in this order: 1) witty/funny, 2) dismissive one-liner, 3) curious follow-up question.',
        category: 'format',
      },
      { body: 'Never blur the three voices — each must read as distinct.', category: 'never' },
    ],
  },
] as const) as readonly Recipe[];

export function serialiseRecipe(r: Recipe): string {
  return btoa(encodeURIComponent(JSON.stringify({ kind: 'ega-recipe', recipe: r })));
}

// A shared payload is untrusted, so every field is gated before it reaches advanced.userRecipes.
const MAX_RULES = 50;
const MAX_TEMPLATE_FIELD = 8000;
const MAX_STRING = 500;

const ruleCategorySchema = v.picklist([
  'always',
  'never',
  'prefer',
  'format',
  'unknown',
] satisfies readonly RuleCategory[]);
const taskSchema = v.picklist(ALL_TASKS);
const toneSchema = v.picklist(ALL_TONES);

const recipeSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_STRING)),
  task: taskSchema,
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_STRING)),
  description: v.pipe(v.string(), v.maxLength(2000)),
  template: v.optional(
    v.object({
      system: v.pipe(v.string(), v.maxLength(MAX_TEMPLATE_FIELD)),
      user: v.pipe(v.string(), v.maxLength(MAX_TEMPLATE_FIELD)),
    }),
  ),
  rules: v.optional(
    v.pipe(
      v.array(
        v.object({
          body: v.pipe(v.string(), v.minLength(1), v.maxLength(RULE_BODY_MAX)),
          category: ruleCategorySchema,
          scopeSites: v.optional(
            v.pipe(v.array(v.pipe(v.string(), v.maxLength(MAX_STRING))), v.maxLength(100)),
          ),
        }),
      ),
      v.maxLength(MAX_RULES),
    ),
  ),
  generationParams: v.optional(
    v.object({
      temperature: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2))),
      maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(16), v.maxValue(8192))),
      tone: v.optional(toneSchema),
    }),
  ),
});

// Mutates in place. Recursive — prototype-pollution payloads can nest the
// poison key arbitrarily deep.
function stripProtoKeys(o: unknown): void {
  if (o === null || typeof o !== 'object') return;
  const rec = o as Record<string, unknown>;
  delete rec['__proto__'];
  delete rec['constructor'];
  delete rec['prototype'];
  for (const val of Object.values(rec)) stripProtoKeys(val);
}

export function deserialiseRecipe(input: string): Recipe | null {
  if (!input) return null;
  try {
    const decoded = decodeURIComponent(atob(input));
    const parsed: unknown = JSON.parse(decoded);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { kind?: unknown }).kind !== 'ega-recipe'
    ) {
      return null;
    }
    const recipe = (parsed as { recipe?: unknown }).recipe;
    if (!recipe || typeof recipe !== 'object') return null;
    stripProtoKeys(recipe);
    const result = v.safeParse(recipeSchema, recipe);
    if (!result.success) return null;
    return result.output as Recipe;
  } catch {
    return null;
  }
}
