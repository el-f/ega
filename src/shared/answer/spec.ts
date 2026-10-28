import type { DetectedVariety } from '../types';
import { TASK_FORMATS, TRANSLATE_FORMAT, PLAIN_CONTRACT, CARD_CONTRACT } from './formats-v1';

export type FieldKind = 'text' | 'list' | 'score' | 'yesno' | 'choice' | 'language' | 'languages';
export type FieldRole = 'main' | 'notes' | 'meta' | 'details' | 'hidden';

export interface AnswerField {
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly role: FieldRole;
  readonly required: boolean;
  readonly guide?: string;
  readonly choices?: readonly string[];
  readonly maxChars?: number;
  readonly when?: 'explain';
}

export interface AnswerSpec {
  readonly id: string;
  readonly version: number;
  readonly fields: readonly AnswerField[];
  readonly rules?: readonly string[];
  readonly pinned?: { readonly text: string; readonly sep: ' ' | '\n' | '\n\n' };
  readonly join: 'template' | 'after-build';
}

type ValueOf<F extends AnswerField> = F['kind'] extends 'list'
  ? string[]
  : F['kind'] extends 'score'
    ? number
    : F['kind'] extends 'yesno'
      ? boolean
      : F['kind'] extends 'languages'
        ? DetectedVariety[]
        : F extends { kind: 'choice'; choices: readonly string[] }
          ? F['choices'][number]
          : string;
export type AnswerOf<S extends AnswerSpec> = {
  [
    F in S['fields'][number] as F extends { required: true; when?: never } ? F['key'] : never
  ]: ValueOf<F>;
} & {
  [
    F in S['fields'][number] as F extends { required: true; when?: never } ? never : F['key']
  ]?: ValueOf<F>;
};

const ANSWER = {
  key: 'answer',
  label: 'Answer',
  kind: 'text',
  role: 'main',
  required: true,
} as const;
const MAIN = { ...ANSWER, key: 'translation' } as const;
const NOTES = {
  key: 'explain',
  label: 'Notes',
  kind: 'text',
  role: 'notes',
  required: true,
} as const;
const CONFIDENCE = {
  key: 'confidence',
  label: 'Confidence',
  kind: 'score',
  role: 'meta',
  required: true,
  guide:
    '0..1 — 1.0 = unambiguous, 0.8 = one clearly dominant reading, 0.5 = genuinely ambiguous between two readings, 0.2 = guessing — penalise for every [?…] token used',
} as const;
export const TRANSLATE_SPEC = {
  id: 'translate',
  version: 1,
  join: 'template',
  pinned: TRANSLATE_FORMAT,
  fields: [
    MAIN,
    CONFIDENCE,
    {
      key: 'detectedLang',
      label: 'Source language',
      kind: 'language',
      role: 'meta',
      required: false,
    },
    {
      key: 'detectedDetail',
      label: 'Language detail',
      kind: 'text',
      role: 'meta',
      required: false,
      maxChars: 199,
    },
    {
      key: 'detectedLangs',
      label: 'Source languages',
      kind: 'languages',
      role: 'meta',
      required: false,
    },
    { ...NOTES, label: 'Context & subtext', when: 'explain' },
  ],
} as const satisfies AnswerSpec;

const BUILT_INS = {
  translate: TRANSLATE_SPEC,
  explain: TRANSLATE_SPEC,
  summarize: {
    id: 'summarize',
    version: 2,
    join: 'template',
    pinned: TASK_FORMATS.summarize,
    fields: [{ ...ANSWER, guide: 'your summary as a string' }],
  },
  reword: {
    id: 'reword',
    version: 2,
    join: 'template',
    pinned: TASK_FORMATS.reword,
    fields: [
      { ...ANSWER, guide: "your rewrite as a string, in the input's language" },
      {
        ...NOTES,
        guide:
          'one short sentence naming the tone and what changed; if the text already has this tone, say so',
      },
    ],
  },
  grammar: {
    id: 'grammar',
    version: 2,
    join: 'template',
    pinned: TASK_FORMATS.grammar,
    fields: [
      { ...ANSWER, guide: 'corrected text as a string' },
      {
        ...NOTES,
        guide:
          'newline-separated list of corrections, one per line, format: "was X → now Y (reason)"; if nothing needed fixing, one line saying so',
      },
    ],
  },
  'suggest-replies': {
    id: 'suggest-replies',
    version: 2,
    join: 'template',
    pinned: TASK_FORMATS['suggest-replies'],
    fields: [
      {
        ...ANSWER,
        guide:
          'The three replies MUST be separated by a blank line in the answer field, in the order casual → neutral → polite',
      },
    ],
  },
  ask: {
    id: 'ask',
    version: 2,
    join: 'template',
    pinned: TASK_FORMATS.ask,
    fields: [{ ...ANSWER, guide: 'your answer as a string' }],
  },
  ocr: {
    id: 'ocr',
    version: 1,
    join: 'template',
    pinned: {
      text: 'Return JSON ONLY: {"translation": <translation or passthrough as string>, "confidence": <0..1 — 1.0 = unambiguous reading, 0.8 = one clearly dominant reading, 0.5 = partially occluded or stylised glyphs, 0.2 = heavy guessing>, "detectedLang": <language code or label of the source text>}.',
      sep: ' ',
    },
    fields: [
      { ...MAIN, guide: 'translation or passthrough as string' },
      {
        ...CONFIDENCE,
        guide:
          '0..1 — 1.0 = unambiguous reading, 0.8 = one clearly dominant reading, 0.5 = partially occluded or stylised glyphs, 0.2 = heavy guessing',
      },
      {
        key: 'detectedLang',
        label: 'Source language',
        kind: 'language',
        role: 'meta',
        required: true,
        guide: 'language code or label of the source text',
      },
    ],
  },
} as const satisfies Record<string, AnswerSpec>;

