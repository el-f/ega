import type { AnswerField, AnswerSpec, FieldKind, FieldRole } from './spec';

/** One reply part as the Reply section lists it: its name and one plain line. */
export interface ReplyRow {
  readonly key: string;
  readonly label: string;
  readonly line: string;
}

export const KIND_NAMES: Readonly<Record<FieldKind, string>> = {
  text: 'Text',
  list: 'List',
  choice: 'Pick one',
  yesno: 'Yes or no',
  score: 'Score',
  language: 'Language',
  languages: 'Languages',
};

export const ROLE_NAMES: Readonly<Record<FieldRole, string>> = {
  main: 'Main answer',
  notes: 'Notes',
  details: 'About this reply',
  hidden: 'Not shown',
  meta: 'About this reply',
};

// What each shipped spec asks for; "main" and "notes" stand for the field with that role.
const SHIPPED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  translate: {
    main: 'the translation',
    confidence: 'shown as a percent',
    detectedLang: 'when the model can tell',
    detectedDetail: 'only when useful',
    detectedLangs: 'each language, only when the text mixes them',
    notes: 'only when you run Explain',
  },
  summarize: { main: 'the summary' },
  ask: { main: 'the answer to your question' },
  reword: { main: 'the rewritten text, same language', notes: 'the tone and what changed' },
  grammar: { main: 'the corrected text, same language', notes: 'the corrections, one per line' },
  'suggest-replies': { main: 'three replies: casual, neutral, polite' },
  'answer-only': { main: 'the main text' },
  'answer-notes': {
    main: 'the main text',
    notes: 'short notes, only when there is something to note',
  },
};

/** A field of your own in plain words: its kind, where it shows, and "optional" when it may be left out. */
export function describeField(field: AnswerField): string {
  return [
    KIND_NAMES[field.kind],
    ROLE_NAMES[field.role].toLowerCase(),
    ...(field.required ? [] : ['optional']),
  ].join(' · ');
}

/** The parts a spec asks the model for; with `explain`, the parts only Explain asks for show as always there, right after the answer. */
export function describeReply(spec: AnswerSpec, options: { explain?: boolean } = {}): ReplyRow[] {
  const lines = SHIPPED[spec.id] ?? {};
  const explain = options.explain === true;
  const rank = (field: AnswerField): number =>
    field.role === 'main' ? 0 : explain && field.when === 'explain' ? 1 : 2;
  return [...spec.fields]
    .sort((a, b) => rank(a) - rank(b))
    .map((field) => {
      const slot = field.role === 'main' || field.role === 'notes' ? field.role : field.key;
      const line =
        explain && field.when === 'explain'
          ? 'shown under the translation'
          : (lines[slot] ?? describeField(field));
      return { key: field.key, label: field.label, line };
    });
}