function customPreset(id: string, text: string, fields: readonly AnswerField[]): AnswerSpec {
  return {
    id,
    version: 1,
    join: 'after-build',
    pinned: { text, sep: '\n\n' },
    fields,
  };
}

export const CUSTOM_PRESETS = {
  'answer-only': customPreset('answer-only', PLAIN_CONTRACT, [{ ...ANSWER, guide: 'your answer' }]),
  'answer-notes': customPreset('answer-notes', CARD_CONTRACT, [
    { ...ANSWER, guide: 'your answer' },
    { ...NOTES, required: false, guide: 'short notes' },
  ]),
} as const satisfies Record<string, AnswerSpec>;

/** Only a built-in id reaches here; custom tasks carry their own spec or preset. */
export function answerSpecFor(id: string): AnswerSpec {
  if (Object.hasOwn(BUILT_INS, id)) return BUILT_INS[id as keyof typeof BUILT_INS];
  throw new Error(`Unknown built-in answer spec: ${id}`);
}

/** The done chunk reads these keys as built-in metadata, so a custom field cannot use them. */
export const META_KEYS: readonly string[] = [
  'confidence',
  'detectedLang',
  'detectedDetail',
  'detectedLangs',
];

/** Shared by the stored-row validator and the editor. Problems name the field the user can fix. */
export function validateSpec(spec: AnswerSpec): string[] {
  const issues: string[] = [];
  const custom = spec.id.startsWith('custom:') || spec.join === 'after-build';
  if (!spec.id || !Number.isInteger(spec.version) || spec.version < 1)
    issues.push('Invalid answer spec version.');
  if (custom && spec.fields.length > 8) issues.push('Use at most 8 answer fields.');
  const mains = spec.fields.filter((f) => f.role === 'main');
  if (mains.length !== 1 || (mains[0]?.kind !== 'text' && mains[0]?.kind !== 'list'))
    issues.push('Choose one text or list field as the main answer.');
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const field of spec.fields) {
    const prefix = field.label || field.key || 'Field';
    if (
      !/^[a-z]\w{0,31}$/.test(field.key) ||
      ['constructor', 'prototype', '__proto__'].includes(field.key) ||
      keys.has(field.key)
    )
      issues.push(`${prefix}: use a unique field key of at most 32 characters.`);
    keys.add(field.key);
    if (!field.label.trim() || field.label.length > 40)
      issues.push(`${prefix}: use a label of 1 to 40 characters.`);
    const label = field.label.trim().toLowerCase();
    if (custom && labels.has(label)) issues.push(`${prefix}: use a unique field name.`);
    labels.add(label);
    if (field.guide !== undefined && (field.guide.length > 200 || /[\r\n]/.test(field.guide)))
      issues.push(`${prefix}: keep guidance on one line of at most 200 characters.`);
    if (custom && META_KEYS.includes(field.key))
      issues.push(
        `${prefix}: the JSON key ${field.key} is kept for Ega's own data; remove this field.`,
      );
    // The done chunk shows explain as notes; the card preset's text note is the one safe shape.
    if (custom && field.key === 'explain' && (field.kind !== 'text' || field.role !== 'notes'))
      issues.push(`${prefix}: the JSON key explain must stay a text field shown in Notes.`);
    if (custom && (field.role === 'meta' || field.when !== undefined))
      issues.push(`${prefix}: metadata and conditional fields are reserved for built-in tasks.`);
    if (
      field.kind === 'choice' &&
      (!field.choices ||
        field.choices.length < 2 ||
        field.choices.length > 12 ||
        field.choices.some((c) => !c.trim()) ||
        new Set(field.choices.map((c) => c.toLowerCase())).size !== field.choices.length)
    )
      issues.push(`${prefix}: add 2 to 12 distinct choices.`);
    if (field.maxChars !== undefined && (!Number.isInteger(field.maxChars) || field.maxChars < 1))
      issues.push(`${prefix}: the character limit must be positive.`);
    if (field.role === 'main' && (!field.required || field.when !== undefined))
      issues.push(`${prefix}: the main answer must always be required.`);
  }
  return issues;
}
